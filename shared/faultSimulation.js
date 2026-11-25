import { simulator } from '../web/net.mjs';
const MAX_VARIABLE_BITS = 8;

/** Compare healthy and faulty copies of a synthesized netlist using a repeatable stimulus.
 * @param {object} design
 * @param {{net:number,value:number}} fault
 * @returns {Generator<{inputs:object,expected:object,observed:object,failed:boolean}>}
 */
export function* faultVectors(design, fault) {
  const net = design.netlist_json,
    healthy = simulator(net),
    faulty = simulator(net);
  const ports = net.ports.filter((p) => p.dir === 'input');
  const width = ports.reduce((sum, p) => sum + p.bits.length, 0);
  const cases = (design.sample_vectors || []).map((v) => v.inputs);
  let random = 0x36f2a;
  for (let i = 0; i < 2 ** Math.min(width, MAX_VARIABLE_BITS); i++) {
    let offset = 0;
    const inputs = {};
    for (const port of ports) {
      let value = 0;
      for (let k = 0; k < port.bits.length; k++, offset++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        value += (width <= MAX_VARIABLE_BITS ? (i >> offset) & 1 : random >>> 31) * 2 ** k;
      }
      inputs[port.name] = value;
    }
    if (healthy.regs.length && 'clk' in inputs) {
      inputs.clk = i % 2;
      if ('rst' in inputs) inputs.rst = Number(i < 2);
    }
    cases.push(inputs);
  }
  for (const inputs of cases) {
    const expected = healthy.evaluate(inputs).outputs,
      observed = faulty.evaluate(inputs, fault).outputs;
    yield {
      inputs,
      expected,
      observed,
      failed: Object.keys(expected).some((k) => expected[k] !== observed[k]),
    };
  }
}
