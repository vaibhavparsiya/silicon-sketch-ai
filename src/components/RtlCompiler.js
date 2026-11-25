import { api } from '../api/client.js';
import { byId as $ } from './dom.js';
/** Synthesize one draft in an isolated worker and release it on completion.
 * @param {object} d
 * @returns {Promise<object>}
 */
export function runWorker(d) {
  return new Promise((resolve, reject) => {
    const w = new Worker('/yosys-worker.mjs', { type: 'module' });
    const finish = (fn, x) => {
      clearTimeout(timer);
      w.terminate();
      fn(x);
    };
    const timer = setTimeout(
      () => finish(reject, Error('Compiler download or synthesis exceeded 20 seconds.')),
      20000,
    );
    w.onmessage = (e) =>
      e.data.error ? finish(reject, Error(e.data.error)) : finish(resolve, e.data.net);
    w.onerror = () => finish(reject, Error('Could not load the WebAssembly compiler.'));
    w.postMessage(d);
  });
}
/** Synthesize, request a bounded repair if needed, and install the current draft.
 * @param {object} d
 * @param {string} originPrompt
 * @param {Function} onInstall
 * @param {Function} isCurrent
 * @returns {Promise<void>}
 */
export async function compileDraft(d, originPrompt, onInstall, isCurrent) {
  for (let attempt = 0; attempt < 3; attempt++) {
    $('status').textContent = attempt
      ? 'Refining RTL synthesis…'
      : 'Loading and running Yosys WASM…';
    try {
      const result = await runWorker(d);
      if (!isCurrent()) return;
      onInstall({ ...d, netlist_json: result }, !originPrompt);
      return;
    } catch (e) {
      if (!isCurrent()) return;
      if (!originPrompt || attempt === 2 || /download|load|fetch|20 seconds/i.test(e.message)) {
        $('status').textContent = e.message;
        return;
      }
      try {
        d = await api('/api/repair', {
          prompt: originPrompt,
          verilog: d.verilog,
          yosys_error: e.message.slice(-2400),
        });
      } catch (err) {
        $('status').textContent = e.message + ' ' + err.message;
        return;
      }
    }
  }
}
