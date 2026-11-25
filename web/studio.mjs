import {gds} from './gds.mjs';
import {layout} from './physical.mjs';

const $=id=>document.getElementById(id);
const palette=['','#84ad87','#40b879','#ff865e','#e9e4d1','#38bdf8','#f8d758','#f472b6'];
const layers=['','N-well','Diffusion','Poly','Contact','Metal 1','Via 1','Metal 2'];
function proof(golden,edited){
 return new Promise((resolve,reject)=>{
  const worker=new Worker('/proof-worker.mjs',{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();resolve({status:'Proof timed out; equivalence undetermined'});},30000);
  worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data);};
  worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('Proof worker failed.'));};
  worker.postMessage({golden,edited});
 });
}
function save(data,name){
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
export function studio(synthesize){
 let plan,net,top,last,reference,samples=[],visible=new Set([1,2,3,4,5,6,7]),pin;
 const controls=$('layers');
 layers.forEach((label,i)=>{if(!i)return;const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.checked=true;c.onchange=()=>{c.checked?visible.add(i):visible.delete(i);draw();};l.append(c,' '+label+' ');controls.append(l);});
 function draw(){
  if(!plan)return;
  const hz=Number($('frequency').value),slack=1e6/hz-plan.delay;
  $('timing').textContent=plan.cells+' cells · '+plan.area.toFixed(1)+' µm² footprint · nominal path '+plan.delay+' ps · Fmax '+(plan.delay?(1e6/plan.delay).toFixed(0):'∞')+' MHz · target '+hz+' MHz · '+(slack<0?'setup budget exceeded':'positive setup margin')+' ('+slack.toFixed(0)+' ps).';
  const mode=$('view').value;$('diagram').hidden=mode!=='gate';$('die').hidden=mode!=='die';$('layers').hidden=mode!=='die';$('xray').hidden=mode!=='xray';
  if(mode==='die'){
   const canvas=$('die'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
   const scale=Math.min(canvas.width/(plan.width*1000),canvas.height/(plan.height*1000));
   const path=new Set(plan.path);const late=new Set(plan.captures.filter(c=>c.delay>1e6/hz).map(c=>c.net));
   for(const s of plan.shapes)if(visible.has(s.layer)){ctx.globalAlpha=s.wire===undefined||last.get(s.wire)?1:.5;ctx.fillStyle=late.has(s.wire)?'#ff4949':s.wire!==undefined&&path.has(s.wire)?'#ffba62':palette[s.layer];ctx.fillRect(s.x*scale,s.y*scale,Math.max(1,s.w*scale),Math.max(1,s.h*scale));}
   ctx.globalAlpha=1;
  }
  if(mode==='xray'){
   const c=net.cells.find(c=>c.pins.Y===pin),text=$('xray');
   if(!c||!['NOT','AND','OR','NAND','NOR'].includes(c.type)){text.textContent='Select an AND, OR, NAND, NOR or NOT cell using the Net selector.';return;}
   const and=['AND','NAND'].includes(c.type),buffer=['AND','OR'].includes(c.type);
   const inputs=Object.entries(c.pins).filter(([k])=>k!=='Y');
   const branch=p=>inputs.map(([k,v])=>k+' '+(last.get(v)===Number(!p)?'ON':'OFF')).join(inputs.length===1?'':(and===p?' ∥ ':' — '));
   text.textContent='VDD → PMOS '+branch(true)+' → internal node\nInternal node → NMOS '+branch(false)+' → GND'+(buffer?'\nOutput inverter · PMOS '+(last.get(c.pins.Y)?'ON':'OFF')+', NMOS '+(last.get(c.pins.Y)?'OFF':'ON'):'')+'\nY = '+last.get(c.pins.Y);
  }
 }
 $('frequency').oninput=draw;$('view').onchange=draw;
 $('gds').onclick=()=>save(gds(top,plan.shapes),top+'.gds');
 $('ys').onclick=()=>save('read_verilog '+top+'.v\nhierarchy -check -top '+top+'\nsynth -top '+top+'\nwrite_json '+top+'.json\n','synth.ys');
 $('make').onclick=()=>save('all: synth\nsynth:\n\tyosys -s synth.ys\n','Makefile');
 $('vcd').onclick=()=>{
  const lines=['$timescale 1ns $end','$scope module '+top+' $end',...net.ports.map((p,i)=>'$var wire '+p.bits.length+' p'+i+' '+p.name+' $end'),'$upscope $end','$enddefinitions $end'];
  samples.forEach((v,t)=>{lines.push('#'+t);net.ports.forEach((p,i)=>lines.push('b'+(v[p.name]??0).toString(2)+' p'+i));});save(lines.join('\n')+'\n',top+'.vcd');
 };
 $('prove').onclick=async()=>{const golden=reference;try{$('proof').textContent='Synthesizing edited RTL…';const edited=await synthesize({verilog:$('source').value,module_name:$('top').value});if(reference!==golden)return;$('proof').textContent=JSON.stringify(await proof(golden,edited));}catch(e){$('proof').textContent=e.message;}};
 let pwm=[],previousClk=0,serial=[],uartText='';
 return {
  setupFault(clock){
   if(!$('stress').checked||!plan||!clock)return null;
   const late=plan.captures.find(c=>c.delay>1e6/Number($('frequency').value));
   return late?{net:late.net,value:1-last.get(late.net)}:null;
  },
  golden(n){reference=n;$('proof').textContent='';},
  update(d,n,sim,state,inputs,p){
   if(net!==n){net=n;plan=layout(net,sim);samples=[];pwm=[];serial=[];uartText='';previousClk=0;}
   top=d.module_name;last=state;pin=p;
   samples.push({...inputs,...state.outputs});if(samples.length>256)samples.shift();
   const o=state.outputs,dock=$('dock');
   $('segments').hidden=!('seg'in o);
   $('pwm-meter').hidden=!('pwm'in o);
   if('seg'in o){Array.from($('segments').children).forEach((bar,i)=>bar.style.opacity=o.seg&(1<<(6-i))?'1':'.12');dock.textContent='Seven-segment display · '+['a','b','c','d','e','f','g'].filter((_,i)=>o.seg&(1<<(6-i))).join(' ');}
   else if('green'in o&&'amber'in o)dock.textContent='Intersection · '+(o.green?'🟢 Green':o.amber?'🟡 Amber':'🔴 Red')+(o.walk?' · WALK':' · WAIT');
   else if('pwm'in o){if(inputs.clk&&!previousClk)pwm.push(o.pwm);if(pwm.length>64)pwm.shift();const duty=pwm.reduce((a,b)=>a+b,0)/(pwm.length||1);$('pwm-meter').value=duty;dock.textContent='PWM duty over '+pwm.length+' edges · '+(100*duty).toFixed(0)+'% · average at 3.3 V: '+(3.3*duty).toFixed(2)+' V';}
   else if('tx'in o){if(inputs.clk&&!previousClk){if(serial.length||o.tx===0)serial.push(o.tx);if(serial.length===10){if(serial[9])uartText+=String.fromCharCode(serial.slice(1,9).reduce((a,b,i)=>a+(b<<i),0));serial=[];}}dock.textContent='UART 8N1 · one rising clock per bit · '+uartText.slice(-120);}
   else dock.textContent='';
   previousClk=inputs.clk||0;draw();
  }
 };
}
