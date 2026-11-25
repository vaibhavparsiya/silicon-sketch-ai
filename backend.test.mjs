import test from 'node:test';
import assert from 'node:assert/strict';
import {interpret} from './worker/interpreter.mjs';
import {handle} from './worker/server.mjs';
test('describes named input conditions, counts, detector and original grammar',()=>{
  assert.equal(interpret('Turn on the alarm when smoke and heat are high').mask,192);
  assert.equal(interpret('Turn on the alarm when at least two of three sensors are active').mask,232);
  assert.equal(interpret('A and (B or C)').mask,224);
  assert.equal(interpret('Detect 101 in 10101 without overlap').overlap,false);
  assert.throws(()=>interpret('design a processor'));
});
test('server persists a validated design and rejects foreign writes and oversized submissions',async()=>{
  const saved=new Map(),env={BUCKET:{put:(k,v)=>saved.set(k,v),get:k=>saved.has(k)?{json:()=>JSON.parse(saved.get(k))}:null}};
  const root='https://example.test',url=root+'/api/designs';
  const write=(data,origin=root)=>handle(new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}),env,{});
  const d=interpret('Detect 101 in 10101'),r=await write(d);
  assert.equal(r.status,201);const {id}=await r.json();
  assert.deepEqual(await (await handle(new Request(url+'/'+id),env,{})).json(),d);
  assert.equal((await write(d,'https://other.test')).status,403);
  assert.equal((await write({bad:true})).status,422);
  assert.equal((await write('a'.repeat(9000))).status,413);
});
