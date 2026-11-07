import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('HTTP工作台、访问约束、工作区隔离、模板和写入入口端到端验证',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'family-http-test-'));
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),port=49371,base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning','server.mjs'],{cwd:root,env:{...process.env,FAMILY_DATA_DIR:dir,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout')),6000);child.stdout.on('data',b=>{if(b.toString().includes('Local:')){clearTimeout(timer);resolve();}});child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error('server exited '+code));});});
    const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/家家健康/);
    assert.equal((await fetch(base+'/api/state')).status,403);
    const init=await (await fetch(base+'/api/bootstrap')).json();
    const headers={'X-Local-Key':init.localKey,'X-Workspace':'workspace','Content-Type':'application/json'};
    const real=await (await fetch(base+'/api/state',{headers})).json();assert.equal(real.partners.length,0);assert.equal(real.rules.confirmed,false);
    const demo=await (await fetch(base+'/api/state',{headers:{...headers,'X-Workspace':'demo'}})).json();assert.equal(demo.partners.length,3);assert.ok(demo.ledger.length>0);
    assert.equal((await fetch(base+'/api/reconcile',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:'{}'})).status,403);
    const template=await fetch(base+'/api/template/orders',{headers});assert.equal(template.status,200);assert.match(await template.text(),/commissionYuan/);
    const previewResponse=await fetch(base+'/api/import/preview',{method:'POST',headers:{...headers,'X-Workspace':'demo'},body:JSON.stringify({kind:'orders',text:'id,buyerId,sellerId,goodsYuan,commissionYuan,commissionVerified,completedAt,status,category\nPREVIEW-1,C001,C002,1000,30,true,2026-01-01,completed,RX'})});const preview=await previewResponse.json();assert.equal(preview.result.valid,1);assert.deepEqual(preview.result.errors,[]);
    const saved=await fetch(base+'/api/entities',{method:'POST',headers,body:JSON.stringify({kind:'partners',item:{id:'HTTP-P1',name:'接口测试合伙人',region:'杭州',level:'natural',status:'active',joinedAt:'2026-01-01'}})});assert.equal(saved.status,200);
    const after=await (await fetch(base+'/api/state',{headers})).json();assert.equal(after.partners.length,1);
    assert.equal((await fetch(base+'/api/settlements',{method:'POST',headers,body:JSON.stringify({asOf:'2026-01-01'})})).status,400);
    assert.equal((await fetch(base+'/api/state',{headers:{...headers,'X-Workspace':'unknown'}})).status,400);
  }finally{
    await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill('SIGTERM');});
    rmSync(dir,{recursive:true,force:true});
  }
});
