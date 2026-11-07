import {createBrowserBackend} from './browser-backend.mjs';
try{
  globalThis.familyBackend=await createBrowserBackend();
  await import('../public/app.js');
}catch(error){
  const view=document.getElementById('view');view.textContent='工作台暂时无法打开：'+error.message+'。请刷新，或在 Chrome / Edge 普通浏览模式中重试。';
}
