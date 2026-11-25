import test from 'node:test';
import assert from 'node:assert/strict';
import { runYosys } from '@yowasp/yosys';
import { synth } from '../web/synth.mjs';
import { compact, simulator } from '../web/net.mjs';
import { contract, analyzeFault } from '../worker/contract.mjs';
import { rtlDesign } from '../worker/rtl.mjs';
import { interpret } from '../worker/interpreter.mjs';
import { catalog } from '../web/catalog.mjs';
import { layout, prove } from '../web/physical.mjs';

test('Yosys synthesizes a custom five-bit rotator and simulation agrees with an independent oracle on all 32 inputs', async () => {
  const rtl = 'module rot5(input [4:0] a,output [4:0] y); assign y={a[2:0],a[4:3]}; endmodule';
  const net = await synth(runYosys, rtl, 'rot5'),
    sim = simulator(net);
  for (let a = 0; a < 32; a++)
    assert.equal(sim.evaluate({ a }).outputs.y, ((a << 2) | (a >> 3)) & 31);
  assert.deepEqual(
    net.ports.map((p) => [p.name, p.bits.length]),
    [
      ['a', 5],
      ['y', 5],
    ],
  );
});
test('EDA rejects malformed compilers, unknown top names and unsupported cell buses', async () => {
  await assert.rejects(
    synth(() => {}, 'module a; endmodule', 'a'.repeat(33)),
    /Invalid top/,
  );
  const bad = async (args, files, io) => {
    io.stderr(new TextEncoder().encode('diagnostic'));
    throw Error('upstream');
  };
  await assert.rejects(synth(bad, 'broken', 'top'), /diagnostic/);
  assert.throws(() => compact({ modules: {} }, 'missing'), /Top module/);
  assert.throws(
    () =>
      compact(
        {
          modules: {
            top: { ports: {}, cells: { z: { type: '$_BUF_', connections: { Y: [1, 2] } } } },
          },
        },
        'top',
      ),
    /wide cell/,
  );
});
test('fault API and local search share stimulus and report independently checkable differences', () => {
  const logic = interpret('At least two inputs are high');
  assert.deepEqual(
    analyzeFault(logic, { node: 'A', stuck_at: 0 }).failing_vectors.map((v) => v.vector),
    [5, 6],
  );
  assert.ok(contract(logic).combinational.gates.length);
  assert.throws(() => analyzeFault(logic, { node: 'Z', stuck_at: 1 }));
  assert.throws(() => analyzeFault(logic, { node: 'A', stuck_at: 2 }));
  assert.throws(() => analyzeFault(interpret('Detect 101'), { node: 'A', stuck_at: 1 }));
  for (const d of [catalog.adder, catalog.counter, catalog.alu]) {
    const pin = d.netlist_json.ports.find((p) => p.dir === 'input').bits[0];
    const response = analyzeFault(d, { node: pin, stuck_at: 1 });
    assert.equal(response.detected, response.failing_vectors.length > 0);
    if (d === catalog.adder) assert.ok(response.detected);
    for (const row of response.failing_vectors) assert.notDeepEqual(row.expected, row.observed);
    const plan = layout(d.netlist_json, simulator(d.netlist_json));
    assert.ok(plan.shapes.some((s) => s.layer === 7));
  }
  assert.throws(() => analyzeFault(catalog.adder, { node: 10000, stuck_at: 1 }));
  assert.match(
    prove(catalog.counter.netlist_json, catalog.counter.netlist_json, simulator).status,
    /combinational/,
  );
  assert.match(
    prove(catalog.alu.netlist_json, catalog.adder.netlist_json, simulator).status,
    /interfaces/,
  );
});
test('RTL identifiers, vector ranges and probe dictionaries are validated at the public boundary', () => {
  const base = catalog.adder;
  for (const addition of [
    { module_name: 'a'.repeat(33) },
    { ports: [{ name: '0abc', dir: 'input', width: 1 }] },
    { ports: [{ name: 'ok', dir: 'input', width: 0 }] },
    { sample_vectors: [null] },
    { sample_vectors: [{ inputs: [], expected: {} }] },
    { sample_vectors: [{ inputs: { a: -1 }, expected: {} }] },
    { inputs: { 'bad wire': 2 } },
    { inputs: { a: -1 } },
  ])
    assert.throws(() => rtlDesign({ ...base, ...addition }));
  assert.deepEqual(rtlDesign({ ...base, inputs: { a: 4 } }).inputs, { a: 4 });
});
