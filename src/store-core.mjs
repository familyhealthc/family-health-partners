import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
const randomUUID=()=>globalThis.crypto.randomUUID();
import {developmentEligibility,multiplyRate} from './rewards.mjs';
import {parseCSV,yuanToCents} from './csv.mjs';
import {demoRules,demoPartners,demoCustomers,demoOrders} from './demo.mjs';

const dateNow=()=>new Date().toISOString();
const day=d=>new Date(d).toISOString().slice(0,10);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date());
const plusDays=(d,n)=>new Date(new Date(d).getTime()+n*86400000).toISOString().slice(0,10);
const required=(v,name)=>{if(typeof v!=='string'||!v.trim()||v.length>240)throw new Error(`${name}不能为空且不能超过240字`);return v.trim();};
const choice=(v,values,name)=>{if(!values.includes(v))throw new Error(`${name}无效`);return v;};
const natural=(v,name)=>{if(!Number.isSafeInteger(v)||v<0||v>1e12)throw new Error(`${name}必须为非负整数`);return v;};
const validDate=(v,name)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||day(v)!==v)throw new Error(`${name}日期格式应为YYYY-MM-DD`);return v;};
const bool=(v,name)=>{if(typeof v!=='boolean')throw new Error(`${name}必须为是/否`);return v;};
export const initialRules={confirmed:false,version:0,sellerSkuGate:null,kaAwardUnit:null,dualMode:null,samePartnerDualRole:null,settlementDays:null,teamEnabled:false,plansEnabled:false,promotionEnabled:false,exitEnabled:false};

