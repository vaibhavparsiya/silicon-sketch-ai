import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { lab } from '../test-support/lab.mjs';
import { connectApi } from '../test-support/api.mjs';
import { api } from '../src/api/client.js';
import { sketch } from '../web/sketch.mjs';
import { catalog } from '../web/catalog.mjs';
import { shareTools } from '../web/service.mjs';
const id = (key) => document.getElementById(key);
const submit = { preventDefault() {} };
async function until(read) {
  for (let i = 0; i < 80; i++) {
    if (read()) return;
    await wait(5);
  }
  assert.ok(read());
}

test('prompt, snapshots, portable restore and clipboard feedback use the normal Logic Lab controls', async (t) => {
  const env = connectApi(t),
    dom = await lab(t, 'index', 'src/components/LogicLab.jsx');
  const exports = [];
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
    exports.push(this.download);
  });
  id('rule').value = 'A and B';
  id('rule').oninput();
  id('editor').onsubmit(submit);
  await until(() => id('msg').textContent.includes('review'));
  assert.equal(id('hex').textContent, '0xC0');
  id('ai').click();
  await until(() => id('msg').textContent.includes('provider key'));
  id('photo').onchange();
  id('rtl').click();
  id('tb').click();
  assert.deepEqual(exports, ['silicon_sketch.v', 'tb.sv']);
  id('pin').value = 'C';
  id('inject').click();
  assert.match(id('fault').textContent, /Undetectable/);
  id('pin').value = 'A';
  id('pin').onchange();
  id('fault').querySelector('button').click();
  id('editor').ondragover({ dataTransfer: { types: ['Files'] }, preventDefault() {} });
  id('editor').ondrop({ dataTransfer: { files: [] } });

  await id('save').onclick();
  let link = id('shared').querySelector('a');
  assert.match(link.href, /design=/);
  const storedUrl = link.href;
  await id('shared').querySelector('button').onclick();
  assert.match(id('shared').textContent, /Select and copy/);
  let copied;
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: async (text) => {
        copied = text;
      },
    },
    configurable: true,
  });
  try {
    await id('shared').querySelector('button').onclick();
    assert.equal(copied, link.href);
    assert.match(id('shared').textContent, /Link copied/);
  } finally {
    delete navigator.clipboard;
  }
  const restored = [];
  dom.reconfigure({ url: storedUrl });
  globalThis.location = dom.window.location;
  shareTools(
    () => ({}),
    (d) => restored.push(d),
  );
  await until(() => restored.length);
  assert.equal(restored[0].mask, 192);
  env.BUCKET = undefined;
  dom.reconfigure({ url: 'https://lab.test/' });
  globalThis.location = dom.window.location;
  shareTools(
    () => restored[0],
    () => {},
  );
  await id('save').onclick();
  link = id('shared').querySelector('a');
  assert.match(link.hash, /snapshot=/);
  dom.reconfigure({ url: link.href });
  globalThis.location = dom.window.location;
  shareTools(
    () => ({}),
    (d) => restored.push(d),
  );
  await until(() => restored.length === 2);
  assert.equal(restored[1].mask, 192);
});
test('sequence prompt, invalid stream, capacity and downloadable benches use the live state', async (t) => {
  connectApi(t);
  const dom = await lab(t, 'sequence', 'src/components/SequenceLab.jsx');
  const names = [];
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
    names.push(this.download);
  });
  id('request').value = 'Detect 110 in 11011 without overlap';
  id('request').dispatchEvent(new dom.window.Event('input'));
  await id('lab-prompt').onsubmit(submit);
  assert.equal(id('pattern').value, '110');
  assert.equal(id('mode').value, 'restart');
  await id('lab-prompt').onsubmit({ ...submit, submitter: { value: 'ai' } });
  assert.match(id('prompt-status').textContent, /provider key/);
  id('stream').value = '2';
  id('play').onsubmit(submit);
  assert.match(id('notice').textContent, /binary/);
  id('stream').value = '1'.repeat(96);
  id('play').onsubmit(submit);
  assert.match(id('notice').textContent, /96 clocks/);
  id('pattern').value = 'oops';
  id('design').onsubmit(submit);
  assert.match(id('notice').textContent, /pattern/);
  id('rtl').click();
  id('bench').click();
  assert.deepEqual(names, ['sequence_detector.v', 'sequence_tb.sv']);
  await id('save').onclick();
  assert.match(id('shared').querySelector('a').href, /sequence.*design=/);
});
test('sketch selection bounds file input, resizes JPEGs and releases image resources', async (t) => {
  const dom = await lab(t, 'index', 'src/components/LogicLab.jsx');
  let closed = 0,
    qualityCalls = 0;
  globalThis.createImageBitmap = async () => ({
    width: 2400,
    height: 1200,
    close() {
      closed++;
    },
  });
  t.after(() => {
    delete globalThis.createImageBitmap;
  });
  const ctx = { fillRect() {}, drawImage() {} };
  t.mock.method(dom.window.HTMLCanvasElement.prototype, 'getContext', () => ctx);
  t.mock.method(dom.window.HTMLCanvasElement.prototype, 'toDataURL', () =>
    ++qualityCalls < 4 ? 'x'.repeat(30000) : 'data:image/jpeg;base64,/9j/',
  );
  assert.equal(await sketch(), undefined);
  await assert.rejects(sketch({ type: 'text/plain', size: 4 }));
  await assert.rejects(sketch({ type: 'image/png', size: 9000000 }));
  assert.equal(await sketch({ type: 'image/png', size: 4 }), 'data:image/jpeg;base64,/9j/');
  assert.equal(closed, 1);
});
test('client transmits compressed large designs within both memory and wire limits', async (t) => {
  connectApi(t);
  const design = { ...catalog.adder, verilog: ' '.repeat(31000) + catalog.adder.verilog };
  const result = await api('/api/validate', design);
  assert.equal(result.verilog, design.verilog);
  await assert.rejects(api('/api/validate', { payload: 'a'.repeat(530000) }), /size limit/);
});
