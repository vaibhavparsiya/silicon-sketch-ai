import { bindLogicProof } from './LogicProof.js';
import { schematic } from './SchematicSvg.jsx';
import { truthTable } from './TruthTableCard.jsx';
import { analyzer } from './WaveformStrip.jsx';
import { showFault } from './FaultInjectorCard.jsx';
import { download } from './HardwareExportCard.jsx';
import { button, byId as $ } from './dom.js';
import { hardware, bench } from '../../shared/verilogGenerator.js';
import { sketch } from '../../web/sketch.mjs';
import { api, shareTools } from '../../web/service.mjs';
import {
  oppositeVector,
  signals,
  presets,
  bit,
  covers,
  compile,
  synthesize,
  literals,
  expression,
} from '../../shared/booleanEngine.js';

/** Attach the Logic Lab controls to the active document.
 * @returns {void}
 */
export function mountLogicLab() {
  let mask = compile(presets[0].rule),
    terms = synthesize(mask),
    vector = 3;
  function probe(n, focus) {
    vector = n;
    render();
    if (focus) $(focus).focus();
  }
  function render() {
    if (faultActive) showFault(mask, probe);
    const out = (mask >> vector) & 1;
    const active = terms.filter((t) => covers(t, vector)).map((t) => literals(t).join(' AND '));
    const reason =
      mask === 255 || mask === 0
        ? 'Every truth-table row has the same value.'
        : out
          ? 'These terms are true: ' + active.join(', ') + '.'
          : 'Every term in the expression is false.';
    $('logic-reason').textContent =
      signals.map((name, i) => name + '=' + bit(vector, i)).join(', ') +
      ' gives Y=' +
      out +
      '. ' +
      reason;
    const other = oppositeVector(mask, vector),
      opposite = $('opposite');
    opposite.hidden = other === null;
    if (other !== null) {
      const names = signals.filter((_, i) => bit(vector, i) !== bit(other, i));
      opposite.textContent = 'Flip ' + names.join(' and ') + ' to see Y=' + Number(!out);
      opposite.onclick = () => probe(other, 'opposite');
    }
    $('hex').textContent = '0x' + mask.toString(16).padStart(2, '0').toUpperCase();
    $('state').textContent = 'Y  ' + (out ? 'HIGH · 1' : 'LOW · 0');
    $('state').className = out ? 'high' : '';
    $('equation').textContent = 'Y = ' + expression(terms);
    $('code').textContent = hardware(mask, terms);
    $('switches').replaceChildren(
      ...signals.map((s, i) => {
        const v = bit(vector, i),
          b = button(s + '  ' + v, () => probe(vector ^ (1 << (2 - i)), 'sw' + i));
        b.id = 'sw' + i;
        b.setAttribute('aria-label', s + ' ' + v + ', toggle input ' + s);
        b.setAttribute('aria-pressed', String(Boolean(v)));
        return b;
      }),
    );
    truthTable($('table'), mask, vector, (i) => {
      revision++;
      mask ^= 1 << i;
      terms = synthesize(mask);
      $('rule').value = '';
      $('rule').placeholder = 'Table edited — enter a new rule to compile';
      $('msg').textContent = 'Truth table updated. Schematic and RTL regenerated.';
      probe(i, 'cell' + i);
    });
    schematic($('canvas'), mask, terms, vector);
    analyzer($('wave'), mask, vector, probe);
  }
  let revision = 0,
    labels = ['A', 'B', 'C'];
  function apply(rule) {
    revision++;
    labels = ['A', 'B', 'C'];
    $('mapping').textContent = '';
    try {
      const next = compile(rule);
      mask = next;
      terms = synthesize(mask);
      render();
      $('msg').textContent = 'Compiled · all 8 combinations mapped.';
    } catch (e) {
      $('msg').textContent = e.message + ' The schematic shows the last compiled design.';
    }
  }
  for (const p of presets)
    $('presets').append(
      button(p.name, () => {
        $('rule').value = p.rule;
        apply(p.rule);
      }),
    );
  function restore(design) {
    if (design.kind === 'universal_rtl') {
      sessionStorage.setItem('rtl-prompt', $('rule').value);
      sessionStorage.setItem('rtl-draft', JSON.stringify(design));
      location.assign('/rtl');
      return;
    }
    if (design.kind === 'sequence') {
      sessionStorage.setItem('silicon-draft', JSON.stringify(design));
      location.assign('/sequence');
      return;
    }
    mask = design.mask;
    vector = design.vector;
    labels = design.labels;
    terms = synthesize(mask);
    render();
    $('mapping').textContent = labels.map((label, i) => signals[i] + ' = ' + label).join('  ·  ');
    $('msg').textContent = 'Compiled · review the input mapping and truth table.';
  }
  async function describe(force_ai = false) {
    const n = ++revision,
      statement = $('rule').value.trim();
    $('msg').textContent = 'Compiling…';
    try {
      const image = await sketch($('photo').files[0]);
      const design = await api('/api/interpret', {
        prompt: statement || 'Interpret this circuit image',
        image,
        force_ai,
        preferred_mode: 'auto',
      });
      if (n === revision) restore(design);
    } catch (err) {
      if (n === revision)
        $('msg').textContent = err.fallback
          ? 'AI generation needs a provider key. Use Compile for built-in designs such as an 8-bit ALU.'
          : err.message + ' The previous circuit is still displayed.';
    }
  }
  $('photo').onchange = () => {
    revision++;
    $('rule').required = !$('photo').files.length;
    if ($('photo').files.length) $('rule').value = '';
  };
  $('ai').onclick = () => describe(true);
  $('editor').onsubmit = (e) => {
    e.preventDefault();
    describe(false);
  };

  shareTools(
    () => ({ kind: 'logic', mask, vector, labels }),
    (d) => {
      restore(d);
      if (d.kind === 'logic') $('rule').value = d.formula.replaceAll('~', 'not ');
    },
  );
  $('rule').oninput = () => {
    revision++;
    $('msg').textContent = 'Draft rule · compile to update the circuit.';
  };
  $('step').onclick = () => probe((vector + 1) % 8);
  $('rtl').onclick = () => download('silicon_sketch.v', hardware(mask, terms));
  $('tb').onclick = () => download('tb.sv', bench(mask));
  let faultActive = false;
  $('inject').onclick = () => {
    faultActive = true;
    showFault(mask, probe);
  };
  for (const id of ['pin', 'stuck'])
    $(id).onchange = () => {
      if (faultActive) showFault(mask, probe);
    };
  render();

  bindLogicProof(() => mask);
  $('editor').ondragover = (e) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  };
  $('editor').ondrop = (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    $('photo').files = e.dataTransfer.files;
    $('photo').onchange();
  };
}
