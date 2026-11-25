import {synth} from './synth.mjs';
// npm tarballs carry the runtime and WASM as one pinned, compressed download.
// Validate the published digest before loading the isolated module.
const url='https://registry.npmjs.org/@yowasp/yosys/-/yosys-0.71.188-dev.1267.tgz';
const integrity='d9DlNdxAo2MKLM+XyzduDsgW99l25t07igbZ8lqPBT7ZfGJR4OJiAn55z8TItqwGpngA5tCYmBSSJd0MpvYvMQ==';
async function loadCompiler(){
  const response=await fetch(url,{cache:'force-cache'});
  if(!response.ok)throw Error('Compiler download returned '+response.status);
  const archive=await response.arrayBuffer();
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-512',archive));
  if(btoa(String.fromCharCode(...digest))!==integrity)throw Error('Compiler download integrity check failed.');
  const tar=new Uint8Array(await new Response(new Blob([archive]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const urls=new Map(),decoder=new TextDecoder();let bundle;
  for(let offset=0;offset+512<=tar.length;){
    const field=(start,len)=>decoder.decode(tar.subarray(offset+start,offset+start+len)).replace(/\0.*$/s,'').trim();
    const path=field(0,100);if(!path)break;
    const size=parseInt(field(124,12),8);if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw Error('Invalid compiler archive.');
    const data=tar.subarray(offset+512,offset+512+size),name=path.split('/').at(-1);
    if(path.startsWith('package/gen/')){
      if(name==='bundle.js')bundle=decoder.decode(data);
      else urls.set(name,URL.createObjectURL(new Blob([data],{type:name.endsWith('.wasm')?'application/wasm':'application/octet-stream'})));
    }
    offset+=512+Math.ceil(size/512)*512;
  }
  if(!bundle||!urls.has('yosys.core.wasm'))throw Error('Incomplete compiler package.');
  bundle=bundle.replace(/new URL\("\.\/([^"]+)", import\.meta\.url\)/g,(match,name)=>urls.has(name)?JSON.stringify(urls.get(name)):match);
  return import(URL.createObjectURL(new Blob([bundle],{type:'application/javascript'})));
}
self.onmessage=async({data})=>{
 try{const {runYosys}=await loadCompiler();self.postMessage({net:await synth(runYosys,data.verilog,data.module_name)});}
 catch(e){self.postMessage({error:String(e.message||e)});}
};
