import {existsSync} from 'node:fs';
for(const path of ['.env','.dev.vars'])if(existsSync(path))process.loadEnvFile(path);
import {createServer} from 'node:http';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{port:{type:'string'},host:{type:'string'},strictPort:{type:'boolean'}}});
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {handle} from '../worker/server.mjs';
const assets={};for(const f of await readdir('web'))assets[f]=await readFile('web/'+f,'utf8');
await mkdir('.local/designs',{recursive:true});
const bucket={
  async get(k){try{const raw=await readFile('.local/'+k+'.json','utf8');return {json:()=>JSON.parse(raw)};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async put(k,s,options){
    const path='.local/'+k+'.json';
    await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});
    try{await writeFile(path,s,{flag:options?.onlyIf?'wx':'w'});return {};}
    catch(e){if(e.code==='EEXIST')return null;throw e;}
  }
};
createServer(async(req,res)=>{
  try {
    const protocol=req.headers['x-forwarded-proto']==='https'?'https':'http';
    const base=process.env.PUBLIC_ORIGIN || protocol+'://'+req.headers.host;
    const init={method:req.method,headers:req.headers};
    if(req.method!=='GET'&&req.method!=='HEAD'){init.body=req;init.duplex='half';}
    const r=await handle(new Request(new URL(req.url,base),init),{BUCKET:bucket,GEMINI_API_KEY:process.env.GEMINI_API_KEY,GROQ_API_KEY:process.env.GROQ_API_KEY},assets);
    res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Request failed');}
}).listen(Number(values.port || process.env.PORT || 8000),values.host || process.env.HOST || '0.0.0.0',function(){
  console.log('Silicon Sketch listening on port '+this.address().port);
});
