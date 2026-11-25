import {compile,expression,synthesize} from '../web/core.mjs';
function logic(mask,labels=['A','B','C']){
  return {kind:'logic',mask,vector:0,labels,formula:expression(synthesize(mask))};
}
export function interpret(statement){
  if(typeof statement!=='string'||!statement.trim()||statement.length>1000)throw Error('Enter a circuit description of 1–1,000 characters.');
  const raw=statement.trim();
  try{return logic(compile(raw));}catch{}
  let s=raw.toLowerCase().replace(/[.!?]+$/,'').trim();
  const seq=s.match(/^(?:(?:design|build|create|make) (?:an? )?)?(?:(non[- ]overlapping|overlapping) )?(?:sequence detector (?:for |that detects )?|detect(?: the)? (?:bit pattern |pattern |sequence )?|detect )["']?([01]{1,8})["']?(?: (?:in|from) (?:the stream )?([01]{1,96}))?(?: (with overlap|without overlap))?$/);
  if(seq)return {kind:'sequence',pattern:seq[2],overlap:seq[4]!=='without overlap'&&!seq[1]?.startsWith('non'),stream:seq[3]||seq[2],index:(seq[3]||seq[2]).length-1};
  // Only discard a recognized output prefix; preserve the full condition.
  s=s.replace(/^(?:(?:turn|switch) (?:on |off )?[^,;]+?|(?:activate|enable|trigger|sound|light|raise|start|open) [^,;]+?|(?:the )?[\w -]+ (?:turns on|lights up|is on|is high|runs|activates|starts)) (?:only )?(?:when|if|whenever) /,'');
  if(/\b(?:turn|switch) off\b/i.test(raw))throw Error('Describe the condition for the output to be ON, or use AI interpretation.');
  const q=s.match(/^(at least|at most|exactly|only|more than|fewer than) (zero|one|two|three|[0-3]) (?:of (?:the |my )?(?:three |3 )?)?(?:inputs?|sensors?|switches?|buttons?|signals?)(?: (?:are |is )?(high|on|active|pressed|triggered|low|off|disagree|agree))?$/);
  if(q){
    const n=Number.isNaN(Number(q[2]))?['zero','one','two','three'].indexOf(q[2]):Number(q[2]);
    let mask=0;
    for(let i=0;i<8;i++){
      const ones=i.toString(2).replaceAll('0','').length, count=['low','off'].includes(q[3])?3-ones:ones;
      const hit={'at least':count>=n,'at most':count<=n,'exactly':count===n,'only':count===n,'more than':count>n,'fewer than':count<n}[q[1]];
      if(hit)mask|=1<<i;
    }
    return logic(mask,['1','2','3'].map(i=>'Input '+i+' '+(['low','off'].includes(q[3])?'high':q[3]||'active')));
  }
  try{return logic(compile(s));}catch{}
  const aliases=[],syntax=[];
  s=s.replace(/\bboth\s+|\beither\s+/g,'').replace(/\bbut not both\b/g,'exclusive').replace(/\s*,?\s*exclusive$/,' EXCLUSIVE');
  const exclusive=s.endsWith(' EXCLUSIVE');if(exclusive)s=s.slice(0,-10);
  if(!/\b(and|or|xor|not|unless)\b/.test(s))throw Error('The fast compiler needs a logical condition. Try AI interpretation for free-form requests.');
  for(let item of s.split(/(\b(?:and|or|xor|not|unless)\b|[()])/).map(x=>x.trim()).filter(Boolean)){
    if(['and','or','xor','not','unless','(',')'].includes(item)){
      syntax.push(item==='unless'?'and not':exclusive&&item==='or'?'xor':item);continue;
    }
    item=item.replace(/^(the|a|an) /,'');
    if(!/^[a-z][a-z0-9 -]{0,45}$/.test(item)||/\b(before|after|then|while|second|seconds|cycle|cycles|when|until|every|if|unless|than|least|most|exactly|counter|toggle|always|never|without)\b/.test(item))throw Error('This condition needs clarification. Use AI interpretation.');
    const negative=/\b(?:is |are )?(?:low|off|inactive|false|0)$/.test(item);
    const atom=item.replace(/\s+(?:(?:is|are) )?(?:high|low|off|on|active|inactive|true|false|0|1)$/,'').trim();
    if(!aliases.includes(atom))aliases.push(atom);
    if(aliases.length>3)throw Error('The current hardware lab supports up to three binary inputs.');
    syntax.push((negative?'not ':'')+'ABC'[aliases.indexOf(atom)]);
  }
  const mask=compile(syntax.join(' '));
  return logic(mask,[0,1,2].map(i=>aliases[i]||'unused'));
}
export function snapshot(v){
  if(!v||typeof v!=='object')throw Error('Invalid design.');
  const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
  if(v.kind==='logic'&&integer(v.mask,0,255)&&integer(v.vector,0,7)){
    const labels=v.labels??['A','B','C'];
    if(!Array.isArray(labels)||labels.length!==3||labels.some(x=>typeof x!=='string'||!x.trim()||x.length>70))throw Error('Invalid signal names.');
    return {...logic(v.mask,labels),vector:v.vector};
  }
  if(v.kind==='sequence'&&typeof v.pattern==='string'&&/^[01]{1,8}$/.test(v.pattern)&&typeof v.overlap==='boolean'&&typeof v.stream==='string'&&/^[01]{0,96}$/.test(v.stream)&&integer(v.index,v.stream.length?0:-1,v.stream.length-1)){
    return {kind:'sequence',pattern:v.pattern,overlap:v.overlap,stream:v.stream,index:v.index};
  }
  throw Error('The design must fit three binary inputs and one output, or one 1–8 bit detector.');
}
