import { svg } from './svg.js';
import { byId as $ } from './dom.js';
/** Draw the synthesized netlist and preserve a selected gate across updates.
 * @param {object} net
 * @param {object} sim
 * @param {object} state
 * @param {number|null} pin
 * @param {Function} chooseNet
 * @returns {void}
 */
export function graph(net, sim, state, pin, chooseNet) {
  const focusId = document.activeElement?.getAttribute('data-gate');
  let gateIndex = 0;
  const groups = [...sim.groups],
    positions = new Map(),
    drawing = svg('svg', { role: 'group', 'aria-label': 'Gate layers' });
  drawing.append(
    svg('title', {}, 'Gate schematic'),
    svg(
      'desc',
      {},
      'Choose a gate or use the Net selector to inspect its output. ' +
        Object.entries(state.outputs)
          .map(([k, v]) => k + ' ' + v)
          .join(', '),
    ),
  );
  const layers = [
    net.ports
      .filter((p) => p.dir === 'input')
      .flatMap((p) => p.bits.map((b, i) => ({ label: p.name + '[' + i + ']', out: b, ins: [] }))),
    sim.regs.map((c) => ({
      label: c.type,
      out: c.pins.Q,
      ins: Object.values(c.pins).filter((v) => v !== c.pins.Q),
    })),
    ...groups.map((g) =>
      g.map((c) => ({
        label: c.type,
        out: c.pins.Y,
        ins: Object.entries(c.pins)
          .filter(([p]) => p !== 'Y')
          .map(([, v]) => v),
      })),
    ),
    net.ports
      .filter((p) => p.dir === 'output')
      .flatMap((p) => p.bits.map((b, i) => ({ label: p.name + '[' + i + ']', ins: [b] }))),
  ].filter((x) => x.length);
  const height = 44 * Math.max(...layers.map((x) => x.length)) + 20,
    width = 140 * layers.length;
  drawing.setAttribute('width', width);
  drawing.setAttribute('height', height);
  drawing.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  layers.forEach((layer, i) =>
    layer.forEach((g, j) => {
      g.x = i * 140 + 8;
      g.y = 18 + j * 44;
      if (g.out !== undefined) positions.set(g.out, g);
    }),
  );
  for (const layer of layers)
    for (const g of layer)
      for (const k of g.ins) {
        const src = positions.get(k);
        if (src)
          drawing.append(
            svg('path', {
              d:
                'M' +
                (src.x + 84) +
                ' ' +
                src.y +
                ' C' +
                (src.x + 118) +
                ' ' +
                src.y +
                ' ' +
                (g.x - 30) +
                ' ' +
                g.y +
                ' ' +
                g.x +
                ' ' +
                g.y,
              class: state.get(k) ? 'wire hot' : 'wire',
            }),
          );
      }
  for (const layer of layers)
    for (const g of layer) {
      const k = g.out ?? g.ins[0],
        selectable = typeof k === 'number',
        id = String(gateIndex++);
      const group = svg(
        'g',
        selectable
          ? {
              role: 'button',
              tabindex: 0,
              'data-gate': id,
              'aria-pressed': String(pin === k),
              'aria-label': g.label + ' net ' + k,
            }
          : {},
      );
      if (selectable) {
        group.onclick = () => chooseNet(k);
        group.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            chooseNet(k);
          }
        };
      }
      group.append(
        svg('rect', {
          x: g.x,
          y: g.y - 12,
          width: 84,
          height: 25,
          rx: 4,
          class: state.get(k) ? 'gate lit' : 'gate',
        }),
        svg('text', { x: g.x + 5, y: g.y + 5 }, g.label),
      );
      drawing.append(group);
    }
  const box = $('diagram'),
    sx = box.scrollLeft,
    sy = box.scrollTop;
  box.replaceChildren(drawing);
  if (focusId) box.querySelector('[data-gate="' + focusId + '"]')?.focus({ preventScroll: true });
  box.scrollLeft = sx;
  box.scrollTop = sy;
}
