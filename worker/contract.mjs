import { synthesize, literals } from '../shared/booleanEngine.js';
import { hardware, bench, detectorRTL, detectorBench } from '../shared/verilogGenerator.js';
import { buildDetector } from '../shared/sequenceEngine.js';
import { faultVectors } from '../shared/faultSimulation.js';
/** Derive inspectable lab artifacts from a validated design.
 * @param {object} d
 * @returns {object}
 */
export function contract(d) {
  const mode = d.kind === 'logic' ? 'combinational' : d.kind;
  const result = { ok: true, mode, engine: mode, compiler_source: 'deterministic', ...d };
  if (d.kind === 'logic') {
    const terms = synthesize(d.mask),
      gates = [];
    const add = (type, inputs) => {
      const id = 'g' + (gates.length + 1);
      gates.push({ id, type, in: inputs });
      return id;
    };
    const products = terms.map((t) => {
      const wires = literals(t).map((s) => (s.startsWith('~') ? add('NOT', [s[1]]) : s));
      return wires.length > 1 ? add('AND', wires) : (wires[0] ?? '1');
    });
    const root = products.length > 1 ? add('OR', products) : (products[0] ?? '0');
    result.combinational = {
      inputs: ['A', 'B', 'C'],
      input_labels: Object.fromEntries(['A', 'B', 'C'].map((k, i) => [k, d.labels[i]])),
      output: 'Y',
      truth_table: Array.from({ length: 8 }, (_, i) => (d.mask >> i) & 1),
      device_signature: '0x' + d.mask.toString(16).padStart(2, '0').toUpperCase(),
      minimized_expression: d.formula,
      gates,
      root,
    };
    result.verilog = hardware(d.mask, terms);
    result.testbench = bench(d.mask);
  } else if (d.kind === 'sequence') {
    const table = buildDetector(d.pattern, d.overlap),
      states = table.map((_, i) => 'S' + i);
    result.sequence = {
      pattern: d.pattern,
      overlap: d.overlap,
      initial_stream: d.stream,
      states,
      transitions: Object.fromEntries(
        table.map((pair, i) => [
          states[i],
          Object.fromEntries(pair.map((v, b) => [b, [states[v.next], v.hit]])),
        ]),
      ),
    };
    result.verilog = detectorRTL(d.pattern, d.overlap);
    result.testbench = detectorBench(d.pattern, d.overlap, d.stream || d.pattern);
  } else {
    result.universal_rtl = {
      module_name: d.module_name,
      ports: d.netlist_json?.ports.map((p) => ({ name: p.name, dir: p.dir, width: p.bits.length })),
      netlist: d.netlist_json,
      sample_vectors: d.sample_vectors,
    };
  }
  result.title ??= d.kind === 'logic' ? 'Logic circuit' : 'Sequence detector';
  result.explanation = d.summary ?? d.formula ?? 'Detect ' + d.pattern + ' in a clocked stream.';
  result.module_name ??= d.kind === 'logic' ? 'silicon_sketch' : 'sequence_detector';
  result.is_sequential ??=
    d.kind === 'sequence' || /always\s*@\s*\([^)]*(?:pos|neg)edge/.test(result.verilog);
  const pins = d.kind === 'logic' ? ['A', 'B', 'C', 'Y'] : ['clk', 'rst', 'din', 'detected'];
  result.ports ??=
    d.kind === 'universal_rtl'
      ? (result.universal_rtl.ports ?? [])
      : pins.map((name, i) => ({
          name,
          dir: i === pins.length - 1 ? 'output' : 'input',
          width: 1,
          description: d.labels?.[i] ?? name,
        }));
  result.peripheral_hint ??=
    { pwm: 'pwm_motor', traffic: 'traffic_light', decoder: 'seven_segment' }[result.module_name] ??
    'none';
  return result;
}
/** Compare healthy and faulty circuits across a bounded stimulus set.
 * @param {object} d
 * @param {object} f
 * @returns {object}
 */
export function analyzeFault(d, f) {
  if (!f || ![0, 1].includes(f.stuck_at)) throw Error('Select stuck_at 0 or 1.');
  const failing = [];
  let count = 0;
  if (d.kind === 'logic') {
    const { gates, root } = contract(d).combinational;
    if (!['A', 'B', 'C', ...gates.map((g) => g.id)].includes(f.node))
      throw Error('Unknown fault node.');
    for (let i = 0; i < 8; i++) {
      const values = { A: i >> 2, B: (i >> 1) & 1, C: i & 1, 0: 0, 1: 1 };
      const read = (k) => (k === f.node ? f.stuck_at : values[k]);
      for (const g of gates) {
        const v = g.in.map(read);
        values[g.id] =
          g.type === 'NOT'
            ? 1 - v[0]
            : Number(g.type === 'AND' ? v.every(Boolean) : v.some(Boolean));
      }
      const expected = (d.mask >> i) & 1,
        observed = read(root);
      if (expected !== observed) failing.push({ vector: i, expected, observed });
      count++;
    }
  } else if (d.kind === 'universal_rtl' && d.netlist_json) {
    const net = d.netlist_json,
      ports = net.ports.filter((p) => p.dir === 'input');
    const node = Number(f.node);
    if (
      !Number.isInteger(node) ||
      (!net.cells.some((c) => (c.pins.Q ?? c.pins.Y) === node) &&
        !ports.some((p) => p.bits.includes(node)))
    )
      throw Error('Unknown net.');
    for (const { inputs, expected, observed, failed } of faultVectors(d, {
      net: node,
      value: f.stuck_at,
    })) {
      if (failed) failing.push({ inputs, expected, observed });
      count++;
    }
  } else throw Error('Select a logic or synthesized RTL design.');
  return {
    detected: !!failing.length,
    failing_vectors: failing,
    fault_coverage_percent: (100 * failing.length) / count,
    explanation: failing.length + ' of ' + count + ' applied vectors exposed the fault.',
  };
}