export function createStoreClass(DatabaseSync) { return class Store {
  constructor(path,{demo=false}={}) {
    this.demo=demo;this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,entitlement_key TEXT NOT NULL,partner_id TEXT NOT NULL,kind TEXT NOT NULL,source_id TEXT NOT NULL,amount INTEGER NOT NULL,earned_at TEXT NOT NULL,available_at TEXT NOT NULL,rule_version INTEGER NOT NULL,batch_id TEXT,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settlements(id TEXT PRIMARY KEY,status TEXT NOT NULL,amount INTEGER NOT NULL,value TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,subject TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,row_count INTEGER NOT NULL,created_at TEXT NOT NULL);`);
    if(!this.meta('rules'))this.setMeta('rules',initialRules);
    if(this.demo&&!this.meta('seeded'))this.seed();
  }
  close(){this.db.close();}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  meta(key){const r=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return r?JSON.parse(r.value):null;}
  setMeta(key,value){this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  all(kind){return this.db.prepare('SELECT value FROM entities WHERE kind=? ORDER BY id').all(kind).map(x=>JSON.parse(x.value));}
  get(kind,id){const r=this.db.prepare('SELECT value FROM entities WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.value):null;}
  put(kind,obj){this.db.prepare('INSERT INTO entities VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,obj.id,JSON.stringify(obj));}
  audit(action,subject,detail={}){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(randomUUID(),action,subject,JSON.stringify(detail),dateNow());}
  markDirty(){this.setMeta('dirty',true);}
  seed(){
    this.transaction(()=>{this.setMeta('rules',demoRules);for(const p of demoPartners)this.put('partners',p);for(const c of demoCustomers)this.put('customers',c);for(const o of demoOrders)this.put('orders',{...o,attribution:this.attribution(o)});this.put('refunds',{id:'DEMO-R001',orderId:'DEMO-260904',goodsCents:100000,commissionCents:6000,completedAt:'2026-09-24'});this.setMeta('seeded',true);this.audit('载入演示数据','demo',{fictional:true});});
    this.reconcile();
  }
  attribution(o){return {buyerPartnerId:this.get('customers',o.buyerId)?.partnerId??null,sellerPartnerId:this.get('customers',o.sellerId)?.partnerId??null};}
  validate(kind,raw){
    const id=required(raw.id,'编号'),note=String(raw.note??'').slice(0,2000);
    if(kind==='partners')return {id,name:required(raw.name,'姓名/名称'),region:required(raw.region,'服务区域'),level:choice(raw.level,['natural','regional','company'],'等级'),status:choice(raw.status,['trial','active','paused','exited'],'状态'),joinedAt:validDate(raw.joinedAt,'加入时间'),note};
    if(kind==='customers'){
      const c={id,name:required(raw.name,'客户名称'),subjectId:required(raw.subjectId,'主体/门店唯一标识'),role:choice(raw.role,['buyer','seller'],'角色'),buyerType:choice(raw.buyerType??'independent',['independent','ka'],'买家类型'),kaGroupId:String(raw.kaGroupId??''),partnerId:raw.partnerId||null,registrationVerified:bool(raw.registrationVerified,'注册核验'),qualificationApproved:bool(raw.qualificationApproved,'资质审核'),publishedSkuCount:natural(raw.publishedSkuCount??0,'SKU数'),kaStoreCount:natural(raw.kaStoreCount??0,'KA门店数'),registeredAt:validDate(raw.registeredAt,'注册时间'),note};
      if(c.role==='buyer'&&c.buyerType==='ka')c.kaGroupId=required(c.kaGroupId,'KA总部唯一标识');
      if(c.partnerId&&!this.get('partners',c.partnerId))throw new Error('合伙人编号不存在，请先建立档案');
      if(this.all('customers').some(x=>x.id!==id&&x.subjectId===c.subjectId&&x.role===c.role))throw new Error('相同主体/门店和角色已经登记，不能重复计奖');
      return c;
    }
    if(kind==='orders'){
      const o={id,buyerId:required(raw.buyerId,'买家编号'),sellerId:required(raw.sellerId,'卖家编号'),goodsCents:natural(raw.goodsCents,'商品金额'),commissionCents:raw.commissionCents===null?null:natural(raw.commissionCents,'平台佣金'),commissionVerified:bool(raw.commissionVerified,'佣金核验'),completedAt:validDate(raw.completedAt,'订单完成时间'),status:choice(raw.status,['completed','pending','cancelled'],'订单状态'),category:String(raw.category??'未分类').slice(0,80)};
      if(this.get('customers',o.buyerId)?.role!=='buyer'||this.get('customers',o.sellerId)?.role!=='seller')throw new Error('买家或卖家编号不存在，或角色不匹配');
      if(o.commissionCents!==null&&o.commissionCents>o.goodsCents)throw new Error('平台佣金不能高于商品金额');
      return {...o,attribution:this.attribution(o)};
    }
    if(kind==='refunds'){
      const r={id,orderId:required(raw.orderId,'原订单编号'),goodsCents:natural(raw.goodsCents,'退款商品额'),commissionCents:natural(raw.commissionCents,'退款佣金冲减'),completedAt:validDate(raw.completedAt,'退款完成时间')},o=this.get('orders',r.orderId);
      if(!o)throw new Error('原订单不存在');
      if(r.completedAt<o.completedAt)throw new Error('退款完成时间不能早于订单完成时间');
      const other=this.all('refunds').filter(x=>x.orderId===o.id&&x.id!==r.id);
      if(other.reduce((s,x)=>s+x.goodsCents,0)+r.goodsCents>o.goodsCents)throw new Error('累计退款商品金额超过原订单');
      if(o.commissionCents===null||other.reduce((s,x)=>s+x.commissionCents,0)+r.commissionCents>o.commissionCents)throw new Error('累计佣金冲减超过原佣金，或原佣金缺失');
      return r;
    }
    throw new Error('不支持的数据类型');
  }
  saveEntity(kind,raw){return this.transaction(()=>{
    const existing=this.get(kind,raw.id);
    if(existing&&['orders','refunds'].includes(kind))throw new Error('交易事实已存在，请通过退款冲减保留历史，不覆盖原订单');
    const item=this.validate(kind,raw);
    if(existing&&kind==='customers'){
      if(existing.subjectId!==item.subjectId||existing.role!==item.role)throw new Error('已登记客户的主体和角色不能修改');
      const used=this.all('orders').some(o=>o.buyerId===item.id||o.sellerId===item.id)||this.db.prepare('SELECT id FROM ledger WHERE source_id=? LIMIT 1').get(item.id);
      if(used&&existing.partnerId!==item.partnerId)throw new Error('客户已有订单或奖励，归属已锁定；本版暂不支持迁移归属');
      if(existing.developmentRules)item.developmentRules=existing.developmentRules;
    }
    this.put(kind,item);this.markDirty();this.audit(existing?'更新档案':'新增档案',`${kind}:${item.id}`,{before:existing,after:item});return item;
  });}
  saveRules(raw){
    const rules={...initialRules,version:this.meta('rules').version+1,confirmed:true,sellerSkuGate:bool(raw.sellerSkuGate,'卖家SKU门槛'),kaAwardUnit:choice(raw.kaAwardUnit,['headquarters','store'],'KA计奖单位'),dualMode:choice(raw.dualMode,['both','buyer_priority'],'双边分润'),samePartnerDualRole:bool(raw.samePartnerDualRole,'同人叠加'),settlementDays:natural(raw.settlementDays,'结算天数')};
    if(rules.settlementDays<30||rules.settlementDays>45)throw new Error('结算周期应为30至45天');
    if(raw.confirmed!==true)throw new Error('请确认上述业务口径后保存');
    return this.transaction(()=>{const before=this.meta('rules');this.setMeta('rules',rules);this.markDirty();this.audit('确认奖励规则',`v${rules.version}`,{before,after:rules});return rules;});
  }
  verifyCommission(id,{commissionCents,evidenceRef}){return this.transaction(()=>{
    const order=this.get('orders',id);if(!order)throw new Error('订单不存在');
    if(order.rewardRules)throw new Error('订单已经计奖，佣金修正须使用有凭据的调整流程');
    natural(commissionCents,'实际平台佣金');if(commissionCents>order.goodsCents)throw new Error('平台佣金不能高于商品金额');
    evidenceRef=required(evidenceRef,'佣金凭据编号');
    const after={...order,commissionCents,commissionVerified:true,commissionEvidenceRef:evidenceRef};
    this.put('orders',after);this.markDirty();this.audit('核验并补录平台佣金',id,{before:order,after,evidenceRef});return after;
  });}
  netOrder(o){const refunds=this.all('refunds').filter(x=>x.orderId===o.id);return {...o,netGoodsCents:o.goodsCents-refunds.reduce((s,x)=>s+x.goodsCents,0),netCommissionCents:o.commissionCents===null?null:o.commissionCents-refunds.reduce((s,x)=>s+x.commissionCents,0),refundCount:refunds.length,lastRefundAt:refunds.map(x=>x.completedAt).sort().at(-1)};}
  reconcile(){return this.transaction(()=>{
    const rules=this.meta('rules'),blockers=[],targets=new Map(),orders=this.all('orders').map(o=>this.netOrder(o)),customers=this.all('customers'),processedKa=new Set();
    const target=(key,partnerId,kind,sourceId,amount,earnedAt,policy)=>{if(!partnerId)return;targets.set(key,{key,partnerId,kind,sourceId,amount,earnedAt,availableAt:plusDays(earnedAt,policy.settlementDays),ruleVersion:policy.version});};
    if(!rules.confirmed){this.setMeta('blockers',[{sourceId:'规则配置',reason:'请先确认开发奖、KA单位、分润叠加和结算周期'}]);return {created:0,blocked:1};}
    for(const c of customers){
      if(!c.partnerId)continue;
      const policy=c.developmentRules??rules;
      let members=[c],keyPrefix=`development:${c.id}`;
      if(c.role==='buyer'&&c.buyerType==='ka'&&policy.kaAwardUnit==='headquarters'){
        const groupId=c.kaGroupId||c.subjectId;
        if(processedKa.has(groupId))continue;processedKa.add(groupId);
        members=customers.filter(x=>x.role==='buyer'&&x.buyerType==='ka'&&(x.kaGroupId||x.subjectId)===groupId);
        if(new Set(members.map(x=>x.partnerId).filter(Boolean)).size>1){blockers.push({sourceId:groupId,reason:'同一KA总部对应多个开发合伙人，开发奖暂停，需先核对归属'});continue;}
        keyPrefix=`development:ka:${groupId}`;
      }
      const memberIds=new Set(members.map(x=>x.id));
      const related=orders.filter(o=>o.status==='completed'&&(c.role==='seller'?o.sellerId===c.id:memberIds.has(o.buyerId))).sort((a,b)=>a.completedAt.localeCompare(b.completedAt)||a.id.localeCompare(b.id));
      const threshold=c.role==='seller'||c.buyerType==='ka'?100000:50000;
      const eligible=related.find(o=>o.netGoodsCents>=threshold);
      const result=developmentEligibility({role:c.role,registrationVerified:members.some(x=>x.registrationVerified),qualificationApproved:c.qualificationApproved,publishedSkuCount:c.role==='seller'&&!policy.sellerSkuGate?Math.max(c.publishedSkuCount,10):c.publishedSkuCount,buyerType:c.buyerType,verifiedKaStoreCount:Math.max(...members.map(x=>x.kaStoreCount)),kaAwardUnit:policy.kaAwardUnit,firstOrderCompleted:!!eligible&&(c.role!=='seller'||c.publishedSkuCount>=10),firstOrderNetGoodsCents:eligible?.netGoodsCents??0});
      for(const milestone of result.milestones)target(`${keyPrefix}:${milestone.stage}`,c.partnerId,'development',c.id,milestone.cumulativeAwardCents,milestone.stage==='first_trade'?(eligible?.completedAt??c.registeredAt):members.map(x=>x.registeredAt).sort()[0],policy);
      if(result.totalEligibleCents>0)for(const member of members)if(!member.developmentRules)this.put('customers',{...member,developmentRules:policy});
    }
    for(const o of orders){
      if(o.status!=='completed')continue;
      if(!o.commissionVerified||o.netCommissionCents===null){blockers.push({sourceId:o.id,reason:'缺少已核验的平台佣金事实，订单分润暂停'});continue;}
      const policy=o.rewardRules??rules;
      let {sellerPartnerId:s,buyerPartnerId:b}=o.attribution;
      if(policy.dualMode==='buyer_priority'&&b)s=null;
      if(s&&s===b&&!policy.samePartnerDualRole)s=null;
      if(s)target(`commission:${o.id}:seller:${s}`,s,'commission',o.id,multiplyRate(o.netCommissionCents,2000),o.completedAt,policy);
      if(b)target(`commission:${o.id}:buyer:${b}`,b,'commission',o.id,multiplyRate(o.netCommissionCents,3000),o.completedAt,policy);
      if(!o.rewardRules){const stored=this.get('orders',o.id);this.put('orders',{...stored,rewardRules:policy});}
    }
    let created=0;
    for(const t of targets.values()){
      const prior=this.db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM ledger WHERE entitlement_key=?').get(t.key).total;
      const delta=t.amount-prior;
      if(delta===0)continue;
      this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),t.key,t.partnerId,t.kind,t.sourceId,delta,t.earnedAt,delta<0?today():t.availableAt,t.ruleVersion,null,dateNow());created++;
    }
    this.setMeta('blockers',blockers);this.setMeta('dirty',false);this.setMeta('lastReconciledAt',dateNow());this.audit('核算奖励','ledger',{created,blocked:blockers.length});return {created,blocked:blockers.length};
  });}
  ledger(){return this.db.prepare('SELECT * FROM ledger ORDER BY created_at DESC,rowid DESC').all().map(r=>({...r,partnerName:this.get('partners',r.partner_id)?.name??r.partner_id,sourceName:this.get('customers',r.source_id)?.name??r.source_id}));}
  settlements(){return this.db.prepare('SELECT * FROM settlements ORDER BY created_at DESC').all().map(r=>({...r,...JSON.parse(r.value)}));}
  createSettlement(asOf){validDate(asOf,'结算截止日');if(asOf>today())throw new Error('结算截止日不能晚于今天');return this.transaction(()=>{
    if(!this.meta('rules').confirmed||this.meta('dirty'))throw new Error('请先确认规则并重新核算奖励');
    const rows=this.db.prepare('SELECT * FROM ledger WHERE batch_id IS NULL AND (available_at<=? OR amount<0)').all(asOf);
    const grouped=new Map();for(const r of rows){if(!grouped.has(r.partner_id))grouped.set(r.partner_id,[]);grouped.get(r.partner_id).push(r);}
    const eligible=[...grouped].filter(([id,items])=>items.reduce((s,x)=>s+x.amount,0)>0&&this.get('partners',id)?.status!=='paused');
    if(!eligible.length)throw new Error('没有到期且净额为正的待结算奖励');
    const id='ST-'+today().replaceAll('-','')+'-'+randomUUID().slice(0,6).toUpperCase(),lines=eligible.map(([partnerId,items])=>({partnerId,partnerName:this.get('partners',partnerId)?.name,amount:items.reduce((s,x)=>s+x.amount,0),entryIds:items.map(x=>x.id)})),amount=lines.reduce((s,x)=>s+x.amount,0);
    this.db.prepare('INSERT INTO settlements VALUES(?,?,?,?,?)').run(id,'draft',amount,JSON.stringify({asOf,lines}),dateNow());
    for(const line of lines)for(const entryId of line.entryIds)this.db.prepare('UPDATE ledger SET batch_id=? WHERE id=? AND batch_id IS NULL').run(id,entryId);
    this.audit('生成结算草稿',id,{amount,partners:lines.length});return {id,amount};
  });}
  updateSettlement(id,{action,reference}){return this.transaction(()=>{
    const row=this.db.prepare('SELECT * FROM settlements WHERE id=?').get(id);if(!row)throw new Error('结算单不存在');
    const value=JSON.parse(row.value);let status;
    if(action==='cancel'&&['draft','approved'].includes(row.status)){status='cancelled';this.db.prepare('UPDATE ledger SET batch_id=NULL WHERE batch_id=?').run(id);}
    else if(action==='approve'&&row.status==='draft'){
      if(this.meta('dirty'))throw new Error('数据有更新，请重新核算，并取消旧草稿后重新生成');
      for(const line of value.lines){if(this.db.prepare('SELECT id FROM ledger WHERE partner_id=? AND batch_id IS NULL AND amount<0 LIMIT 1').get(line.partnerId))throw new Error('该合伙人存在新的退款冲减，请取消草稿后重新生成');}
      status='approved';value.approvedAt=dateNow();
    }else if(action==='record_paid'&&row.status==='approved'){
      if(this.meta('dirty'))throw new Error('数据有更新，请先核算并处理退款调整');
      for(const line of value.lines){if(this.db.prepare('SELECT id FROM ledger WHERE partner_id=? AND batch_id IS NULL AND amount<0 LIMIT 1').get(line.partnerId))throw new Error('存在新的退款冲减，请先处理结算调整');}
      value.paymentReference=required(reference,'线下付款凭证编号');status='paid';value.paidAt=dateNow();
    }else throw new Error('当前结算状态不允许此操作');
    this.db.prepare('UPDATE settlements SET status=?,value=? WHERE id=?').run(status,JSON.stringify(value),id);this.audit(action==='record_paid'?'记录线下付款':action==='approve'?'审核结算':'取消结算草稿',id,{status,reference:value.paymentReference});return {id,status};
  });}
  importPreview(kind,text){
    if(!['customers','orders','refunds'].includes(kind))throw new Error('请选择客户、订单或退款导入');
    const rows=parseCSV(text),errors=[],items=[];
    const b=v=>{if(!['true','false','是','否','1','0'].includes(v))throw new Error('是/否字段应填写true或false');return ['true','是','1'].includes(v);};
    // A rollback-only transaction validates references and cumulative refunds across rows.
    this.db.exec('SAVEPOINT import_preview');
    let duplicateCount=0;
    try{rows.forEach((raw,i)=>{try{
      const existing=this.get(kind,raw.id);
      let mapped;
      if(kind==='customers')mapped={...raw,registrationVerified:b(raw.registrationVerified),qualificationApproved:b(raw.qualificationApproved),publishedSkuCount:Number(raw.publishedSkuCount||0),kaStoreCount:Number(raw.kaStoreCount||0)};
      else if(kind==='orders')mapped={...raw,goodsCents:yuanToCents(raw.goodsYuan),commissionCents:raw.commissionYuan===''?null:yuanToCents(raw.commissionYuan),commissionVerified:b(raw.commissionVerified)};
      else mapped={...raw,goodsCents:yuanToCents(raw.goodsYuan),commissionCents:yuanToCents(raw.commissionYuan)};
      const item=this.validate(kind,mapped);
      if(existing){if(Object.keys(item).filter(k=>k!=='attribution').some(k=>JSON.stringify(existing[k]??'')!==JSON.stringify(item[k]??'')))throw new Error('同编号记录内容与已保存数据不一致，不能作为重复行跳过');duplicateCount++;return;}
      this.put(kind,item);items.push(item);
    }catch(e){errors.push({row:i+2,message:e.message});}});}finally{this.db.exec('ROLLBACK TO import_preview; RELEASE import_preview');}
    const hash=bytesToHex(sha256(new TextEncoder().encode(kind+'\0'+text)));
    return {kind,hash,total:rows.length,valid:items.length,duplicates:duplicateCount,errors,preview:items.slice(0,6),items,alreadyImported:!!this.db.prepare('SELECT id FROM imports WHERE hash=?').get(hash)};
  }
  commitImport(kind,text){return this.transaction(()=>{
    const result=this.importPreview(kind,text);if(result.alreadyImported)return {imported:0,duplicates:result.total,alreadyImported:true};
    if(result.errors.length)throw new Error('导入包含错误，请修正后重试；本次未写入任何数据');
    for(const item of result.items)this.put(kind,item);
    const id=randomUUID();this.db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(id,result.hash,kind,result.items.length,dateNow());this.markDirty();this.audit('导入数据',id,{kind,imported:result.items.length,duplicates:result.duplicates,hash:result.hash});return {imported:result.items.length,duplicates:result.duplicates};
  });}
  snapshot(){
    const partners=this.all('partners'),customers=this.all('customers'),orders=this.all('orders').map(o=>this.netOrder(o)),ledger=this.ledger(),settlements=this.settlements();
    for(const p of partners){const own=customers.filter(c=>c.partnerId===p.id),ownLedger=ledger.filter(l=>l.partner_id===p.id);p.customerCount=own.length;p.earnedCents=ownLedger.reduce((s,x)=>s+x.amount,0);p.buyerCount=own.filter(c=>c.role==='buyer'&&c.registrationVerified).length;p.gmvCents=orders.filter(o=>o.status==='completed'&&o.attribution.buyerPartnerId===p.id).reduce((s,o)=>s+o.netGoodsCents,0);}
    return {demo:this.demo,today:today(),rules:this.meta('rules'),dirty:!!this.meta('dirty'),lastReconciledAt:this.meta('lastReconciledAt'),blockers:this.meta('blockers')??[],partners,customers:customers.map(c=>({...c,partnerName:partners.find(p=>p.id===c.partnerId)?.name??'未分配'})),orders,refunds:this.all('refunds'),ledger,settlements,imports:this.db.prepare('SELECT * FROM imports ORDER BY created_at DESC LIMIT 20').all(),audit:this.db.prepare('SELECT * FROM audit ORDER BY created_at DESC,rowid DESC LIMIT 100').all(),summary:{gmvCents:orders.filter(o=>o.status==='completed').reduce((s,o)=>s+o.netGoodsCents,0),commissionCents:orders.filter(o=>o.status==='completed'&&o.commissionVerified).reduce((s,o)=>s+(o.netCommissionCents??0),0),rewardsCents:ledger.reduce((s,l)=>s+l.amount,0),unbatchedCents:ledger.filter(l=>!l.batch_id).reduce((s,l)=>s+l.amount,0),paidCents:settlements.filter(s=>s.status==='paid').reduce((n,s)=>n+s.amount,0)}};
  }
}

}
