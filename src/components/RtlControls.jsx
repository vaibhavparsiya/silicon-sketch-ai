import { byId as $, node as el, button } from './dom.js';
/** Build input bus probes, stepping controls and sample-vector checks.
 * @param {object} d
 * @param {object} net
 * @param {object} inputs
 * @param {{update:Function,clock:Function,start:Function,stop:Function}} actions
 * @returns {void}
 */
export function mountControls(d, net, inputs, { update, clock, start, stop }) {
  const option = (value, label) => new Option(label, value);
  $('inputs').replaceChildren();
  $('clock').replaceChildren();
  $('wire').replaceChildren();
  $('vectors').replaceChildren();
  for (const p of net.ports.filter((p) => p.dir === 'input')) {
    const label = el('label', p.name + ' [' + p.bits.length + ' bit] '),
      c = el('input', '');
    c.id = 'port-' + p.name;
    label.htmlFor = c.id;
    c.size = 6;

    c.onchange = () => {
      const v = Number(c.value);
      if (!c.value.trim() || !Number.isInteger(v) || v < 0 || v >= 2 ** p.bits.length) {
        $('status').textContent = 'Enter a decimal or 0x value within the bus width.';
      } else inputs[p.name] = v;
      update();
    };
    label.append(c);
    const group = el('div', '');
    group.append(label);
    for (let i = p.bits.length - 1; i >= 0; i--) {
      const toggle = button('b' + i, () => {
        inputs[p.name] = ((inputs[p.name] ?? 0) ^ (1 << i)) >>> 0;
        update();
      });
      toggle.dataset.port = p.name;
      toggle.dataset.bit = i;
      toggle.setAttribute('aria-label', 'b' + i + ', toggle ' + p.name + ' bit ' + i);
      group.append(toggle);
    }
    $('inputs').append(group);
    p.bits.forEach((k, i) => $('wire').add(option(k, p.name + '[' + i + ']')));
  }
  for (const c of net.cells) {
    const k = c.pins.Q ?? c.pins.Y;
    $('wire').add(option(k, c.type + ' · net ' + k));
  }
  if (net.ports.some((p) => p.name === 'clk' && p.dir === 'input')) {
    $('clock').append(
      button('Step clock', clock),
      button('1 Hz', () => {
        stop();
        start(1000);
      }),
      button('4 Hz', () => {
        stop();
        start(250);
      }),
      button('Pause', stop),
    );
    if (net.ports.some((p) => p.name === 'rst'))
      $('clock').append(
        button('Pulse reset', () => {
          inputs.rst = 1;
          clock();
          inputs.rst = 0;
          update();
        }),
      );
  }
  for (const v of d.sample_vectors || [])
    $('vectors').append(
      button(v.label, () => {
        Object.assign(inputs, v.inputs);
        const out = update();
        const checks = Object.entries(v.expected);
        $('vector-report').textContent =
          v.label +
          ' · ' +
          (checks.length
            ? checks
                .map(
                  ([k, x]) =>
                    k +
                    ': expected ' +
                    x +
                    ', observed ' +
                    (out[k] ?? 'missing') +
                    ' (' +
                    (x === out[k] ? 'pass' : 'fail') +
                    ')',
                )
                .join(' · ')
            : 'No expected outputs supplied.');
      }),
    );
}
