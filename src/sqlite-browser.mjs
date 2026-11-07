// sql.js 适配 node:sqlite 的已用同步接口；两种运行环境复用完整业务逻辑。
export function sqliteAdapter(SQL,bytes){
  return class BrowserDatabase {
    constructor(){this.raw=new SQL.Database(bytes?new Uint8Array(bytes):undefined);}
    exec(sql){this.raw.exec(sql);}
    prepare(sql){
      const database=this.raw;
      const rows=(params,one)=>{const statement=database.prepare(sql);try{statement.bind(params);const result=[];while(statement.step()){const row=statement.getAsObject();if(one)return row;result.push(row);}return one?undefined:result;}finally{statement.free();}};
      return {run:(...params)=>{database.run(sql,params);return {changes:database.getRowsModified()};},get:(...params)=>rows(params,true),all:(...params)=>rows(params,false)};
    }
    close(){this.raw.close();}
    export(){return this.raw.export();}
  };
}
