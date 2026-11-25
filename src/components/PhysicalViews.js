import { byId as $ } from './dom.js';
const palette = ['', '#84ad87', '#40b879', '#ff865e', '#e9e4d1', '#38bdf8', '#f8d758', '#f472b6'];
const layers = ['', 'N-well', 'Diffusion', 'Poly', 'Contact', 'Metal 1', 'Via 1', 'Metal 2'];

/** Render the nominal timing, die layers and selected transistor view.
 * @param {()=>object} read
 * @returns {()=>void}
 */
export function bindPhysicalViews(read) {
  const visible = new Set([1, 2, 3, 4, 5, 6, 7]);
  const controls = $('layers');
  layers.forEach((label, i) => {
    if (!i) return;
    const l = document.createElement('label'),
      c = document.createElement('input');
    c.type = 'checkbox';
    c.id = 'layer-' + i;
    l.htmlFor = c.id;
    c.checked = true;
    c.onchange = () => {
      c.checked ? visible.add(i) : visible.delete(i);
      draw();
    };
    l.append(c, ' ' + label + ' ');
    controls.append(l);
  });
  function draw() {
    const { plan, net, last, pin } = read();
    if (!plan) return;
    const hz = Number($('frequency').value),
      slack = 1e6 / hz - plan.delay;
    $('timing').textContent =
      plan.cells +
      ' cells · ' +
      plan.area.toFixed(1) +
      ' µm² footprint · nominal path ' +
      plan.delay +
      ' ps · Fmax ' +
      (plan.delay ? (1e6 / plan.delay).toFixed(0) : '∞') +
      ' MHz · target ' +
      hz +
      ' MHz · ' +
      (slack < 0 ? 'setup budget exceeded' : 'positive setup margin') +
      ' (' +
      slack.toFixed(0) +
      ' ps).';
    const mode = $('view').value;
    $('diagram').hidden = mode !== 'gate';
    $('die').hidden = mode !== 'die';
    $('layers').hidden = mode !== 'die';
    $('xray').hidden = mode !== 'xray';
    if (mode === 'die') {
      const canvas = $('die'),
        ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(
        canvas.width / (plan.width * 1000),
        canvas.height / (plan.height * 1000),
      );
      const path = new Set(plan.path);
      const late = new Set(plan.captures.filter((c) => c.delay > 1e6 / hz).map((c) => c.net));
      for (const s of plan.shapes)
        if (visible.has(s.layer)) {
          ctx.globalAlpha = s.wire === undefined || last.get(s.wire) ? 1 : 0.5;
          ctx.fillStyle = late.has(s.wire)
            ? '#ff4949'
            : s.wire !== undefined && path.has(s.wire)
              ? '#ffba62'
              : palette[s.layer];
          ctx.fillRect(
            s.x * scale,
            s.y * scale,
            Math.max(1, s.w * scale),
            Math.max(1, s.h * scale),
          );
        }
      ctx.globalAlpha = 1;
    }
    if (mode === 'xray') {
      const c = net.cells.find((c) => c.pins.Y === pin),
        text = $('xray');
      if (!c || !['NOT', 'AND', 'OR', 'NAND', 'NOR'].includes(c.type)) {
        text.textContent = 'Select an AND, OR, NAND, NOR or NOT cell using the Net selector.';
        return;
      }
      const and = ['AND', 'NAND'].includes(c.type),
        buffer = ['AND', 'OR'].includes(c.type);
      const inputs = Object.entries(c.pins).filter(([k]) => k !== 'Y');
      const branch = (p) =>
        inputs
          .map(([k, v]) => k + ' ' + (last.get(v) === Number(!p) ? 'ON' : 'OFF'))
          .join(inputs.length === 1 ? '' : and === p ? ' ∥ ' : ' — ');
      text.textContent =
        'VDD → PMOS ' +
        branch(true) +
        ' → internal node\nInternal node → NMOS ' +
        branch(false) +
        ' → GND' +
        (buffer
          ? '\nOutput inverter · PMOS ' +
            (last.get(c.pins.Y) ? 'ON' : 'OFF') +
            ', NMOS ' +
            (last.get(c.pins.Y) ? 'OFF' : 'ON')
          : '') +
        '\nY = ' +
        last.get(c.pins.Y);
    }
  }
  $('frequency').oninput = draw;
  $('view').onchange = draw;

  return draw;
}
