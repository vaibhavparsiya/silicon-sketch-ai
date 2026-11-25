import {sketch} from './sketch.mjs';
import {api,shareTools} from './service.mjs';
import {oppositeVector,signals,presets,bit,covers,compile,synthesize,literals,expression,hardware,bench,faultTrace} from './core.mjs';
const $=id=>document.getElementById(id);
let mask=compile(presets[0].rule), terms=synthesize(mask), vector=3;
function button(label,action){
  const b=document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=action; return b;
}
function svg(tag,attrs={},value=''){
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
  e.textContent=value;return e;
}
function drawing(width,height,label){
  return svg('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':label});
}
const line=(root,d,high)=>root.append(svg('path',{d,class:high?'wire hot':'wire'}));
const label=(root,x,y,s,cls='')=>root.append(svg('text',{x,y,class:cls},s));
const gate=(root,x,y,w,name,high)=>{
  root.append(svg('rect',{x,y:y-14,width:w,height:28,rx:6,class:high?'gate lit':'gate'}));
  label(root,x+w/2,y+4,name,'center');
};
function schematic(){
  const h=Math.max(165,terms.length*78+18),mid=h/2,output=(mask>>vector)&1;
  const s=drawing(580,h,'Logic network for '+expression(terms)+'. Current output '+output);
  if(!terms.length||terms[0]==='---'){
    const v=Number(terms.length>0);gate(s,60,mid,90,'CONST '+v,v);line(s,'M150 '+mid+'H500',v);
  }else{
    terms.forEach((term,i)=>{
      const args=literals(term),y=(i+.5)*h/terms.length,on=covers(term,vector);
      args.forEach((name,j)=>{
        const yy=y+(j-(args.length-1)/2)*19,inv=name.startsWith('~'),signal=name.at(-1),v=bit(vector,signals.indexOf(signal));
        label(s,18,yy+4,signal+' '+v);
        line(s,'M50 '+yy+'H76',v);
        if(inv){s.append(svg('path',{d:'M76 '+(yy-6)+'v12l13 -6z',class:'gate'}),svg('circle',{cx:92,cy:yy,r:3,class:'gate'}));}
        line(s,'M'+(inv?95:76)+' '+yy+'H170L215 '+(y+(j-(args.length-1)/2)*7),inv?!v:v);
      });
      gate(s,215,y,70,args.length===1?'BUF':'AND',on);
      const target=mid+(i-(terms.length-1)/2)*6;
      line(s,'M285 '+y+'H310C360 '+y+' 360 '+target+' 403 '+target,on);
    });
    gate(s,403,mid,60,terms.length===1?'BUF':'OR',output);line(s,'M463 '+mid+'H500',output);
  }
  gate(s,500,mid,63,'Y = '+output,output);$('canvas').replaceChildren(s);
}
function analyzer(){
  const s=drawing(590,136,'Timing diagram, A B C and Y across vectors 000 to 111');
  s.append(svg('rect',{x:64+vector*64,y:0,width:64,height:136,class:'cursor'}));
  ['A','B','C','Y'].forEach((name,j)=>{
    const base=24+j*30;label(s,16,base,name);
    let d='';
    for(let i=0;i<8;i++){
      const level=j===3?(mask>>i)&1:bit(i,j);
      d+=(i===0?'M64 '+(base-level*15):'V'+(base-level*15))+'H'+(64+(i+1)*64);
    }
    line(s,d,j===3);
  });
  const nav=document.createElement('div');nav.className='vectors';
  for(let i=0;i<8;i++){
    const b=button(i.toString(2).padStart(3,'0'),()=>probe(i,'vector'+i));
    b.id='vector'+i;b.setAttribute('aria-pressed',String(i===vector));nav.append(b);
  }
  $('wave').replaceChildren(s,nav);
}
function probe(n,focus){vector=n;render();if(focus)$(focus).focus();}
function render(){
  if(faultActive)showFault();
  const out=(mask>>vector)&1;
  const active=terms.filter(t=>covers(t,vector)).map(t=>literals(t).join(' AND '));
  const reason=mask===255||mask===0?'Every truth-table row has the same value.':out?'These terms are true: '+active.join(', ')+'.':'Every term in the expression is false.';
  $('logic-reason').textContent=signals.map((name,i)=>name+'='+bit(vector,i)).join(', ')+' gives Y='+out+'. '+reason;
  const other=oppositeVector(mask,vector),opposite=$('opposite');
  opposite.hidden=other===null;
  if(other!==null){
    const names=signals.filter((_,i)=>bit(vector,i)!==bit(other,i));
    opposite.textContent='Flip '+names.join(' and ')+' to see Y='+Number(!out);
    opposite.onclick=()=>probe(other,'opposite');
  }
  $('hex').textContent='0x'+mask.toString(16).padStart(2,'0').toUpperCase();
  $('state').textContent='Y  '+(out?'HIGH · 1':'LOW · 0');$('state').className=out?'high':'';
  $('equation').textContent='Y = '+expression(terms);$('code').textContent=hardware(mask,terms);
  $('switches').replaceChildren(...signals.map((s,i)=>{
    const v=bit(vector,i),b=button(s+'  '+v,()=>probe(vector^(1<<(2-i)),'sw'+i));
    b.id='sw'+i;b.setAttribute('aria-label','Input '+s);b.setAttribute('aria-pressed',String(Boolean(v)));return b;
  }));
  const rows=[];
  for(let i=0;i<8;i++){
    const row=document.createElement('tr');if(i===vector)row.className='selected';
    signals.forEach((_,j)=>{const td=document.createElement('td');td.textContent=bit(i,j);row.append(td);});
    const td=document.createElement('td'),v=(mask>>i)&1;
    const b=button(String(v),()=>{
      revision++;mask^=1<<i;terms=synthesize(mask);$('rule').value='';$('rule').placeholder='Table edited — enter a new rule to compile';
      $('msg').textContent='Truth table updated. Schematic and RTL regenerated.';probe(i,'cell'+i);
    });
    b.id='cell'+i;b.setAttribute('aria-label','Output for '+i.toString(2).padStart(3,'0')+' is '+v+'. Toggle output');td.append(b);row.append(td);rows.push(row);
  }
  $('table').replaceChildren(...rows);schematic();analyzer();
}
let revision=0, labels=['A','B','C'];
function apply(rule){
  revision++;labels=['A','B','C'];$('mapping').textContent='';
  try{const next=compile(rule);mask=next;terms=synthesize(mask);render();$('msg').textContent='Compiled · all 8 combinations mapped.';}
  catch(e){$('msg').textContent=e.message+' The schematic shows the last compiled design.';}
}
for(const p of presets)$('presets').append(button(p.name,()=>{$('rule').value=p.rule;apply(p.rule);}));
function restore(design){
  if(design.kind==='universal_rtl'){sessionStorage.setItem('rtl-prompt',$('rule').value);sessionStorage.setItem('rtl-draft',JSON.stringify(design));location.assign('/rtl');return;}
  if(design.kind==='sequence'){
    sessionStorage.setItem('silicon-draft',JSON.stringify(design));location.assign('/sequence');return;
  }
  mask=design.mask;vector=design.vector;labels=design.labels;terms=synthesize(mask);render();
  $('mapping').textContent=labels.map((label,i)=>signals[i]+' = '+label).join('  ·  ');
  $('msg').textContent='Compiled · review the input mapping and truth table.';
}
async function describe(force_ai=false){
  const n=++revision,statement=$('rule').value.trim();
  $('msg').textContent='Compiling…';
  try{
    const image=await sketch($('photo').files[0]);
    const design=await api('/api/interpret',{prompt:statement||"Interpret this circuit image",image,force_ai,preferred_mode:'auto'});
    if(n===revision)restore(design);
  }catch(err){if(n===revision)$('msg').textContent=err.fallback?'AI generation needs a provider key. Use Compile for built-in designs such as an 8-bit ALU.':err.message+' The previous circuit is still displayed.';}
}
$('photo').onchange=()=>{revision++;$('rule').required=!$('photo').files.length;if($('photo').files.length)$('rule').value='';};
$('ai').onclick=()=>describe(true);
$('editor').onsubmit=e=>{e.preventDefault();describe(false);};

