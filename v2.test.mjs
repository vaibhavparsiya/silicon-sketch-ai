import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, prove } from './web/physical.mjs';
import { gds } from './web/gds.mjs';
import { simulator } from './web/net.mjs';
import { handle } from './worker/server.mjs';
import { compile } from './web/core.mjs';
const inverter = {
  ports: [
    { name: 'a', dir: 'input', bits: [2] },
    { name: 'y', dir: 'output', bits: [3] },
  ],
  cells: [{ type: 'NOT', name: 'n', pins: { A: 2, Y: 3 } }],
};
test('STA and binary GDS record lengths, units, closed polygons', () => {
  const p = layout(inverter, simulator(inverter));
  assert.equal(p.delay, 28);
  assert.deepEqual(p.path, [3]);
  const bytes = gds('inv', p.shapes),
    v = new DataView(bytes.buffer),
    types = [];
  for (let i = 0; i < bytes.length;) {
    const len = v.getUint16(i),
      type = bytes[i + 2];
    assert.ok(len >= 4 && len % 2 === 0 && i + len <= bytes.length);
    types.push(type);
    if (type === 16) {
      assert.equal(len, 44);
      assert.equal(v.getInt32(i + 4), v.getInt32(i + 36));
      assert.equal(v.getInt32(i + 8), v.getInt32(i + 40));
    }
    if (type === 3) {
      const decode = (j) => {
        let m = 0;
        for (let k = 1; k <= 7; k++) m += bytes[j + k] / 256 ** k;
        return m * 16 ** (bytes[j] - 64);
      };
      assert.ok(Math.abs(decode(i + 12) - 1e-9) < 1e-20);
    }
    i += len;
  }
  assert.equal(types.at(-1), 4);
  assert.equal(types.filter((t) => t === 8).length, p.shapes.length);
});
test('equivalence exhaustive and counterexample', () => {
  assert.deepEqual(prove(inverter, inverter, simulator), { status: 'Equivalent', vectors: 2 });
  const b = structuredClone(inverter);
  b.cells[0].type = 'BUF';
  assert.deepEqual(prove(inverter, b, simulator).inputs, { a: 0 });
  assert.equal(compile('~(A & B)'), compile('A NAND B'));
});
test('JPEG reaches Gemini as an image part', async (t) => {
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, o) => {
    sent = JSON.parse(o.body);
    return Response.json({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ kind: 'logic', truth_table: Array(8).fill(0) }) }],
          },
        },
      ],
    });
  });
  const origin = 'https://lab.test',
    image = 'data:image/jpeg;base64,/9j/';
  const r = await handle(
    new Request(origin + '/api/interpret', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'read sketch', image }),
    }),
    { GEMINI_API_KEY: 'fake' },
    {},
  );
  assert.equal(r.status, 200);
  assert.equal(sent.contents[0].parts[1].inlineData.data, '/9j/');
});
test('shared blind hunt keeps the forced wire private and limits probes', async () => {
  const { blind } = await import('./worker/blind.mjs'),
    { catalog } = await import('./web/catalog.mjs');
  const map = new Map(),
    bucket = {
      get: async (k) => (map.has(k) ? { json: () => JSON.parse(map.get(k)) } : null),
      put: async (k, v, opts) => {
        if (opts && map.has(k)) return null;
        map.set(k, v);
        return {};
      },
    };
  const design = catalog.adder,
    fault = { net: design.netlist_json.ports[0].bits[0], value: 1 };
  const { id } = await blind('/api/hunts', { design, fault }, bucket);
  assert.deepEqual(Object.keys(await blind('/api/hunts/open', { id }, bucket)), ['design']);
  const data = { id, inputs: { a: 0, b: 0, cin: 0 } };
  for (let i = 0; i < 4; i++)
    assert.equal((await blind('/api/hunts/probe', data, bucket)).probe, i + 1);
  await assert.rejects(blind('/api/hunts/probe', data, bucket));
  assert.equal((await blind('/api/hunts/solve', data, bucket)).solved, true);
});
