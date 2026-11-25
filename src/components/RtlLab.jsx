import { explainNet } from './NetInspector.js';
import { byId as $ } from './dom.js';
import { mountControls } from './RtlControls.jsx';
import { runWorker, compileDraft } from './RtlCompiler.js';
import { bindHunts } from './FaultHunt.jsx';
import { graph } from './RtlSchematic.jsx';
import { faultVectors } from '../../shared/faultSimulation.js';
import { download } from './HardwareExportCard.jsx';
import { studio } from '../../web/studio.mjs';
import { catalog } from '../../web/catalog.mjs';
import { simulator } from '../../web/net.mjs';
import { shareTools, labPrompt } from '../../web/service.mjs';

/** Attach the Rtl Lab controls to the active document.
 * @returns {void}
 */
export function mountRtlLab() {
  const option = (value, label) => new Option(label, value);
  let design,
    net,
    sim,
    inputs = {},
    pin = null,
    history = [],
    revision = 0,
    auto = null;
  const physical = studio(runWorker);
  function fault() {
    return $('force').value === ''
      ? null
      : { net: Number($('wire').value), value: Number($('force').value) };
  }
  function update(stress = null) {
    $('vector-report').textContent = '';
    const state = sim.evaluate(inputs, fault() ?? (stress?.net !== undefined ? stress : null));
    $('outputs').textContent = Object.entries(state.outputs)
      .map(([k, v]) => k + ' = ' + v + '  (0x' + v.toString(16).toUpperCase() + ')')
      .join('    ');
    for (const p of net.ports.filter((p) => p.dir === 'input')) {
      const control = document.getElementById('port-' + p.name);
      if (control) control.value = inputs[p.name] ?? 0;
    }
    for (const toggle of $('inputs').querySelectorAll('button[data-bit]'))
      toggle.setAttribute(
        'aria-pressed',
        String(Boolean(((inputs[toggle.dataset.port] ?? 0) >>> Number(toggle.dataset.bit)) & 1)),
      );
    if (pin !== null) {
      history.push(state.get(pin));
      history = history.slice(-32);
      $('trace').textContent =
        'Net ' +
        pin +
        ' · last ' +
        history.length +
        ' samples  ' +
        history.map((x) => (x ? '▔' : '▁')).join('');
    }
    explainNet(net, pin, state, fault());
    physical.update(design, net, sim, state, inputs, pin);
    graph(net, sim, state, pin, (k) => {
      $('wire').value = k;
      pin = k;
      history = [];
      update();
    });
    return state.outputs;
  }
  function clock() {
    inputs.clk = 0;
    update();
    inputs.clk = 1;
    update(physical.setupFault(true));
    inputs.clk = 0;
    update();
  }
  function stop() {
    clearInterval(auto);
    auto = null;
  }
  function install(d, edited = false) {
    const { universal_rtl: details, ...snapshot } = d;
    if (details && !snapshot.netlist_json) snapshot.netlist_json = details.netlist;
    if (!edited) physical.golden(snapshot.netlist_json);
    stop();
    design = snapshot;
    net = snapshot.netlist_json;
    sim = simulator(net);
    inputs = { ...d.inputs };
    history = [];
    pin = null;
    $('source').value = d.verilog;
    $('top').value = d.module_name;
    $('summary').textContent = d.summary;
    $('trace').textContent = '';
    $('diff').textContent = '';
    $('force').value = '';
    mountControls(d, net, inputs, {
      update,
      clock,
      stop,
      start: (ms) => {
        auto = setInterval(clock, ms);
      },
    });
    $('metrics').textContent = net.cells.length + ' cells · ' + sim.groups.length + ' logic levels';
    $('status').textContent = 'Synthesized netlist ready.';
    $('tb').disabled = !d.testbench || d.testbench.startsWith('// No');
    $('cocotb').hidden = !d.cocotb_test;
    update();
  }
  $('wire').onchange = () => {
    pin = Number($('wire').value);
    history = [];
    update();
  };
  $('force').onchange = update;
  $('search').onclick = () => {
    const f = fault();
    if (!f) {
      $('diff').textContent = 'Select a stuck-at value first.';
      return;
    }
    const prefix = [];
    for (const row of faultVectors(design, f)) {
      prefix.push(row.inputs);
      if (row.failed) {
        $('diff').textContent =
          (sim.regs.length
            ? 'Input sequence ' + JSON.stringify(prefix)
            : 'Inputs ' + JSON.stringify(row.inputs)) +
          ' → healthy ' +
          JSON.stringify(row.expected) +
          ' / faulty ' +
          JSON.stringify(row.observed);
        return;
      }
    }
    $('diff').textContent = 'No difference observed in ' + prefix.length + ' tested vectors.';
  };
  function compile(d, prompt = '') {
    const ticket = ++revision;
    stop();
    return compileDraft(d, prompt, install, () => ticket === revision);
  }
  $('build').onclick = () => {
    const top = $('top').value.trim(),
      src = $('source').value;
    compile({
      kind: 'universal_rtl',
      module_name: top,
      title: top,
      summary: 'User-supplied RTL · simulation initializes registers to zero.',
      verilog: src,
      testbench: '// No testbench supplied.',
      sample_vectors: [],
    });
  };
  for (const [id, d] of Object.entries(catalog)) $('examples').add(option(id, d.title));
  $('examples').onchange = () => {
    revision++;
    install(catalog[$('examples').value]);
  };
  $('download').onclick = () => download($('top').value + '.v', $('source').value);
  $('tb').onclick = () => download(design.module_name + '_tb.v', design.testbench);
  $('cocotb').onclick = () => download('test_' + design.module_name + '.py', design.cocotb_test);
  function load(d, prompt = '') {
    if (d.kind !== 'universal_rtl') throw Error('Wrong lab for this snapshot.');
    if (d.netlist_json) {
      revision++;
      install(d);
    } else {
      $('source').value = d.verilog;
      $('top').value = d.module_name;
      compile(d, prompt);
    }
  }
  install(catalog.adder);
  const draft = sessionStorage.getItem('rtl-draft');
  if (draft) {
    sessionStorage.removeItem('rtl-draft');
    load(JSON.parse(draft), sessionStorage.getItem('rtl-prompt') || '');
  }
  shareTools(() => ({ ...design, inputs }), load);
  labPrompt('universal_rtl', load);

  bindHunts(
    () => design,
    fault,
    load,
    () =>
      Object.fromEntries(
        net.ports.filter((p) => p.dir === 'input').map((p) => [p.name, inputs[p.name] ?? 0]),
      ),
  );
}