shareTools(()=>({kind:'logic',mask,vector,labels}),d=>{restore(d);if(d.kind==='logic')$('rule').value=d.formula.replaceAll('~','not ');});
$('rule').oninput=()=>{revision++;$('msg').textContent='Draft rule · compile to update the circuit.';};
$('step').onclick=()=>probe((vector+1)%8);
function download(file,content){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/plain'}));a.download=file;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
$('rtl').onclick=()=>download('silicon_sketch.v',hardware(mask,terms));
$('tb').onclick=()=>download('tb.sv',bench(mask));
let faultActive=false;
function showFault(){
  const pin=$('pin').selectedIndex, stuck=Number($('stuck').value);
  const failures=faultTrace(mask,pin,stuck).filter(x=>x.expected!==x.observed);
  const report=document.createElement('p');
  if(!failures.length){
    report.textContent='Undetectable for this function. All eight outputs agree despite the stuck input.';
    $('fault').replaceChildren(report);
    return;
  }
  const first=failures[0],binary=first.row.toString(2).padStart(3,'0');
  report.textContent=failures.length+' of 8 vectors expose this fault. At '+binary+', Y should be '+first.expected+' but the faulty circuit produces '+first.observed+'.';
  $('fault').replaceChildren(report,button('Probe '+binary,()=>{probe(first.row,'sw0');$('canvas').scrollIntoView({block:'center'});}));
}
$('inject').onclick=()=>{faultActive=true;showFault();};
for(const id of ['pin','stuck'])$(id).onchange=()=>{if(faultActive)showFault();};
render();

const goldenMask=compile(presets[0].rule);
let referenceMask=goldenMask;
$('remember-mask').onclick=()=>{referenceMask=mask;$('logic-proof').textContent='Current table saved as reference.';};
$('compare-mask').onclick=()=>{
 const delta=referenceMask^mask;
 if(!delta){$('logic-proof').textContent='Equivalent across all eight input combinations.';return;}
 const i=Array.from({length:8},(_,i)=>i).find(i=>delta>>i&1);
 $('logic-proof').textContent='Counterexample ABC='+i.toString(2).padStart(3,'0')+' · reference '+(referenceMask>>i&1)+' · current '+(mask>>i&1)+'.';
};
$('editor').ondragover=e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();};
$('editor').ondrop=e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();$('photo').files=e.dataTransfer.files;$('photo').onchange();};
