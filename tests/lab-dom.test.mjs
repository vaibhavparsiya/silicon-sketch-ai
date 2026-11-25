import test from 'node:test';
import assert from 'node:assert/strict';
import { lab } from '../test-support/lab.mjs';
test('Logic Lab renders named SVGs and updates truth, waveform, fault and focus together', async (t) => {
  const dom = await lab(t, 'index', 'web/app.mjs');
  const d = dom.window.document,
    id = (name) => d.getElementById(name);
  for (const selector of ['#canvas svg', '#wave svg']) {
    const svg = d.querySelector(selector);
    assert.equal(svg.getAttribute('role'), 'img');
    assert.equal(svg.querySelectorAll('title').length, 1);
    assert.equal(svg.querySelectorAll('desc').length, 1);
  }
  const before = id('cell3').getAttribute('aria-pressed');
  id('cell3').click();
  assert.equal(id('cell3').getAttribute('aria-pressed'), String(before !== 'true'));
  assert.equal(d.activeElement.id, 'cell3');
  for (const key of ['vector5', 'sw0']) {
    id(key).click();
    assert.ok(id(key).getAttribute('aria-label'));
    assert.equal(d.activeElement.id, key);
  }
  id('remember-mask').click();
  id('compare-mask').click();
  assert.match(id('logic-proof').textContent, /Equivalent/);
  id('cell1').click();
  id('compare-mask').click();
  assert.match(id('logic-proof').textContent, /Counterexample/);
  id('inject').click();
  assert.ok(id('fault').textContent);
  assert.equal(id('fault').getAttribute('aria-live'), 'polite');
  for (const preset of d.querySelectorAll('#presets button')) preset.click();
  id('step').click();
  id('opposite').click();
  assert.equal(id('state').getAttribute('aria-live'), 'polite');
});
test('Sequence Lab uses an accessible table and replays 10101 when overlap changes', async (t) => {
  const dom = await lab(t, 'sequence', 'web/scope.mjs');
  const d = dom.window.document,
    id = (name) => d.getElementById(name),
    event = () => new dom.window.Event('submit', { cancelable: true });
  assert.equal(id('pattern').labels[0].htmlFor, 'pattern');
  assert.match(id('score').textContent, /5 clocks\s*\/\s*2 matches/);
  const clock = d.querySelector('[aria-label="Inspect clock 3"]');
  clock.click();
  assert.equal(clock.getAttribute('aria-pressed'), 'true');
  assert.equal(clock.closest('table').getAttribute('role'), null);
  assert.match(id('why').textContent, /Pattern 101 ends/);
  id('mode').value = 'restart';
  id('design').dispatchEvent(event());
  assert.match(id('score').textContent, /1 match/);
  id('zero').click();
  id('one').click();
  id('prev').click();
  id('next').click();
  id('undo').click();
  id('reset').click();
  assert.equal(id('bench').disabled, true);
  id('stream').value = '10101';
  id('play').dispatchEvent(event());
  assert.match(id('score').textContent, /5 clocks/);
});
test('RTL Lab names generated bit controls, supports a keyboard gate selection and tracks focus', async (t) => {
  const dom = await lab(t, 'rtl', 'web/rtl-ui.mjs');
  const d = dom.window.document,
    id = (name) => d.getElementById(name);
  const toggle = d.querySelector('button[data-bit]');
  assert.ok(toggle.getAttribute('aria-label'));
  toggle.click();
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  const g = d.querySelector('[data-gate="0"]');
  g.focus();
  g.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(d.activeElement.getAttribute('data-gate'), '0');
  assert.equal(d.activeElement.getAttribute('aria-pressed'), 'true');
  assert.ok(d.querySelector('#diagram title'));
  assert.ok(d.querySelector('#diagram desc'));
  for (const field of d.querySelectorAll('input,select,textarea'))
    assert.ok(d.querySelector('label[for="' + field.id + '"]'), field.id);
  id('vectors').querySelector('button').click();
  assert.match(id('vector-report').textContent, /pass/);
});
