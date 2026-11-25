import { rtlDesign } from './rtl.mjs';
import { simulator } from '../web/net.mjs';
/** Run a shared diagnosis game using conditional storage writes.
 * @param {string} path
 * @param {object} body
 * @param {object} bucket
 * @returns {Promise<object>}
 */
export async function blind(path, body, bucket) {
  const create = path === '/api/hunts',
    id = create ? crypto.randomUUID() : body.id;
  if (typeof id !== 'string' || !/^[-a-f0-9]{36}$/.test(id)) throw Error('Invalid hunt ID.');
  const key = 'hunts/' + id;
  if (create) {
    const design = rtlDesign(body.design),
      net = design.netlist_json;
    if (!net || simulator(net).regs.length)
      throw Error('Choose a synthesized combinational design.');
    const node = body.fault?.net,
      value = body.fault?.value;
    if (
      !Number.isInteger(node) ||
      ![0, 1].includes(value) ||
      (!net.ports.some((p) => p.dir === 'input' && p.bits.includes(node)) &&
        !net.cells.some((c) => c.pins.Y === node))
    )
      throw Error('Select a net and stuck-at value.');
    await bucket.put(key, JSON.stringify({ design, fault: { net: node, value } }));
    return { id };
  }
  const saved = await bucket.get(key);
  if (!saved) throw Error('Hunt not found.');
  const { design, fault } = await saved.json();
  if (path === '/api/hunts/open') return { design };
  if (await bucket.get(key + '/final')) throw Error('Hunt closed.');
  const inputs = body.inputs,
    ports = design.netlist_json.ports.filter((p) => p.dir === 'input');
  if (
    !inputs ||
    ports.some(
      (p) =>
        !Number.isSafeInteger(inputs[p.name]) ||
        inputs[p.name] < 0 ||
        inputs[p.name] >= 2 ** p.bits.length,
    )
  )
    throw Error('Set each input to a valid value.');
  const sim = simulator(design.netlist_json),
    expected = sim.evaluate(inputs).outputs,
    observed = sim.evaluate(inputs, fault).outputs;
  if (path === '/api/hunts/solve') {
    const solved = Object.keys(expected).some((k) => expected[k] !== observed[k]);
    if (
      !(await bucket.put(key + '/final', JSON.stringify({ solved }), {
        onlyIf: { etagDoesNotMatch: '*' },
      }))
    )
      throw Error('Hunt closed.');
    return { solved, expected, observed };
  }
  for (let i = 1; i <= 4; i++)
    if (await bucket.put(key + '/p' + i, '1', { onlyIf: { etagDoesNotMatch: '*' } }))
      return { probe: i, expected, observed };
  throw Error('Four probes used. Submit your failing input vector.');
}
