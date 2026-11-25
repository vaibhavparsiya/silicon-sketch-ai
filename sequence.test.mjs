import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDetector, simulate, detectorRTL, detectorBench } from './web/sequence.mjs';
test('10101 produces two overlapping matches or one non-overlapping match', () => {
  for (const [overlap, expected] of [
    [true, [3, 5]],
    [false, [3]],
  ]) {
    assert.deepEqual(
      simulate(buildDetector('101', overlap), '10101')
        .filter((r) => r.hit)
        .map((r) => r.cycle),
      expected,
    );
  }
});
test('all 510 patterns in both modes match a direct substring oracle across every reachable edge', () => {
  for (let size = 1; size <= 8; size++)
    for (let n = 0; n < 2 ** size; n++) {
      const p = n.toString(2).padStart(size, '0');
      for (const mode of [true, false]) {
        const m = buildDetector(p, mode);
        for (let k = 0; k < size; k++)
          for (const input of ['0', '1']) {
            const s = p.slice(0, k) + input;
            const last = simulate(m, s).at(-1);
            const hit = Number(s === p);
            const prefixes = Array.from({ length: size }, (_, i) => p.slice(0, i)).filter(
              (prefix) => s.endsWith(prefix),
            );
            assert.equal(last.state, k);
            assert.equal(last.hit, hit);
            assert.equal(last.next, hit && !mode ? 0 : prefixes.at(-1).length);
          }
        const stream = p.repeat(4) + '00101110101';
        let ready = 1;
        const observed = simulate(m, stream)
            .filter((r) => r.hit)
            .map((r) => r.cycle),
          expected = [];
        for (let end = size; end <= stream.length; end++)
          if (end - size + 1 >= ready && stream.slice(end - size, end) === p) {
            expected.push(end);
            if (!mode) ready = end + 1;
          }
        assert.deepEqual(observed, expected);
      }
    }
});
test('RTL covers all states and bench encodes the original stream independently', () => {
  const rtl = detectorRTL('101', true);
  assert.match(rtl, /reg \[1:0\] state/);
  assert.equal(rtl.match(/: begin/g).length, 4);
  assert.match(detectorRTL('0', true), /reg \[0:0\] state/);
  assert.deepEqual(
    [...detectorBench('101', true, '10101').matchAll(/step\(1'b[01], 1'b([01])\)/g)].map(
      (x) => x[1],
    ),
    [...'00101'],
  );
});
test('reset, trace limits and invalid input', () => {
  const m = buildDetector('1');
  assert.deepEqual(simulate(m, ''), []);
  assert.equal(simulate(m, '1'.repeat(96)).length, 96);
  for (const p of ['', '10x', '1'.repeat(9)]) assert.throws(() => buildDetector(p));
  for (const s of ['0x', '1'.repeat(97)]) assert.throws(() => simulate(m, s));
  assert.throws(() => detectorBench('01', false, ''));
});
