import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, synthesize, covers, presets, expression, hardware, bench } from './web/core.mjs';
test('every three-input truth table round trips through synthesis', () => {
  for (let mask = 0; mask < 256; mask++) {
    const terms = synthesize(mask);
    for (let i = 0; i < 8; i++)
      assert.equal(
        terms.some((t) => covers(t, i)),
        Boolean(mask & (1 << i)),
      );
    const rtl = expression(terms)
      .replaceAll('~', 'not ')
      .replaceAll('&', ' and ')
      .replaceAll('|', ' or ');
    if (mask !== 0 && mask !== 255) assert.equal(compile(rtl), mask);
    assert.ok(bench(mask).includes("8'h" + mask.toString(16).padStart(2, '0')));
  }
});
test('matches independent truth tables for the demo designs', () => {
  assert.deepEqual(
    presets.map((p) => compile(p.rule)),
    [232, 150, 216, 224],
  );
});
test('precedence, inversion, English and selector variations', () => {
  assert.equal(compile('Y = A and not B or C'), (240 & ~204) | 170);
  assert.equal(compile('A is high and B is low'), 48);
  assert.equal(compile('If A then B else C'), (240 & 204) | (~240 & 170));
});
test('reduces redundant inputs, constant low and constant high', () => {
  assert.deepEqual(synthesize(240), ['1--']);
  assert.match(hardware(0, synthesize(0)), /assign Y = 1'b0/);
  assert.match(hardware(255, synthesize(255)), /assign Y = 1'b1/);
});
test('rejects malformed rules and out-of-range tables', () => {
  for (const s of ['', 'A + B', '(A or B', 'A B', 'A or', 'x'.repeat(201), 'constructor'])
    assert.throws(() => compile(s));
  for (const n of [-1, 256, 1.1]) assert.throws(() => synthesize(n));
});
import { faultTrace } from './web/core.mjs';
test('finds the first counterexample and masked faults', () => {
  assert.deepEqual(
    faultTrace(232, 0, 0)
      .filter((x) => x.expected !== x.observed)
      .map((x) => x.row),
    [5, 6],
  );
  assert.ok(faultTrace(240, 2, 1).every((x) => x.expected === x.observed));
});
test('suggested input changes reach the nearest opposite output for all 256 functions', async () => {
  const { oppositeVector } = await import('./web/core.mjs');
  const distance = (a, b) => (a ^ b).toString(2).replaceAll('0', '').length;
  for (let mask = 0; mask < 256; mask++)
    for (let input = 0; input < 8; input++) {
      const other = oppositeVector(mask, input);
      if (mask === 0 || mask === 255) {
        assert.equal(other, null);
        continue;
      }
      const out = (v) => (mask >> v) & 1;
      assert.notEqual(out(other), out(input));
      for (let v = 0; v < 8; v++)
        if (out(v) !== out(input)) assert.ok(distance(other, input) <= distance(v, input));
    }
});
