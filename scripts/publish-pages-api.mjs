// Git HTTPS 不可用时，通过已登录 gh 的 Git Data API 发布相同源代码树。
// 仅发布 git 跟踪的文件；不读取 data/、output/ 或浏览器存储。
import {execFileSync} from 'node:child_process';
const repository='familyhealthc/family-health-partners';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const api=(route,method='GET',payload)=>JSON.parse(execFileSync('gh',['api','repos/'+repository+'/'+route,'--method',method,...(payload===undefined?[]:['--input','-'])],{input:payload===undefined?undefined:JSON.stringify(payload),encoding:'utf8',maxBuffer:20_000_000}));
let parent;
try{parent=api('git/ref/heads/main').object.sha;}catch(error){
  if(!String(error.stderr||error.message).includes('409')&&!String(error.stderr||error.message).includes('404'))throw error;
  const content=execFileSync('git',['show',':README.md']);
  parent=api('contents/README.md','PUT',{message:'Initialize Family Health partner center',content:content.toString('base64'),branch:'main'}).commit.sha;
}
const records=execFileSync('git',['ls-files','-s','-z']).toString('utf8').split('\0').filter(Boolean);
const tree=[];
for(const record of records){
  const [metadata,file]=record.split('\t'),[mode,sha]=metadata.split(' ');
  if(/^(data|output|node_modules)\//.test(file)||/\.sqlite(?:-|$)|\.env$/.test(file))throw new Error('拒绝发布运行数据：'+file);
  const buffer=execFileSync('git',['cat-file','blob',sha],{maxBuffer:10_000_000});
  if(buffer.includes(0)){
    const blob=api('git/blobs','POST',{content:buffer.toString('base64'),encoding:'base64'});
    if(blob.sha!==sha)throw new Error('二进制文件校验失败：'+file);
    tree.push({path:file,mode,type:'blob',sha});
  }else tree.push({path:file,mode,type:'blob',content:buffer.toString('utf8')});
}
const remoteTree=api('git/trees','POST',{tree});
if(remoteTree.sha!==git('write-tree'))throw new Error('GitHub代码树与本地暂存区不一致');
const identity={name:'familyhealthc',email:'78889468+familyhealthc@users.noreply.github.com',date:new Date().toISOString().replace(/\.\d{3}Z$/,'Z')};
const commit=api('git/commits','POST',{message:'Publish Family Health partner center for GitHub Pages',tree:remoteTree.sha,parents:[parent],author:identity,committer:identity});
api('git/refs/heads/main','PATCH',{sha:commit.sha,force:false});

// 导入由 API 创建的提交对象，让本地与远端保持同一历史。
function importCommit(sha){
  const item=api('git/commits/'+sha);
  try{execFileSync('git',['cat-file','-e',sha],{stdio:'ignore'});return item;}catch{}
  const headers=['tree '+item.tree.sha,...item.parents.map(p=>'parent '+p.sha),...['author','committer'].map(key=>{const v=item[key];return `${key} ${v.name} <${v.email}> ${Math.floor(Date.parse(v.date)/1000)} +0000`;})];
  let raw=headers.join('\n')+'\n\n'+item.message+'\n';
  if(item.verification?.signature&&item.verification?.payload){const [head,...tail]=item.verification.payload.split('\n\n');const signature=item.verification.signature.trimEnd().replaceAll('\n','\n ');raw=head+'\ngpgsig '+signature+'\n\n'+tail.join('\n\n');}
  let imported;
  // REST日期规范化为UTC，Contents API创建的提交可能保留账号时区。
  for(let offset=-720;offset<=840&&imported!==sha;offset+=15){
    const absolute=Math.abs(offset),zone=(offset<0?'-':'+')+String(Math.floor(absolute/60)).padStart(2,'0')+String(absolute%60).padStart(2,'0');
    const header=headers.join('\n').replace(/ \+0000(?=\n|$)/g,' '+zone);
    for(const ending of ['', '\n']){
      const candidate=item.verification?.signature?raw:header+'\n\n'+item.message+ending;
      const hash=execFileSync('git',['hash-object','-t','commit','--stdin'],{input:candidate,encoding:'utf8'}).trim();
      if(hash===sha){imported=hash;execFileSync('git',['hash-object','-t','commit','-w','--stdin'],{input:candidate});break;}
    }
  }
  if(imported!==sha)throw new Error('远端已发布，但本地提交对象校验未通过');
  return item;
}
const initial=importCommit(parent);
const initialTree=api('git/trees/'+initial.tree.sha);
if(initialTree.tree.every(x=>x.type==='blob')){
  const content=initialTree.tree.map(x=>`${x.mode} ${x.type} ${x.sha}\t${x.path}\0`).join('');
  execFileSync('git',['mktree','-z'],{input:content,encoding:'utf8'});
}
importCommit(commit.sha);
execFileSync('git',['update-ref','refs/heads/main',commit.sha]);
execFileSync('git',['update-ref','refs/remotes/origin/main',commit.sha]);
execFileSync('git',['config','branch.main.remote','origin']);
execFileSync('git',['config','branch.main.merge','refs/heads/main']);
console.log(JSON.stringify({repository,commit:commit.sha,tree:remoteTree.sha,files:tree.length}));
