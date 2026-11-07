export function parseCSV(input) {
  if(typeof input !== 'string' || input.length > 5_000_000) throw new Error('CSV文件过大或格式无效');
  const text=input.replace(/^\uFEFF/,''), rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"'&&text[i+1]==='"'){cell+='"';i++;} else if(c==='"')quoted=false;else cell+=c; }
    else if(c==='"') {if(cell)throw new Error('CSV引号位置无效');quoted=true;}
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV有未闭合的引号');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(!rows.length)throw new Error('CSV文件为空');
  const headers=rows.shift().map(v=>v.trim());
  if(new Set(headers).size!==headers.length||headers.some(v=>!v))throw new Error('表头重复或为空');
  if(rows.length>5000)throw new Error('单次最多导入5000行');
  return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`第${i+2}行列数不匹配`);return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));});
}

export function toCSV(rows, headers=Object.keys(rows[0]??{})) {
  const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[headers.map(cell).join(','),...rows.map(r=>headers.map(h=>cell(r[h])).join(','))].join('\r\n');
}

export function yuanToCents(value) {
  const s=String(value??'').trim();
  if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(s))throw new Error('金额须为非负人民币元，最多两位小数');
  const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));
}
