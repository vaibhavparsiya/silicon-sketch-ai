export const signals = ['A','B','C'];
export const presets = [
  {name:'Majority voter',rule:'At least two inputs are high',a:'A and B or A and C or B and C'},
  {name:'Parity detector',rule:'An odd number of inputs are high',a:'A xor B xor C'},
  {name:'2:1 multiplexer',rule:'If C then B else A',a:'(C and B) or (not C and A)'},
  {name:'Interlock',rule:'A and (B or C)',a:'A and (B or C)'}
];
export const bit = (vector,index) => (vector >> (2-index)) & 1;

// Compile a bounded, explicit grammar without evaluating user-supplied code.
export function compile(input) {
  if (!input.trim() || input.length > 200) throw Error('Enter a rule of 1 to 200 characters.');
  let rule = input.trim().replace(/[.!]$/,'').replace(/^(?:turn (?:on )?Y (?:on )?(?:when|if)|Y (?:is high when|=))\s*/i,'').trim();
  rule = presets.find(p=>p.rule.toLowerCase()===rule.toLowerCase())?.a || rule;
  const mux = rule.match(/^if ([abc]) then ([abc]) else ([abc])$/i);
  if (mux) rule = '('+mux[1]+' and '+mux[2]+') or (not '+mux[1]+' and '+mux[3]+')';
  rule=rule.replace(/\bis (?:high|on)\b/gi,'').replace(/\b([abc])\s+is (?:low|off)\b/gi,'not $1');
  const words=rule.toLowerCase().match(/[a-z]+|[^\s]/g)||[];
  let pos=0;
  function atom() {
    const w=words[pos++];
    if (w==='not'||w==='!'||w==='~') return 255 ^ atom();
    if (w==='(') {const v=expr(0);if(words[pos++]!==')')throw Error('Add a closing parenthesis.');return v;}
    const i=['a','b','c'].indexOf(w);
    if(i<0)throw Error('Expected A, B, C, NOT or a parenthesized expression.');
    return [240,204,170][i];
  }
  const rank=new Map([['nor',1],['xnor',2],['nand',3],['or',1],['|',1],['xor',2],['^',2],['and',3],['&',3]]);
  function expr(min) {
    let left=atom();
    while((rank.get(words[pos])||0)>min){
      const op=words[pos++], level=rank.get(op), right=expr(level);
      left=level===1?left|right:level===2?left^right:left&right;
      if(['nor','nand','xnor'].includes(op))left^=255;
    }
    return left;
  }
  const result=expr(0);
  if(pos!==words.length)throw Error('Unrecognized rule. Use AND, OR, XOR, NOT, or an example.');
  return result;
}
export function covers(term,row) {
  return [...term].every((v,i)=>v==='-'||Number(v)===bit(row,i));
}
// Enumerate 27 cubes. Dynamic programming finds a minimum term cover,
// breaking ties by literal count. Eight minterms keep the search bounded.
export function synthesize(mask) {
  if(!Number.isInteger(mask)||mask<0||mask>255)throw Error('Expected an 8-bit truth table.');
  const plans=new Map([[0,{terms:[],cost:0}]]);
  for(const a of '-01') for(const b of '-01') for(const c of '-01'){
    const term=a+b+c;
    let bits=0;
    for(let i=0;i<8;i++)if(covers(term,i))bits|=1<<i;
    if((bits&mask)!==bits)continue;
    for(const [seen,plan] of [...plans]){
      const merged=seen|bits;
      if(merged===seen)continue;
      const cost=plan.cost+32+term.replaceAll('-','').length;
      if(cost<(plans.get(merged)?.cost??Infinity))plans.set(merged,{terms:[...plan.terms,term],cost});
    }
  }
  return plans.get(mask).terms;
}
export function literals(t) {return [...t].flatMap((v,i)=>v==='-'?[]:[(v==='0'?'~':'')+signals[i]]);}
export const expression=terms=>terms.length?terms.map(t=>literals(t).join(' & ')||"1'b1").map(s=>s.includes(' & ')?'('+s+')':s).join(' | '):"1'b0";
export function hardware(mask,terms) {
  return 'module silicon_sketch(input wire A, B, C, output wire Y);\n  assign Y = '+expression(terms)+';\nendmodule\n';
}
export function bench(mask) {
  return "`timescale 1ns/1ps\nmodule tb;\n  reg [2:0] abc; wire Y; integer i;\n  localparam [7:0] expected = 8'h"+mask.toString(16).padStart(2,'0')+";\n  silicon_sketch dut(abc[2],abc[1],abc[0],Y);\n  initial begin\n    for(i=0;i<8;i=i+1) begin\n      abc=i; #1;\n      if(Y !== expected[i]) $fatal(1,\"Mismatch at %b\",abc);\n    end\n    $display(\"PASS: all 8 vectors\"); $finish;\n  end\nendmodule\n";
}

export function faultTrace(mask,pin,stuck){
  if(![0,1,2].includes(pin)||![0,1].includes(stuck))throw Error('Invalid input fault.');
  const faultBit=1<<(2-pin);
  return Array.from({length:8},(_,row)=>{
    const actualInput=stuck ? row|faultBit : row&~faultBit;
    return {row,expected:(mask>>row)&1,observed:(mask>>actualInput)&1};
  });
}

export function oppositeVector(mask,vector){
  let nearest=null,minChanges=4;
  for(let candidate=0;candidate<8;candidate++){
    if(((mask>>candidate)&1)===((mask>>vector)&1))continue;
    const changes=signals.filter((_,i)=>bit(candidate,i)!==bit(vector,i)).length;
    if(changes<minChanges){nearest=candidate;minChanges=changes;}
  }
  return nearest;
}
