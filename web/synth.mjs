import { identifier } from '../shared/validators.js';
import { compact } from './net.mjs';
/** Run the pinned Yosys flow and validate its compact output netlist.
 * @param {Function} run
 * @param {string} rtl
 * @param {string} top
 * @returns {Promise<object>}
 */
export async function synth(run, rtl, top) {
  if (!identifier(top) || typeof rtl !== 'string' || rtl.length > 32768)
    throw Error('Invalid top module or oversized RTL.');
  let log = '';
  const errors = (bytes) => {
    if (bytes) log = (log + new TextDecoder().decode(bytes)).slice(-2000);
  };
  let out;
  try {
    out = await run(
      [
        '-Q',
        '-q',
        '-p',
        'read_verilog design.v; hierarchy -check -top ' +
          top +
          '; flatten; proc; opt; fsm; opt; memory; opt; wreduce; techmap; opt; check -assert; write_json out.json',
      ],
      { 'design.v': rtl },
      { stderr: errors, stdout: null },
    );
  } catch (e) {
    throw Error(log || e.message);
  }
  const file = out['out.json'];
  const net = compact(
    JSON.parse(typeof file === 'string' ? file : new TextDecoder().decode(file)),
    top,
  );
  if (net.cells.length > 250) throw Error('Browser synthesis supports 250 cells.');
  return net;
}
