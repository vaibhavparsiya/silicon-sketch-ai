import test from 'node:test';
import assert from 'node:assert/strict';
import { compilerSource } from '../web/compilerArchive.mjs';
import { catalog } from '../web/catalog.mjs';

function record(name, content) {
  const data = new TextEncoder().encode(content),
    bytes = new Uint8Array(512 + 512 * Math.ceil(data.length / 512));
  bytes.set(new TextEncoder().encode(name));
  bytes.set(new TextEncoder().encode(data.length.toString(8)), 124);
  bytes.set(data, 512);
  return bytes;
}
test('compiler archive resolves runtime assets and rejects incomplete or truncated packages', () => {
  const js = record(
    'package/gen/bundle.js',
    'new URL("./yosys.core.wasm", import.meta.url);new URL("./other", import.meta.url);',
  );
  const wasm = record('package/gen/yosys.core.wasm', 'WASM'),
    data = record('package/gen/resources.bin', 'data');
  const tar = Buffer.concat([
      record('package/LICENSE', 'text'),
      js,
      wasm,
      data,
      new Uint8Array(512),
    ]),
    source = compilerSource(tar);
  assert.match(source, /blob:/);
  assert.match(source, /new URL\("\.\/other"/);
  assert.doesNotMatch(source, /\.\/yosys\.core\.wasm/);
  assert.throws(() => compilerSource(js), /Incomplete/);
  assert.throws(() => compilerSource(js.subarray(0, 513)), /Invalid/);
});
test('browser workers report digest and download errors and compute equivalence through the message boundary', async (t) => {
  const responses = [];
  globalThis.self = { postMessage: (v) => responses.push(v) };
  t.after(() => {
    delete globalThis.self;
  });
  let ok = false;
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('fixture', { status: ok ? 200 : 503 }),
  );
  await import('../web/yosys-worker.mjs');
  await self.onmessage({ data: {} });
  assert.match(responses.pop().error, /503/);
  ok = true;
  await self.onmessage({ data: {} });
  assert.match(responses.pop().error, /integrity/);
  await import('../web/proof-worker.mjs');
  const design = catalog.adder.netlist_json;
  self.onmessage({ data: { golden: design, edited: design } });
  assert.equal(responses.pop().status, 'Equivalent');
  self.onmessage({ data: { golden: {}, edited: design } });
  assert.ok(responses.pop().status);
});
