import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from './web/catalog.mjs';
import {simulator} from './web/net.mjs';
import {challenge} from './worker/challenge.mjs';
import {rtlDesign} from './worker/rtl.mjs';
test('every adder input including carry agrees with binary arithmetic',()=>{
 const sim=simulator(catalog.adder.netlist_json);
 for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let cin=0;cin<2;cin++){
   assert.deepEqual(sim.evaluate({a,b,cin}).outputs,{sum:(a+b+cin)%16,cout:Number(a+b+cin>15)});
 }
});
test('ALU operation mapping and flags on boundary operands',()=>{
 const s=simulator(catalog.alu.netlist_json);
 for(const a of [0,1,127,128,255])for(const b of [0,1,128,255])for(let opcode=0;opcode<5;opcode++){
 const r=[a+b,a-b,a&b,a|b,a^b][opcode];assert.deepEqual(s.evaluate({a,b,opcode}).outputs,{y:r&255,zero:Number(!(r&255)),carry:Number(r<0||r>255)});
 }
});
test('counter resets and updates only on a rising clock',()=>{
 const s=simulator(catalog.counter.netlist_json);for(const [clk,rst,up,want] of [[0,1,1,0],[1,1,1,0],[0,0,1,0],[1,0,1,1],[1,0,0,1],[0,0,0,1],[1,0,0,0]])assert.equal(s.evaluate({clk,rst,up}).outputs.count,want);
});
test('each example validates, unsafe cell models and overlarge designs are refused',()=>{
 for(const d of Object.values(catalog))assert.deepEqual(rtlDesign(d),d);
 assert.throws(()=>rtlDesign({...catalog.adder,verilog:'x'.repeat(32769)}));
 assert.throws(()=>simulator({ports:catalog.adder.netlist_json.ports,cells:[{type:'OTHER',pins:{}}]}));
});
test('hidden challenge enforces four probes and one final answer',async()=>{
 const db=new Map(),env={BUCKET:{put:(k,v,o)=>{if(o&&db.has(k))return null;db.set(k,v);return {};},get:k=>db.has(k)?{json:()=>JSON.parse(db.get(k))}:null}};
 const d=await challenge('/api/challenge',{},env);const b={challenge_id:d.challenge_id};
 for(let i=0;i<4;i++)assert.equal((await challenge('/api/probe',{...b,vector:i},env)).used,i+1);
 await assert.rejects(challenge('/api/probe',{...b,vector:4},env));
 const f=JSON.parse(db.get('ctf/'+b.challenge_id));
 assert.deepEqual(await challenge('/api/verify-fault',{...b,guessed_faults:[f]},env),{solved:true});
 await assert.rejects(challenge('/api/probe',{...b,vector:1},env));
});
