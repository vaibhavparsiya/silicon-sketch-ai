import {snapshot} from './interpreter.mjs';
import {checkNet,simulator} from '../web/net.mjs';
export function rtlDesign(d){
  const string=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
  if(!string(d?.module_name,64)||!/^\w+$/.test(d.module_name)||/^\d/.test(d.module_name)||!string(d.verilog,32768)||!string(d.title,160)||!string(d.summary,700)||!string(d.testbench,32768))throw Error('Incomplete or oversized RTL design.');
  const v={kind:'universal_rtl',engine:'universal_rtl',module_name:d.module_name,title:d.title,summary:d.summary,verilog:d.verilog,testbench:d.testbench,sample_vectors:[]};
  if(Array.isArray(d.ports)&&d.ports.length<=64&&d.ports.every(p=>p&&/^[A-Za-z_]\w{0,63}$/.test(p.name)&&['input','output'].includes(p.dir)&&Number.isInteger(p.width)&&p.width>0&&p.width<=32))v.ports=d.ports.map(p=>({name:p.name,dir:p.dir,width:p.width,description:String(p.description||p.name).slice(0,120)}));
  if(['none','seven_segment','pwm_motor','traffic_light','uart_terminal'].includes(d.peripheral_hint))v.peripheral_hint=d.peripheral_hint;
  if(typeof d.is_sequential==='boolean')v.is_sequential=d.is_sequential;
  if(d.netlist_json){v.netlist_json=checkNet(d.netlist_json);simulator(v.netlist_json);}
  if(typeof d.cocotb_test==="string"&&d.cocotb_test.length<=32768)v.cocotb_test=d.cocotb_test;
  if(d.sample_vectors!==undefined){
    if(!Array.isArray(d.sample_vectors)||d.sample_vectors.length>32)throw Error('Invalid vectors.');
    for(const s of d.sample_vectors){for(const map of [s.inputs,s.expected])if(!map||typeof map!=='object'||Object.entries(map).some(([k,v])=>!/^\w{1,64}$/.test(k)||!Number.isSafeInteger(v)||v<0||v>4294967295))throw Error('Invalid test vector.');
      v.sample_vectors.push({label:String(s.label||'Vector').slice(0,80),inputs:s.inputs,expected:s.expected});}
  }
  if(d.inputs){if(typeof d.inputs!=='object'||Object.values(d.inputs).some(x=>!Number.isInteger(x)||x<0||x>4294967295))throw Error('Invalid probes.');v.inputs=d.inputs;}
  return v;
}
const aiInstructions = [
  'Translate digital circuit specifications into JSON. If ambiguous return {"question":"clarification"}.',
  'For up to three Boolean inputs and one output return kind:"logic", labels (three strings), truth_table (eight numbers, row order 000..111).',
  'For sequence detection return kind:"sequence", pattern (1-8 bits), overlap (boolean), stream (up to 96 bits).',
  'Otherwise return kind:"universal_rtl", title, summary, module_name, Verilog-2001 source in verilog, self-checking Verilog testbench, cocotb_test, ports (name,dir,width,description), is_sequential, peripheral_hint (none,seven_segment,pwm_motor,traffic_light,uart_terminal), sample_vectors (label, inputs and expected named integer maps).',
  'Use synthesizable RTL, 1-32 bits per port, up to 250 gates. For repair always return the complete corrected RTL design. Never include a netlist. Preserve the user specification.'
].join(' ');
function parseDesign(content){
  const d=JSON.parse(content);
  if(d.question)throw Object.assign(Error(String(d.question).slice(0,400)),{clarification:true});
  if(d.kind==='logic'){
    const t=d.truth_table;
    if(!Array.isArray(t)||t.length!==8||t.some(v=>v!==0&&v!==1))throw Error('Invalid truth table.');
    return snapshot({kind:'logic',mask:t.reduce((m,v,i)=>m|(v<<i),0),vector:0,labels:d.labels});
  }
  if(d.kind==='sequence')return snapshot({...d,index:(d.stream?.length??0)-1});
  const verilog=String(d.verilog??'').replace(/^\s*```(?:verilog)?\s*|\s*```\s*$/gi,'');
  if(/(?:^|[;\s])#\s*\d|\$(?:display|finish|stop|dumpvars)\b/.test(verilog))throw Error('Non-synthesizable statements in design.');
  return rtlDesign({...d,verilog,netlist_json:undefined});
}
const geminiModels=['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.8-flash'];
async function requestDesign(env,instructions,text,image,correcting){
  const gemini=Boolean(env.GEMINI_API_KEY);
  const models=gemini?(correcting?[geminiModels[2],...geminiModels.slice(0,2)]:geminiModels):['openai/gpt-oss-120b','openai/gpt-oss-120b'];
  const parts=[{text}];
  if(image)parts.push({inlineData:{mimeType:'image/jpeg',data:image.slice(image.indexOf(',')+1)}});
  for(const [i,model] of models.entries()){
    if(i)await new Promise(resolve=>setTimeout(resolve,gemini?[800,1500][i-1]:550));
    const url=gemini?'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(env.GEMINI_API_KEY):'https://api.groq.com/openai/v1/chat/completions';
    const headers={'Content-Type':'application/json'};
    if(!gemini)headers.Authorization='Bearer '+env.GROQ_API_KEY;
    const body=gemini?{systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json'}}:
      {model,messages:[{role:'system',content:instructions},{role:'user',content:text}],response_format:{type:'json_object'}};
    let r;
    try{r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(45000),redirect:'manual'});}
    catch{throw Object.assign(Error('AI provider could not be reached.'),{status:502});}
    const retryable=r.status===429||(gemini&&r.status===503);
    if(retryable&&i+1<models.length){await r.body?.cancel();continue;}
    if(!r.ok)throw Object.assign(Error('AI provider returned HTTP '+r.status+'.'),{status:retryable?r.status:502});
    const data=await r.json().catch(()=>({}));
    const content=gemini?data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''):data.choices?.[0]?.message?.content;
    return {model,content};
  }
}
export async function generateRTL(env,prompt,repair,mode='auto',image){
  if(!env.GEMINI_API_KEY&&!env.GROQ_API_KEY)throw Object.assign(Error('AI provider key not configured'),{status:503,fallback:true});
  const requestedKind=repair?'universal_rtl':mode;
  const instructions=aiInstructions+(requestedKind==='auto'?'':' The active lab requires kind "'+requestedKind+'". Return its schema or ask a clarification question.');
  let feedback=repair;
  for(let attempt=0;attempt<2;attempt++){
    const {model,content}=await requestDesign(env,instructions,JSON.stringify({prompt,repair:feedback}),image,attempt>0);
    try{
      const design=parseDesign(content);
      if(requestedKind!=='auto'&&design.kind!==requestedKind)throw Error('Return the '+requestedKind+' lab schema.');
      return {...design,compiler_source:model+(feedback?'-repaired':'')};
    }catch(e){
      if(e.clarification)throw e;
      if(attempt||repair)throw Object.assign(Error('The AI response did not contain a valid circuit. Try describing the ports and behavior.'),{status:502});
      feedback={candidate:String(content).slice(0,32768),error:e.message};
    }
  }
}
