// Educational cell geometry in nanometres and nominal delays in picoseconds.
/** Place cells and estimate nominal timing in the educational geometry model.
 * @param {object} net
 * @param {object} sim
 * @returns {object}
 */
export function layout(net, sim) {
  const shapes = [],
    locations = new Map(),
    arrival = new Map(),
    paths = new Map();
  const box = (layer, x, y, w, h, wire) => shapes.push({ layer, x, y, w, h, wire });
  let i = 0;
  for (const cell of [...sim.regs, ...sim.groups.flat()]) {
    const x = (i % 16) * 2000 + 1000,
      y = Math.floor(i++ / 16) * 3000 + 1000;
    const out = cell.pins.Q ?? cell.pins.Y;
    locations.set(out, { x, y });
    box(1, x, y, 1250, 750);
    box(2, x + 140, y + 220, 950, 300);
    box(3, x + 540, y + 100, 110, 1000, out);
    box(4, x + 880, y + 270, 120, 120, out);
    if ((i - 1) % 16 === 0) {
      box(5, x - 500, y - 250, 32000, 100);
      box(5, x - 500, y + 1450, 32000, 100);
    }
    const pins = Object.entries(cell.pins).filter(([k]) => k !== 'Y' && k !== 'Q');
    let parent = null,
      latest = 0;
    for (const [, n] of pins) {
      if ((arrival.get(n) || 0) > latest) {
        latest = arrival.get(n);
        parent = n;
      }
    }
    const delay =
      cell.type === 'MUX' ? 92 : cell.type.includes('XOR') ? 80 : cell.type === 'NOT' ? 28 : 55;
    arrival.set(out, cell.pins.Q !== undefined ? 45 : latest + delay);
    paths.set(out, cell.pins.Q !== undefined ? [out] : [...(paths.get(parent) || []), out]);
  }
  for (const c of net.cells) {
    const dest = locations.get(c.pins.Q ?? c.pins.Y);
    Object.entries(c.pins).forEach(([k, n], j) => {
      const start = locations.get(n);
      if (!start || k === 'Y' || k === 'Q') return;
      const x = start.x + 920,
        y = start.y + 320,
        tx = dest.x + 150 + j * 140,
        ty = dest.y + 380;
      box(5, Math.min(x, tx), y, Math.abs(x - tx) + 80, 80, n);
      box(6, tx, y, 80, 80, n);
      box(7, tx, Math.min(y, ty), 80, Math.abs(ty - y) + 80, n);
    });
  }
  const ends = [
    ...net.ports.filter((p) => p.dir === 'output').flatMap((p) => p.bits),
    ...sim.regs.map((c) => c.pins.D),
  ];
  const worst = ends.reduce(
    (a, b) => ((arrival.get(b) || 0) > (arrival.get(a) || 0) ? b : a),
    null,
  );
  const width = Math.min(16, i) * 2 + 2,
    height = Math.ceil(i / 16) * 3 + 1;
  const captures = sim.regs
    .map((c) => ({ net: c.pins.Q, delay: (arrival.get(c.pins.D) || 0) + 35 }))
    .sort((a, b) => b.delay - a.delay);
  return {
    captures,
    shapes,
    width,
    height,
    area: width * height,
    delay: arrival.get(worst) || 0,
    path: paths.get(worst) || [],
    cells: i,
  };
}
/** Exhaust matching combinational interfaces up to sixteen input bits.
 * @param {object} a
 * @param {object} b
 * @param {Function} simulate
 * @returns {object}
 */
export function prove(a, b, simulate) {
  const signature = (n) =>
    n.ports
      .map((p) => [p.name, p.dir, p.bits.length].join('/'))
      .sort()
      .join(',');
  if (signature(a) !== signature(b)) return { status: 'Port interfaces differ' };
  const first = simulate(a),
    second = simulate(b),
    inputs = a.ports.filter((p) => p.dir === 'input');
  const width = inputs.reduce((s, p) => s + p.bits.length, 0);
  if (first.regs.length || second.regs.length || width > 16)
    return { status: 'Proof supports combinational circuits of up to 16 input bits' };
  for (let i = 0; i < 2 ** width; i++) {
    let value = i;
    const v = {};
    for (const p of inputs) {
      v[p.name] = value % 2 ** p.bits.length;
      value = Math.floor(value / 2 ** p.bits.length);
    }
    const x = first.evaluate(v).outputs,
      y = second.evaluate(v).outputs;
    if (Object.keys(x).some((k) => x[k] !== y[k]))
      return { status: 'Counterexample', inputs: v, golden: x, edited: y };
  }
  return { status: 'Equivalent', vectors: 2 ** width };
}
