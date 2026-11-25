import { bindPhysicalViews } from '../src/components/PhysicalViews.js';
import { download } from '../src/components/HardwareExportCard.jsx';
import { gds } from './gds.mjs';
import { layout } from './physical.mjs';

const $ = (id) => document.getElementById(id);
function proof(golden, edited) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/proof-worker.mjs', { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ status: 'Proof timed out; equivalence undetermined' });
    }, 30000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(Error('Proof worker failed.'));
    };
    worker.postMessage({ golden, edited });
  });
}
/** Connect timing, physical views, peripheral output and export controls.
 * @param {Function} synthesize
 * @returns {object}
 */
export function studio(synthesize) {
  let plan,
    net,
    top,
    last,
    reference,
    samples = [],
    pin;
  const draw = bindPhysicalViews(() => ({ plan, net, last, pin }));
  $('gds').onclick = () => download(top + '.gds', gds(top, plan.shapes));
  $('ys').onclick = () =>
    download(
      'synth.ys',
      'read_verilog ' +
        top +
        '.v\nhierarchy -check -top ' +
        top +
        '\nsynth -top ' +
        top +
        '\nwrite_json ' +
        top +
        '.json\n',
    );
  $('make').onclick = () => download('Makefile', 'all: synth\nsynth:\n\tyosys -s synth.ys\n');
  $('vcd').onclick = () => {
    const lines = [
      '$timescale 1ns $end',
      '$scope module ' + top + ' $end',
      ...net.ports.map((p, i) => '$var wire ' + p.bits.length + ' p' + i + ' ' + p.name + ' $end'),
      '$upscope $end',
      '$enddefinitions $end',
    ];
    samples.forEach((v, t) => {
      lines.push('#' + t);
      net.ports.forEach((p, i) => lines.push('b' + (v[p.name] ?? 0).toString(2) + ' p' + i));
    });
    download(top + '.vcd', lines.join('\n') + '\n');
  };
  $('prove').onclick = async () => {
    const golden = reference;
    try {
      $('proof').textContent = 'Synthesizing edited RTL…';
      const edited = await synthesize({ verilog: $('source').value, module_name: $('top').value });
      if (reference !== golden) return;
      $('proof').textContent = JSON.stringify(await proof(golden, edited));
    } catch (e) {
      $('proof').textContent = e.message;
    }
  };
  let pwm = [],
    previousClk = 0,
    serial = [],
    uartText = '';
  return {
    setupFault(clock) {
      if (!$('stress').checked || !plan || !clock) return null;
      const late = plan.captures.find((c) => c.delay > 1e6 / Number($('frequency').value));
      return late ? { net: late.net, value: 1 - last.get(late.net) } : null;
    },
    golden(n) {
      reference = n;
      $('proof').textContent = '';
    },
    update(d, n, sim, state, inputs, p) {
      if (net !== n) {
        net = n;
        plan = layout(net, sim);
        samples = [];
        pwm = [];
        serial = [];
        uartText = '';
        previousClk = 0;
      }
      top = d.module_name;
      last = state;
      pin = p;
      samples.push({ ...inputs, ...state.outputs });
      if (samples.length > 256) samples.shift();
      const o = state.outputs,
        dock = $('dock');
      $('segments').hidden = !('seg' in o);
      $('pwm-meter').hidden = !('pwm' in o);
      if ('seg' in o) {
        Array.from($('segments').querySelectorAll('rect,polygon,path,line')).forEach(
          (bar, i) => (bar.style.opacity = o.seg & (1 << (6 - i)) ? '1' : '.12'),
        );
        dock.textContent =
          'Seven-segment display · ' +
          ['a', 'b', 'c', 'd', 'e', 'f', 'g'].filter((_, i) => o.seg & (1 << (6 - i))).join(' ');
      } else if ('green' in o && 'amber' in o)
        dock.textContent =
          'Intersection · ' +
          (o.green ? '🟢 Green' : o.amber ? '🟡 Amber' : '🔴 Red') +
          (o.walk ? ' · WALK' : ' · WAIT');
      else if ('pwm' in o) {
        if (inputs.clk && !previousClk) pwm.push(o.pwm);
        if (pwm.length > 64) pwm.shift();
        const duty = pwm.reduce((a, b) => a + b, 0) / (pwm.length || 1);
        $('pwm-meter').value = duty;
        dock.textContent =
          'PWM duty over ' +
          pwm.length +
          ' edges · ' +
          (100 * duty).toFixed(0) +
          '% · average at 3.3 V: ' +
          (3.3 * duty).toFixed(2) +
          ' V';
      } else if ('tx' in o) {
        if (inputs.clk && !previousClk) {
          if (serial.length || o.tx === 0) serial.push(o.tx);
          if (serial.length === 10) {
            if (serial[9])
              uartText += String.fromCharCode(
                serial.slice(1, 9).reduce((a, b, i) => a + (b << i), 0),
              );
            serial = [];
          }
        }
        dock.textContent = 'UART 8N1 · one rising clock per bit · ' + uartText.slice(-120);
      } else dock.textContent = '';
      previousClk = inputs.clk || 0;
      draw();
    },
  };
}
