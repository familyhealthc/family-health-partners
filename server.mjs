import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from './src/store.mjs';
import {toCSV} from './src/csv.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.FAMILY_DATA_DIR||path.join(root,'data');
await mkdir(dataDir,{recursive:true});
const stores={demo:new Store(path.join(dataDir,'demo.sqlite'),{demo:true}),workspace:new Store(path.join(dataDir,'workspace.sqlite'))};
const localKey=randomBytes(24).toString('hex');
const port=Number(process.env.PORT||4317);
const templates={
  customers:[{id:'BUYER-001',name:'示例药房（请替换）',subjectId:'请填写真实主体与门店标识',role:'buyer',buyerType:'independent',kaGroupId:'',partnerId:'请填写已建立的合伙人编号',registrationVerified:'true',qualificationApproved:'true',publishedSkuCount:0,kaStoreCount:0,registeredAt:'2026-11-06',note:''}],
  orders:[{id:'ORDER-001',buyerId:'BUYER-001',sellerId:'SELLER-001',goodsYuan:'1000.00',commissionYuan:'30.00',commissionVerified:'true',completedAt:'2026-11-06',status:'completed',category:'RX/OTC'}],
  refunds:[{id:'REFUND-001',orderId:'ORDER-001',goodsYuan:'100.00',commissionYuan:'3.00',completedAt:'2026-11-06'}]
};
const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
async function body(req){let content='';for await(const chunk of req){content+=chunk;if(Buffer.byteLength(content)>6_000_000)throw new Error('请求超过6MB限制');}try{return JSON.parse(content||'{}');}catch{throw new Error('请求JSON格式不正确');}}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try{
    const host=req.headers.host;
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return send(res,403,{error:'仅允许本机访问'});
    const origin=req.headers.origin;
    if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin))return send(res,403,{error:'请求来源不受支持'});
    const url=new URL(req.url,`http://${host}`),route=url.pathname;
    if(route==='/api/bootstrap'&&req.method==='GET')return send(res,200,{localKey,app:'Family Health Partner Center',localOnly:true});
    if(route.startsWith('/api/')){
      if(req.headers['x-local-key']!==localKey)return send(res,403,{error:'请重新打开工作台后操作'});
      const workspace=req.headers['x-workspace']||'demo';if(!stores[workspace])throw new Error('工作区不存在');const store=stores[workspace];
      if(route==='/api/state'&&req.method==='GET')return send(res,200,store.snapshot());
      if(route.startsWith('/api/template/')&&req.method==='GET'){
        const kind=route.split('/').at(-1);if(!templates[kind])throw new Error('模板不存在');res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="family-health-${kind}-template.csv"`});return res.end(toCSV(templates[kind]));
      }
      if(route==='/api/export'&&req.method==='GET'){
        const state=store.snapshot(),rows=state.ledger.map(l=>({entryId:l.id,partnerId:l.partner_id,partnerName:l.partnerName,type:l.kind,sourceId:l.source_id,amountYuan:(l.amount/100).toFixed(2),earnedAt:l.earned_at,availableAt:l.available_at,ruleVersion:l.rule_version,settlementId:l.batch_id||'',dataWorkspace:store.demo?'DEMO':'WORKSPACE'}));
        res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="family-health-rewards.csv"'});return res.end(toCSV(rows,['entryId','partnerId','partnerName','type','sourceId','amountYuan','earnedAt','availableAt','ruleVersion','settlementId','dataWorkspace']));
      }
      if(req.method==='POST'){
        if(!String(req.headers['content-type']||'').includes('application/json'))throw new Error('仅接受JSON请求');
        const input=await body(req);let result;
        if(route==='/api/entities')result=store.saveEntity(input.kind,input.item);
        else if(route==='/api/rules')result=store.saveRules(input);
        else if(route==='/api/reconcile')result=store.reconcile();
        else if(route==='/api/import/preview'){const {items,...preview}=store.importPreview(input.kind,input.text);result=preview;}
        else if(route==='/api/import/commit')result=store.commitImport(input.kind,input.text);
        else if(route.match(/^\/api\/orders\/[^/]+\/commission$/))result=store.verifyCommission(decodeURIComponent(route.split('/')[3]),input);
        else if(route==='/api/settlements')result=store.createSettlement(input.asOf);
        else if(route.match(/^\/api\/settlements\/[^/]+$/))result=store.updateSettlement(decodeURIComponent(route.split('/').at(-1)),input);
        else return send(res,404,{error:'接口不存在'});
        return send(res,200,{ok:true,result});
      }
      return send(res,404,{error:'接口不存在'});
    }
    const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/favicon.svg':'favicon.svg'};
    if(!files[route]||req.method!=='GET')return send(res,404,{error:'页面不存在'});
    const mime=route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':route.endsWith('.svg')?'image/svg+xml':'text/html';
    res.writeHead(200,{'content-type':mime+'; charset=utf-8','cache-control':'no-cache'});res.end(await readFile(path.join(root,'public',files[route])));
  }catch(error){send(res,400,{error:error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Family Health 合伙人中心已启动\nLocal: http://127.0.0.1:${port}\n数据目录: ${dataDir}`));
const stop=()=>server.close(()=>{Object.values(stores).forEach(s=>s.close());process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
