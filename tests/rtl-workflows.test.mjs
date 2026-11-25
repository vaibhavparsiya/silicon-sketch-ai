import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { lab } from '../test-support/lab.mjs';
import { connectApi } from '../test-support/api.mjs';
import { catalog } from '../web/catalog.mjs';
import { prove } from '../web/physical.mjs';
import { simulator } from '../web/net.mjs';
import { blind } from '../worker/blind.mjs';
import { compileDraft } from '../src/components/RtlCompiler.js';
const id = (k) => document.getElementById(k);
function select(key, value) {
  id(key).value = value;
  id(key).onchange();
}
const button = (root, name) =>
  [...id(root).querySelectorAll('button')].find((b) => b.textContent === name);

test('RTL probes, physical controls, exports, clock and peripheral docks use the selected example', async (t) => {
  connectApi(t);
  const dom = await lab(t, 'rtl', 'src/components/RtlLab.jsx');
  const downloads = [];
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
    downloads.push(this.download);
  });
  const ctx = { fillRect() {}, clearRect() {} };
  t.mock.method(dom.window.HTMLCanvasElement.prototype, 'getContext', () => ctx);
  let workerNet = catalog.adder.netlist_json;
  globalThis.Worker = class {
    constructor(url) {
      this.url = url;
    }
    postMessage(data) {
      queueMicrotask(() =>
        this.onmessage({
          data: this.url.includes('proof')
            ? prove(data.golden, data.edited, simulator)
            : { net: workerNet },
        }),
      );
    }
    terminate() {}
  };
  t.after(() => {
    delete globalThis.Worker;
  });
  const port = id('port-a');
  port.value = '0xf';
  port.onchange();
  assert.match(id('outputs').textContent, /sum = 15/);
  port.value = '16';
  port.onchange();
  assert.match(id('status').textContent, /bus width/);
  id('search').click();
  assert.match(id('diff').textContent, /stuck-at/);
  const gate = catalog.adder.netlist_json.cells.find((c) => c.type === 'AND');
  select('wire', String(gate.pins.Y));
  select('view', 'xray');
  assert.match(id('xray').textContent, /VDD/);
  select('force', '1');
  assert.match(id('gate-reason').textContent, /forced/);
  id('search').click();
  assert.match(id('diff').textContent, /healthy/);
  select('view', 'die');
  id('layer-2').click();
  assert.equal(id('layers').hidden, false);
  id('frequency').oninput();
  for (const action of ['download', 'tb', 'gds', 'ys', 'make', 'vcd']) id(action).click();
  assert.deepEqual(downloads, [
    'adder.v',
    'adder_tb.v',
    'adder.gds',
    'synth.ys',
    'Makefile',
    'adder.vcd',
  ]);
  await id('prove').onclick();
  assert.match(id('proof').textContent, /Equivalent/);
  select('view', 'gate');
  select('examples', 'pwm');
  id('stress').checked = true;
  for (const name of ['Pulse reset', 'Step clock', '1 Hz', '4 Hz', 'Pause'])
    button('clock', name).click();
  assert.match(id('dock').textContent, /PWM duty/);
  select('examples', 'decoder');
  assert.match(id('dock').textContent, /Seven-segment/);
  select('examples', 'traffic');
  button('clock', 'Step clock').click();
  assert.match(id('dock').textContent, /Intersection/);
  id('request').value = 'Make an 8-bit ALU';
  await id('lab-prompt').onsubmit({ preventDefault() {} });
  assert.equal(id('top').value, 'alu');
  workerNet = catalog.alu.netlist_json;
  id('build').click();
  await wait(5);
  assert.equal(id('status').textContent, 'Synthesized netlist ready.');
  assert.equal(id('tb').disabled, true);
});
test('public challenges and shared RTL hunts run through the normal UI and bounded API', async (t) => {
  const env = connectApi(t);
  const fault = { net: catalog.adder.netlist_json.ports[0].bits[0], value: 1 };
  const hunt = await blind('/api/hunts', { design: catalog.adder, fault }, env.BUCKET);
  await lab(t, 'rtl', 'src/components/RtlLab.jsx', '?hunt=' + hunt.id);
  for (let i = 0; i < 80 && id('blind-tools').hidden; i++) await wait(5);
  assert.equal(id('blind-tools').hidden, false);
  await id('blind-probe').onclick();
  assert.match(id('blind-result').textContent, /"probe":1/);
  await id('blind-solve').onclick();
  assert.match(id('blind-result').textContent, /"solved":true/);
  await id('blind-probe').onclick();
  assert.match(id('blind-result').textContent, /closed/);
  await id('start').onclick();
  await id('probe').onclick();
  await id('verify').onclick();
  assert.match(id('results').textContent, /diagnosis/);
  await id('probe').onclick();
  assert.match(id('results').textContent, /closed/);
  await id('save').onclick();
  assert.match(id('shared').textContent, /design=/);
  id('sabotage').checked = true;
  await id('save').onclick();
  assert.match(id('shared').textContent, /Select a net/);
  select('force', '1');
  await id('save').onclick();
  assert.match(id('shared').textContent, /hunt=/);
});
test('draft repair installs only successful current work and reports an unusable compiler', async (t) => {
  await lab(t, 'rtl', 'src/components/RtlLab.jsx');
  let replies = [],
    installed = [],
    repairs = 0;
  globalThis.Worker = class {
    postMessage() {
      const response = replies.shift();
      queueMicrotask(() =>
        response === 'network' ? this.onerror() : this.onmessage({ data: response }),
      );
    }
    terminate() {}
  };
  t.after(() => {
    delete globalThis.Worker;
  });
  t.mock.method(globalThis, 'fetch', async () => {
    repairs++;
    return Response.json(catalog.adder);
  });
  const apply = (d) => installed.push(d),
    current = () => true;
  replies = [{ error: 'syntax error' }, { net: catalog.adder.netlist_json }];
  await compileDraft(catalog.adder, 'add four bits', apply, current);
  assert.equal(repairs, 1);
  assert.equal(installed.length, 1);
  assert.deepEqual(installed[0].netlist_json, catalog.adder.netlist_json);
  replies = [{ net: catalog.alu.netlist_json }];
  await compileDraft(catalog.alu, 'newer', apply, () => false);
  assert.equal(installed.length, 1);
  replies = ['network'];
  await compileDraft(catalog.adder, '', apply, current);
  assert.match(id('status').textContent, /WebAssembly compiler/);
});
