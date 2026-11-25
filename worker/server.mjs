import {blind} from './blind.mjs';
import {contract,analyzeFault} from './contract.mjs';
import {catalog} from '../web/catalog.mjs';
import {rtlDesign,generateRTL} from './rtl.mjs';
import {challenge} from './challenge.mjs';
import {interpret,snapshot} from './interpreter.mjs';
export async function handle(request,env,assets){
  const url=new URL(request.url), path=url.pathname;
  const json=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(!path.startsWith('/api/')){
    if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
    const file=path==='/'?'index.html':path==='/rtl'?'rtl.html':path==='/sequence'?'sequence.html':path.slice(1);
    if(!Object.hasOwn(assets,file))return new Response('Not found',{status:404});
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript';
    return new Response(request.method==='HEAD'?null:assets[file],{headers:{'content-type':type+'; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':'no-cache'}});
  }
  try{
    if(path.startsWith('/api/designs/')&&request.method==='GET'){
      const id=path.slice('/api/designs/'.length);
      if(!/^[a-f0-9]{64}$/.test(id))return json({error:'Invalid design link.'},404);
      const saved=await env.BUCKET.get('designs/'+id);
      return saved?json(await saved.json()):json({error:'Shared design was not found.'},404);
    }
    if(!['/api/hunts','/api/hunts/open','/api/hunts/probe','/api/hunts/solve','/api/interpret','/api/designs','/api/validate','/api/repair','/api/ai-compile','/api/challenge','/api/probe','/api/verify-fault','/api/fault-analyze'].includes(path))return json({error:'Unknown API route.'},404);
    if(request.method!=='POST')return json({error:'POST required.'},405);
    if(request.headers.get('origin')!==url.origin)return json({error:'Same-origin requests only.'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
    let body;try{const reader=request.body?.getReader();if(!reader)throw Error();const bytes=[];let size=0;while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>(['/api/hunts','/api/validate','/api/designs','/api/repair','/api/fault-analyze'].includes(path)?524288:path==='/api/interpret'?1500000:8192)){await reader.cancel();return json({error:'Design is too large.'},413);}for(const b of r.value)bytes.push(b);}body=JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));}catch{return json({error:'Invalid JSON.'},400);}
    if(path.startsWith('/api/hunts')){try{return json(await blind(path,body,env.BUCKET));}catch(e){return json({error:e.message},422);}}
    if(['/api/challenge','/api/probe','/api/verify-fault'].includes(path)){
      try{return json(await challenge(path,body,env));}catch(e){return json({error:e.message},422);}
    }
    if(path==='/api/designs'&&body?.kind!=='universal_rtl'&&JSON.stringify(body).length>8192)return json({error:'Design is too large.'},413);
    if(path==='/api/fault-analyze'){
      try{const d=body.design?.kind==='universal_rtl'?rtlDesign(body.design):snapshot(body.design);return json(analyzeFault(d,body.fault));}catch(e){return json({ok:false,error:e.message},422);}
    }
    let design;
    try{if(['/api/interpret','/api/repair','/api/ai-compile'].includes(path)){
        const prompt=body?.prompt??body?.statement;
        const mode=body?.preferred_mode??'auto';
        if(!['auto','sequence','universal_rtl','logic'].includes(mode))throw Error('Unknown lab.');
        if(typeof prompt!=='string'||!prompt.trim()||prompt.length>1000)throw Error('Use a description of 1–1,000 characters.');
        if(body.image!==undefined){
          if(path!=='/api/interpret'||typeof body.image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(body.image))throw Error('Invalid JPEG.');
          if(!env.GEMINI_API_KEY)throw Error('Sketch interpretation requires a Gemini key.');
          design=await generateRTL(env,prompt,undefined,mode,body.image);
        }else if(path==='/api/repair'){
          if(typeof body.verilog!=='string'||body.verilog.length>32768||typeof body.yosys_error!=='string'||body.yosys_error.length>2400)throw Error('Invalid repair request.');
          design=await generateRTL(env,prompt,{verilog:body.verilog,error:body.yosys_error});
        }else if(body.force_ai===true||path==='/api/ai-compile'){design=await generateRTL(env,prompt,undefined,mode);
        }else{
          const canonical=prompt.trim().toLowerCase().replace(/\s+/g,' ').replace(/(\d+)\s*[- ]?\s*bits?\b/g,'$1-bit').replace(/[.!]$/,'').replace(/^(build|make|design|create) (an? )?/,'');
          const key=Object.keys(catalog).find(k=>catalog[k].title.toLowerCase()===canonical)||({
            '8-bit alu with add, sub, and, or, xor and zero flag':'alu','traffic light controller fsm with pedestrian button':'traffic','7-segment bcd decoder':'decoder','4-bit synchronous up/down counter with reset':'counter','pwm generator':'pwm'
          })[canonical];
          if((mode==='universal_rtl'||mode==='auto')&&key&&Object.hasOwn(catalog,key))design=catalog[key];
          else{
            try{if(/\b(\d+[- ]bit|alu|pwm|counter|flip.flop|decoder|fsm)\b/i.test(prompt))throw Error();design=interpret(prompt);if(mode!=='auto'&&design.kind!==mode)throw Error();}
            catch{design=await generateRTL(env,prompt,undefined,mode);}
          }
        }
      }else design=body?.kind==='universal_rtl'?rtlDesign(body):snapshot(body);}catch(err){return json(err.fallback?{ok:false,error:err.message,fallback_available:true}:{ok:false,error:err.message},err.status||422);}
    if(path!=='/api/designs')return json(contract(design));
    const data=JSON.stringify(design);
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));
    const id=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
    await env.BUCKET.put('designs/'+id,data);return json({id},201);
  }catch{return json({error:'Design storage is temporarily unavailable. Try again.'},503);}
}
