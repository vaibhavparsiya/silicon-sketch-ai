// Compact representation of techmapped Yosys single-bit primitives.
export function compact(raw,top){
  const mod=raw.modules?.[top];if(!mod)throw Error('Top module was not found.');
  const ports=Object.entries(mod.ports).map(([name,p])=>({name,dir:p.direction,bits:p.bits}));
  const cells=Object.entries(mod.cells).map(([name,c])=>({name,type:c.type.slice(2,-1),pins:Object.fromEntries(Object.entries(c.connections).map(([p,b])=>{
    if(b.length!==1)throw Error('Unsupported wide cell '+c.type);return [p,b[0]];}))}));
  return checkNet({ports,cells});
}
const gatePins={AND:'ABY',OR:'ABY',XOR:'ABY',XNOR:'ABY',NAND:'ABY',NOR:'ABY',NOT:'AY',BUF:'AY',MUX:'ABSY',ANDNOT:'ABY',ORNOT:'ABY'};
function pinSpec(type){
  if(Object.hasOwn(gatePins,type))return gatePins[type];
  if(/^DFF_[PN]$/.test(type))return 'CDQ';
  if(/^DFFE_[PN][PN]$/.test(type))return 'CDEQ';
  if(/^(S?DFF)_[PN][PN][01]$/.test(type))return 'CDRQ';
  if(/^(S?DFFE|SDFFCE)_[PN][PN][01][PN]$/.test(type))return 'CDREQ';
  throw Error('Unsupported cell: '+String(type).slice(0,40));
}
const wire=v=>Number.isInteger(v)&&v>=0&&v<100000;
export function checkNet(n){
  if(!Array.isArray(n?.ports)||!n.ports.length||n.ports.length>64||!Array.isArray(n.cells)||n.cells.length>500)throw Error('Use at most 64 ports and 500 cells.');
  const driven=new Set(),read=[],names=new Set();
  function drive(v){if(!wire(v)||driven.has(v))throw Error('Invalid or duplicate driver.');driven.add(v);}
  for(const p of n.ports){
    if(!/^[a-zA-Z_]\w{0,63}$/.test(p.name)||names.has(p.name)||!['input','output'].includes(p.dir)||!Array.isArray(p.bits)||!p.bits.length||p.bits.length>32)throw Error('Invalid port or bus width (1–32 bits).');
    names.add(p.name);p.bits.forEach(p.dir==='input'?drive:v=>read.push(v));
  }
  for(const c of n.cells){
    const spec=pinSpec(c.type);
    if(typeof c.name!=='string'||c.name.length>512||!c.pins||Object.keys(c.pins).length!==spec.length)throw Error('Invalid cell.');
    for(const pin of spec){const v=c.pins[pin];if(pin==='Y'||pin==='Q')drive(v);else read.push(v);}
  }
  if(read.some(v=>!driven.has(v)&&!['0','1'].includes(v)))throw Error('Undriven, unknown or high-impedance net.');
  return n;
}
export function simulator(net){
  checkNet(net);
  const comb=net.cells.filter(c=>'Y' in c.pins),regs=net.cells.filter(c=>'Q' in c.pins);
  const known=new Set(['0','1',...net.ports.filter(p=>p.dir==='input').flatMap(p=>p.bits),...regs.map(c=>c.pins.Q)]);
  let left=comb;const groups=[];
  while(left.length){
    const ready=left.filter(c=>Object.entries(c.pins).every(([p,v])=>p==='Y'||known.has(v)));
    if(!ready.length)throw Error('Combinational feedback cannot be simulated.');
    groups.push(ready);for(const c of ready)known.add(c.pins.Y);
    left=left.filter(c=>!ready.includes(c));
  }
  const state=new Map(),clocks=new Map();
  const logic=(t,a,b,s)=>({AND:a&b,OR:a|b,XOR:a^b,XNOR:1^(a^b),NAND:1^(a&b),NOR:1^(a|b),NOT:1^a,BUF:a,MUX:s?b:a,ANDNOT:a&(1^b),ORNOT:a|(1^b)})[t];
  function evaluate(inputs={},fault=null){
    const bits=new Map([['0',0],['1',1]]),get=k=>fault&&fault.net===k?fault.value:bits.get(k)??0;
    for(const p of net.ports.filter(p=>p.dir==='input'))p.bits.forEach((k,i)=>bits.set(k,((inputs[p.name]??0)>>>i)&1));
    function settle(){
      for(const c of regs)bits.set(c.pins.Q,state.get(c.pins.Q)??0);
      for(const group of groups)for(const {type,pins:p} of group)bits.set(p.Y,logic(type,get(p.A),get(p.B),get(p.S)));
    }
    settle();
    const updates=[];
    for(const {type,pins:p} of regs){
      const [name,flags]=type.split('_'),active=(level,pol)=>level===Number(pol==='P');
      const clock=get(p.C),prev=clocks.get(p.Q)??0,edge=clock!==prev&&active(clock,flags[0]);
      const reset='R'in p&&active(get(p.R),flags[1]);
      const enabled=!('E'in p)||active(get(p.E),flags.at(-1));
      if(reset&&(!name.startsWith('S')||(edge&&(name!=='SDFFCE'||enabled))))updates.push([p.Q,Number(flags[2])]);
      else if(edge&&enabled)updates.push([p.Q,get(p.D)]);
      clocks.set(p.Q,clock);
    }
    for(const [k,v] of updates)state.set(k,v);settle();
    const outputs=Object.fromEntries(net.ports.filter(p=>p.dir==='output').map(p=>[p.name,p.bits.reduce((v,k,i)=>v+get(k)*2**i,0)]));
    return {outputs,get};
  }
  return {evaluate,groups,regs};
}
