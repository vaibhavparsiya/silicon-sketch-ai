import {studio} from './studio.mjs';
import {catalog} from './catalog.mjs';
import {simulator} from './net.mjs';
import {api,shareTools,labPrompt} from './service.mjs';
const $=id=>document.getElementById(id),option=(value,label)=>new Option(label,value);
let design,net,sim,inputs={},pin=null,history=[],revision=0,activeWorker=null,auto=null;
const el=(tag,label)=>{const n=document.createElement(tag);n.textContent=label;return n;};
function button(text,fn){const b=el('button',text);b.onclick=fn;return b;}
const svg=(tag,attrs,text='')=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n;};
const physical=studio(runWorker);
function graph(state){
 const groups=[...sim.groups], positions=new Map(),drawing=svg('svg',{role:'group','aria-label':'Gate layers'});
 const layers=[net.ports.filter(p=>p.dir==='input').flatMap(p=>p.bits.map((b,i)=>({label:p.name+'['+i+']',out:b,ins:[]}))),sim.regs.map(c=>({label:c.type,out:c.pins.Q,ins:Object.values(c.pins).filter(v=>v!==c.pins.Q)})),...groups.map(g=>g.map(c=>({label:c.type,out:c.pins.Y,ins:Object.entries(c.pins).filter(([p])=>p!=='Y').map(([,v])=>v)}))),net.ports.filter(p=>p.dir==='output').flatMap(p=>p.bits.map((b,i)=>({label:p.name+'['+i+']',ins:[b]})))].filter(x=>x.length);
 const height=44*Math.max(...layers.map(x=>x.length))+20,width=140*layers.length;
 drawing.setAttribute('width',width);drawing.setAttribute('height',height);drawing.setAttribute('viewBox','0 0 '+width+' '+height);
 layers.forEach((layer,i)=>layer.forEach((g,j)=>{g.x=i*140+8;g.y=18+j*44;if(g.out!==undefined)positions.set(g.out,g);}));
 for(const layer of layers)for(const g of layer)for(const k of g.ins){const src=positions.get(k);if(src)drawing.append(svg('path',{d:'M'+(src.x+84)+' '+src.y+' C'+(src.x+118)+' '+src.y+' '+(g.x-30)+' '+g.y+' '+g.x+' '+g.y,class:state.get(k)?'wire hot':'wire'}));}
 for(const layer of layers)for(const g of layer){
   const k=g.out??g.ins[0],group=svg('g',{role:'button',tabindex:0,'aria-label':g.label+' net '+k});
   const choose=()=>{if(typeof k==='number'){$('wire').value=k;pin=k;history=[];update();}};
   group.onclick=choose;group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};
   group.append(svg('rect',{x:g.x,y:g.y-12,width:84,height:25,rx:4,class:state.get(k)?'gate lit':'gate'}),svg('text',{x:g.x+5,y:g.y+5},g.label));drawing.append(group);
 }
 const box=$('diagram'),sx=box.scrollLeft,sy=box.scrollTop;box.replaceChildren(drawing);box.scrollLeft=sx;box.scrollTop=sy;
}
function fault(){return $('force').value===''?null:{net:Number($('wire').value),value:Number($('force').value)};}
function update(stress=null){
 $('vector-report').textContent='';
 const state=sim.evaluate(inputs,fault()??(stress?.net!==undefined?stress:null));$('outputs').textContent=Object.entries(state.outputs).map(([k,v])=>k+' = '+v+'  (0x'+v.toString(16).toUpperCase()+')').join('    ');
 for(const p of net.ports.filter(p=>p.dir==='input')){const control=document.getElementById('port-'+p.name);if(control)control.value=inputs[p.name]??0;}
 if(pin!==null){history.push(state.get(pin));history=history.slice(-32);$('trace').textContent='Net '+pin+' · last '+history.length+' samples  '+history.map(x=>x?'▔':'▁').join('');}
 const driver=pin===null?null:net.cells.find(c=>(c.pins.Q??c.pins.Y)===pin);
 if(pin===null)$('gate-reason').textContent='Select a gate or input to inspect its current value.';
 else if(fault()?.net===pin)$('gate-reason').textContent='Net '+pin+' is forced to '+state.get(pin)+' by the selected stuck-at fault.';
 else if(driver){
   const values=Object.entries(driver.pins).filter(([k])=>k!=='Q'&&k!=='Y').map(([k,v])=>k+'='+state.get(v)).join(', ');
   $('gate-reason').textContent=driver.type+' · '+values+' → '+('Q' in driver.pins?'stored Q':'Y')+'='+state.get(pin)+'.';
 }else $('gate-reason').textContent='Input net '+pin+' currently reads '+state.get(pin)+'.';
 physical.update(design,net,sim,state,inputs,pin);graph(state);return state.outputs;
}
function clock(){inputs.clk=0;update();inputs.clk=1;update(physical.setupFault(true));inputs.clk=0;update();}
function stop(){clearInterval(auto);auto=null;}
function install(d,edited=false){
 if(!edited)physical.golden(d.netlist_json);
 stop();design=d;net=d.netlist_json;sim=simulator(net);inputs={...d.inputs};history=[];pin=null;
 $('source').value=d.verilog;$('top').value=d.module_name;$('summary').textContent=d.summary;$('trace').textContent='';$('diff').textContent='';$('force').value='';
 $('inputs').replaceChildren();$('clock').replaceChildren();$('wire').replaceChildren();$('vectors').replaceChildren();
 for(const p of net.ports.filter(p=>p.dir==='input')){
   const label=el('label',p.name+' ['+p.bits.length+' bit] '),c=el('input','');c.id='port-'+p.name;c.size=6;c.setAttribute('aria-label',p.name);
   c.onchange=()=>{const v=Number(c.value);if(!c.value.trim()||!Number.isInteger(v)||v<0||v>=2**p.bits.length){$('status').textContent='Enter a decimal or 0x value within the bus width.';}else inputs[p.name]=v;update();};
   label.append(c);const group=el('div','');group.append(label);
   for(let i=p.bits.length-1;i>=0;i--)group.append(button('b'+i,()=>{inputs[p.name]=((inputs[p.name]??0)^(1<<i))>>>0;update();}));
   $('inputs').append(group);p.bits.forEach((k,i)=>$('wire').add(option(k,p.name+'['+i+']')));
 }
 for(const c of net.cells){const k=c.pins.Q??c.pins.Y;$('wire').add(option(k,c.type+' · net '+k));}
 if(net.ports.some(p=>p.name==='clk'&&p.dir==='input')){
  $('clock').append(button('Step clock',clock),button('1 Hz',()=>{stop();auto=setInterval(clock,1000);}),button('4 Hz',()=>{stop();auto=setInterval(clock,250);}),button('Pause',stop));
  if(net.ports.some(p=>p.name==='rst'))$('clock').append(button('Pulse reset',()=>{inputs.rst=1;clock();inputs.rst=0;update();}));
 }
 for(const v of d.sample_vectors||[])$('vectors').append(button(v.label,()=>{Object.assign(inputs,v.inputs);const out=update();
   const checks=Object.entries(v.expected);
   $('vector-report').textContent=v.label+' · '+(checks.length?checks.map(([k,x])=>k+': expected '+x+', observed '+(out[k]??'missing')+' ('+(x===out[k]?'pass':'fail')+')').join(' · '):'No expected outputs supplied.');}));
 $('metrics').textContent=net.cells.length+' cells · '+sim.groups.length+' logic levels';$('status').textContent='Synthesized netlist ready.';$('tb').disabled=!d.testbench||d.testbench.startsWith('// No');
 $('cocotb').hidden=!d.cocotb_test;
 update();
}
$('wire').onchange=()=>{pin=Number($('wire').value);history=[];update();};$('force').onchange=update;
$('search').onclick=()=>{
 const f=fault();if(!f){$('diff').textContent='Select a stuck-at value first.';return;}
 const ports=net.ports.filter(p=>p.dir==='input'),n=ports.reduce((s,p)=>s+p.bits.length,0),seq=sim.regs.length>0;
 const a=simulator(net),b=simulator(net);let random=0x36f2a;
 const cases=(design.sample_vectors||[]).map(v=>v.inputs);
 for(let i=0;i<Math.min(256,2**Math.min(n,8));i++){let j=0;const v={};for(const p of ports){let value=0;for(let k=0;k<p.bits.length;k++,j++){random=(Math.imul(random,1664525)+1013904223)>>>0;value+=((n<=8?(i>>j)&1:random>>>31))*2**k;}v[p.name]=value;}if(seq&&'clk'in v){v.clk=i%2;if('rst'in v)v.rst=Number(i<2);}cases.push(v);}
 const prefix=[];for(const v of cases){prefix.push(v);const x=a.evaluate(v).outputs,y=b.evaluate(v,f).outputs;if(JSON.stringify(x)!==JSON.stringify(y)){$('diff').textContent=(seq?'Input sequence '+JSON.stringify(prefix):'Inputs '+JSON.stringify(v))+' → healthy '+JSON.stringify(x)+' / faulty '+JSON.stringify(y);return;}}
 $('diff').textContent='No difference observed in '+cases.length+' tested vectors.';
};
function runWorker(d){
 return new Promise((resolve,reject)=>{
 const w=new Worker('/yosys-worker.mjs',{type:'module'});activeWorker=w;
 const finish=(fn,x)=>{clearTimeout(timer);w.terminate();if(activeWorker===w)activeWorker=null;fn(x);};
 const timer=setTimeout(()=>finish(reject,Error('Compiler download or synthesis exceeded 20 seconds.')),20000);
 w.onmessage=e=>e.data.error?finish(reject,Error(e.data.error)):finish(resolve,e.data.net);
 w.onerror=()=>finish(reject,Error('Could not load the WebAssembly compiler.'));w.postMessage(d);
 });
}
async function compileDraft(d,originPrompt=''){
 const ticket=++revision;stop();
 for(let attempt=0;attempt<3;attempt++){
  $('status').textContent=attempt?'Refining RTL synthesis…':'Loading and running Yosys WASM…';
  try{const result=await runWorker(d);if(ticket!==revision)return;install({...d,netlist_json:result},!originPrompt);return;}
  catch(e){if(ticket!==revision)return;
   if(!originPrompt||attempt===2||/download|load|fetch|20 seconds/i.test(e.message)){ $('status').textContent=e.message;return;}
   try{d=await api('/api/repair',{prompt:originPrompt,verilog:d.verilog,yosys_error:e.message.slice(-2400)});}catch(err){$('status').textContent=e.message+' '+err.message;return;}
  }
 }
}
$('build').onclick=()=>{const top=$('top').value.trim(),src=$('source').value;compileDraft({kind:'universal_rtl',module_name:top,title:top,summary:'User-supplied RTL · simulation initializes registers to zero.',verilog:src,testbench:'// No testbench supplied.',sample_vectors:[]});};
for(const [id,d] of Object.entries(catalog))$('examples').add(option(id,d.title));
$('examples').onchange=()=>{revision++;install(catalog[$('examples').value]);};
function exportFile(s,name){const a=el('a','');a.download=name;a.href=URL.createObjectURL(new Blob([s],{type:'text/plain'}));a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('download').onclick=()=>exportFile($('source').value,$('top').value+'.v');$('tb').onclick=()=>exportFile(design.testbench,design.module_name+'_tb.v');
$('cocotb').onclick=()=>exportFile(design.cocotb_test,'test_'+design.module_name+'.py');
function load(d,prompt=''){if(d.kind!=='universal_rtl')throw Error('Wrong lab for this snapshot.');if(d.netlist_json){revision++;install(d);}else{$('source').value=d.verilog;$('top').value=d.module_name;compileDraft(d,prompt);}}
install(catalog.adder);const draft=sessionStorage.getItem('rtl-draft');if(draft){sessionStorage.removeItem('rtl-draft');load(JSON.parse(draft),sessionStorage.getItem('rtl-prompt')||'');}
shareTools(()=>({...design,inputs}),load);
let game;for(let i=0;i<8;i++)$('abc').add(option(i,i.toString(2).padStart(3,'0')));for(const a of 'ABC')for(const type of ['SA0','SA1'])$('guess').add(option(a+type,a+' '+type));
async function play(id,fn){$(id).disabled=true;try{await fn();}catch(e){$('results').textContent+='\n'+e.message;}finally{$(id).disabled=false;}}
$('start').onclick=()=>play('start',async()=>{$('game').hidden=false;game=await api('/api/challenge',{});$('results').textContent='Majority voter · four probes available.';});
$('probe').onclick=()=>play('probe',async()=>{const r=await api('/api/probe',{challenge_id:game.challenge_id,vector:Number($('abc').value)});$('results').textContent+='\n'+r.used+'/4   ABC '+r.vector.toString(2).padStart(3,'0')+'   expected '+r.expected+'   observed '+r.observed;});
$('verify').onclick=()=>play('verify',async()=>{const g=$('guess').value;const r=await api('/api/verify-fault',{challenge_id:game.challenge_id,guessed_faults:[{node:g[0],type:g.slice(1)}]});$('results').textContent+='\n'+(r.solved?'Correct diagnosis.':'Incorrect diagnosis. Challenge closed.');});

labPrompt('universal_rtl',load);

const snapshotSave=$('save').onclick;
$('save').onclick=async()=>{
 if(!$('sabotage').checked)return snapshotSave();
 try{
  const {id}=await api('/api/hunts',{design,fault:fault()});
  const url=new URL('/rtl',location.origin);url.searchParams.set('hunt',id);
  const a=el('a',url.href);a.href=url.href;$('shared').replaceChildren(a);
 }catch(e){$('shared').textContent=e.message;}
};
const hunt=new URLSearchParams(location.search).get('hunt');
if(hunt)api('/api/hunts/open',{id:hunt}).then(r=>{
 load(r.design);$('blind-tools').hidden=false;
 for(const [id,action] of [['blind-probe','probe'],['blind-solve','solve']])$(id).onclick=async()=>{
 try{const values=Object.fromEntries(net.ports.filter(p=>p.dir==='input').map(p=>[p.name,inputs[p.name]??0]));
 const result=await api('/api/hunts/'+action,{id:hunt,inputs:values});$('blind-result').textContent=JSON.stringify(result);}
 catch(e){$('blind-result').textContent=e.message;}
 };
}).catch(e=>{$('shared').textContent=e.message;});
