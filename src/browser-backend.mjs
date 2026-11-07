import {createStoreClass} from './store-core.mjs';
import {sqliteAdapter} from './sqlite-browser.mjs';
import {defaultRules} from './defaults.mjs';
import {toCSV} from './csv.mjs';
import initSqlJs from 'sql.js';

const templates={
  customers:[{id:'BUYER-001',name:'示例药房（请替换）',subjectId:'真实主体与门店唯一标识',role:'buyer',buyerType:'independent',kaGroupId:'',partnerId:'请替换为已有合伙人编号',registrationVerified:'true',qualificationApproved:'true',publishedSkuCount:0,kaStoreCount:0,registeredAt:'2026-11-06',note:''}],
  orders:[{id:'ORDER-001',buyerId:'BUYER-001',sellerId:'SELLER-001',goodsYuan:'1000.00',commissionYuan:'30.00',commissionVerified:'true',completedAt:'2026-11-06',status:'completed',category:'RX/OTC'}],
  refunds:[{id:'REFUND-001',orderId:'ORDER-001',goodsYuan:'100.00',commissionYuan:'3.00',completedAt:'2026-11-06'}]
};
const toBase64=bytes=>{let value='';for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(value);};
export function decodeBackup(text){
  if(typeof text!=='string'||text.length>20_000_000)throw new Error('备份格式无效或文件超过20MB');
  let file;try{file=JSON.parse(text);}catch{throw new Error('备份文件不是有效JSON');}
  if(file.application!=='Family Health Partner Center'||file.schemaVersion!==1||typeof file.database!=='string')throw new Error('请选择本系统导出的完整备份');
  let bytes;try{bytes=Uint8Array.from(atob(file.database),x=>x.charCodeAt(0));}catch{throw new Error('备份数据编码无效');}
  if(new TextDecoder().decode(bytes.subarray(0,15))!=='SQLite format 3')throw new Error('备份数据库格式无效');
  return bytes;
}
export async function createBrowserBackend(){
  if(!globalThis.indexedDB)throw new Error('此浏览器未启用本地存储，请使用普通浏览模式打开。');
  const SQL=await initSqlJs({locateFile:file=>new URL('./'+file,location.href.split('#')[0].split('?')[0]).href});
  const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('family-health-partners-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspaces');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法打开浏览器存储，请检查浏览器设置'));});
  const namespace=location.pathname.replace(/index\.html$/,'');
  const key=workspace=>namespace+':'+workspace;
  const read=async id=>new Promise((resolve,reject)=>{const request=database.transaction('workspaces','readonly').objectStore('workspaces').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('读取本地工作区失败'));});
  const write=async(id,bytes,previous)=>new Promise((resolve,reject)=>{const transaction=database.transaction('workspaces','readwrite');const store=transaction.objectStore('workspaces');if(previous)store.put(previous,id+':previous');store.put(bytes,id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(new Error('保存失败，浏览器存储空间可能不足，请先导出备份'));});
  let fallbackQueue=Promise.resolve();
  const locked=(id,fn)=>{if(navigator.locks)return navigator.locks.request('family-partners:'+id,fn);const next=fallbackQueue.then(fn,fn);fallbackQueue=next.catch(()=>{});return next;};
  async function run(workspace,fn,{mutate=false}={}){
    if(!['demo','workspace'].includes(workspace))throw new Error('工作区不存在');
    return locked(key(workspace),async()=>{
      const bytes=await read(key(workspace));
      const Store=createStoreClass(sqliteAdapter(SQL,bytes));
      const store=new Store(':memory:',{demo:workspace==='demo'});
      try{
        if(!bytes){store.setMeta('rules',defaultRules);if(workspace==='demo')store.reconcile();store.audit('初始化默认业务规则','v1',{chosenBy:'用户授权先选一套，后续可调整',rules:defaultRules});}
        const result=await fn(store);
        if(mutate||!bytes)await write(key(workspace),store.db.export());
        return structuredClone(result);
      }finally{store.close();}
    });
  }
  return {
    storage:'browser',
    async request(route,input,workspace){
      return run(workspace,store=>{
        if(route==='state')return {...store.snapshot(),storage:'browser'};
        let result;
        if(route==='entities')result=store.saveEntity(input.kind,input.item);
        else if(route==='rules')result=store.saveRules(input);
        else if(route==='reconcile')result=store.reconcile();
        else if(route==='import/preview'){const {items,...preview}=store.importPreview(input.kind,input.text);result=preview;}
        else if(route==='import/commit')result=store.commitImport(input.kind,input.text);
        else if(/^orders\/[^/]+\/commission$/.test(route))result=store.verifyCommission(decodeURIComponent(route.split('/')[1]),input);
        else if(route==='settlements')result=store.createSettlement(input.asOf);
        else if(/^settlements\/[^/]+$/.test(route))result=store.updateSettlement(decodeURIComponent(route.split('/')[1]),input);
        else throw new Error('此操作尚未支持');
        return {ok:true,result};
      },{mutate:input!==undefined&&route!=='import/preview'});
    },
    async download(route,workspace){
      if(route.startsWith('template/')){const kind=route.split('/')[1];if(!templates[kind])throw new Error('模板不存在');return {text:toCSV(templates[kind]),mime:'text/csv;charset=utf-8'};}
      return run(workspace,store=>{
        if(route==='backup')return {text:JSON.stringify({application:'Family Health Partner Center',schemaVersion:1,createdAt:new Date().toISOString(),workspace,database:toBase64(store.db.export())}),mime:'application/json'};
        const rows=store.ledger().map(l=>({entryId:l.id,partnerId:l.partner_id,partnerName:l.partnerName,type:l.kind,sourceId:l.source_id,amountYuan:(l.amount/100).toFixed(2),earnedAt:l.earned_at,availableAt:l.available_at,ruleVersion:l.rule_version,settlementId:l.batch_id||'',dataWorkspace:workspace==='demo'?'DEMO':'PERSONAL'}));
        return {text:toCSV(rows,['entryId','partnerId','partnerName','type','sourceId','amountYuan','earnedAt','availableAt','ruleVersion','settlementId','dataWorkspace']),mime:'text/csv;charset=utf-8'};
      });
    },
    async previewBackup(text){
      const bytes=decodeBackup(text),Store=createStoreClass(sqliteAdapter(SQL,bytes)),store=new Store(':memory:');
      try{const integrity=store.db.prepare('PRAGMA integrity_check').get();if(Object.values(integrity)[0]!=='ok')throw new Error('备份完整性检查失败');return store.snapshot();}finally{store.close();}
    },
    async restoreBackup(text,workspace){
      const bytes=decodeBackup(text);await this.previewBackup(text);
      return locked(key(workspace),async()=>{const previous=await read(key(workspace));await write(key(workspace),bytes,previous);});
    },
    async undoRestore(workspace){return locked(key(workspace),async()=>{const previous=await read(key(workspace)+':previous');if(!previous)throw new Error('没有可撤销的恢复操作');const current=await read(key(workspace));await write(key(workspace),previous,current);});}
  };
}
