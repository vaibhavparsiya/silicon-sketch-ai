import { identifier, safeJson } from '../shared/validators.js';
import { requestDesign } from './provider.mjs';
import { snapshot } from './interpreter.mjs';
import { checkNet, simulator } from '../web/net.mjs';
/** Validate an RTL snapshot and copy only supported public fields.
 * @param {object} d
 * @returns {object}
 */
export function rtlDesign(d) {
  const string = (x, n) => typeof x === 'string' && x.length > 0 && x.length <= n;
  if (
    !identifier(d?.module_name) ||
    !string(d.verilog, 32768) ||
    !string(d.title, 160) ||
    !string(d.summary, 700) ||
    !string(d.testbench, 32768)
  )
    throw Error('Incomplete or oversized RTL design.');
  const v = {
    kind: 'universal_rtl',
    engine: 'universal_rtl',
    module_name: d.module_name,
    title: d.title,
    summary: d.summary,
    verilog: d.verilog,
    testbench: d.testbench,
    sample_vectors: [],
  };
  if (d.ports !== undefined) {
    if (
      !Array.isArray(d.ports) ||
      d.ports.length > 64 ||
      !d.ports.every(
        (p) =>
          p &&
          identifier(p.name) &&
          ['input', 'output'].includes(p.dir) &&
          Number.isInteger(p.width) &&
          p.width > 0 &&
          p.width <= 32,
      ) ||
      new Set(d.ports.map((p) => p.name)).size !== d.ports.length
    )
      throw Error('Invalid port or bus width.');
    v.ports = d.ports.map((p) => ({
      name: p.name,
      dir: p.dir,
      width: p.width,
      description: String(p.description || p.name).slice(0, 120),
    }));
  }
  if (
    ['none', 'seven_segment', 'pwm_motor', 'traffic_light', 'uart_terminal'].includes(
      d.peripheral_hint,
    )
  )
    v.peripheral_hint = d.peripheral_hint;
  if (typeof d.is_sequential === 'boolean') v.is_sequential = d.is_sequential;
  if (d.netlist_json) {
    v.netlist_json = checkNet(d.netlist_json);
    simulator(v.netlist_json);
  }
  if (typeof d.cocotb_test === 'string' && d.cocotb_test.length <= 32768)
    v.cocotb_test = d.cocotb_test;
  if (d.sample_vectors !== undefined) {
    if (!Array.isArray(d.sample_vectors) || d.sample_vectors.length > 32)
      throw Error('Invalid vectors.');
    for (const s of d.sample_vectors) {
      for (const map of [s?.inputs, s?.expected])
        if (
          !map ||
          Array.isArray(map) ||
          typeof map !== 'object' ||
          Object.entries(map).some(
            ([k, v]) => !identifier(k) || !Number.isSafeInteger(v) || v < 0 || v > 4294967295,
          )
        )
          throw Error('Invalid test vector.');
      v.sample_vectors.push({
        label: String(s.label || 'Vector').slice(0, 80),
        inputs: s.inputs,
        expected: s.expected,
      });
    }
  }
  if (d.inputs) {
    if (
      typeof d.inputs !== 'object' ||
      Array.isArray(d.inputs) ||
      Object.keys(d.inputs).some((k) => !identifier(k)) ||
      Object.values(d.inputs).some((x) => !Number.isInteger(x) || x < 0 || x > 4294967295)
    )
      throw Error('Invalid probes.');
    v.inputs = d.inputs;
  }
  return v;
}
const aiInstructions = [
  'Translate digital circuit specifications into JSON. If ambiguous return {"question":"clarification"}.',
  'For up to three Boolean inputs and one output return kind:"logic", labels (three strings), truth_table (eight numbers, row order 000..111).',
  'For sequence detection return kind:"sequence", pattern (1-8 bits), overlap (boolean), stream (up to 96 bits).',
  'Otherwise return kind:"universal_rtl", title, summary, module_name, Verilog-2001 source in verilog, self-checking Verilog testbench, cocotb_test, ports (name,dir,width,description), is_sequential, peripheral_hint (none,seven_segment,pwm_motor,traffic_light,uart_terminal), sample_vectors (label, inputs and expected named integer maps).',
  'Use synthesizable RTL, 1-32 bits per port, up to 250 gates. For repair always return the complete corrected RTL design. Never include a netlist. Preserve the user specification.',
].join(' ');
function parseDesign(content) {
  if (typeof content !== 'string') throw Error('Expected a JSON object.');
  const trimmed = content.trim(),
    fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const d = safeJson(fence ? fence[1] : trimmed);
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw Error('Expected a design object.');
  if (d.question)
    throw Object.assign(Error(String(d.question).slice(0, 400)), { clarification: true });
  if (d.kind === 'logic') {
    const t = d.truth_table;
    if (!Array.isArray(t) || t.length !== 8 || t.some((v) => v !== 0 && v !== 1))
      throw Error('Invalid truth table.');
    return snapshot({
      kind: 'logic',
      mask: t.reduce((m, v, i) => m | (v << i), 0),
      vector: 0,
      labels: d.labels,
    });
  }
  if (d.kind === 'sequence') return snapshot({ ...d, index: (d.stream?.length ?? 0) - 1 });
  const verilog = String(d.verilog ?? '').replace(/^\s*```(?:verilog)?\s*|\s*```\s*$/gi, '');
  if (/(?:^|[;\s])#\s*\d|\$(?:display|finish|stop|dumpvars)\b/.test(verilog))
    throw Error('Non-synthesizable statements in design.');
  return rtlDesign({ ...d, verilog, netlist_json: undefined });
}
/** Interpret a free-form circuit request and validate the result.
 * @param {object} env
 * @param {string} prompt
 * @param {object} [repair]
 * @param {string} [mode]
 * @param {string} [image]
 * @returns {Promise<object>}
 */
export async function generateRTL(env, prompt, repair, mode = 'auto', image) {
  if (!env.GEMINI_API_KEY && !env.GROQ_API_KEY)
    throw Object.assign(Error('AI provider key not configured'), { status: 503, fallback: true });
  const requestedKind = repair ? 'universal_rtl' : mode;
  const instructions =
    aiInstructions +
    (requestedKind === 'auto'
      ? ''
      : ' The active lab requires kind "' +
        requestedKind +
        '". Return its schema or ask a clarification question.');
  let feedback = repair;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { model, content } = await requestDesign(
      env,
      instructions,
      JSON.stringify({ prompt, repair: feedback }),
      image,
      attempt > 0,
    );
    try {
      const design = parseDesign(content);
      if (requestedKind !== 'auto' && design.kind !== requestedKind)
        throw Error('Return the ' + requestedKind + ' lab schema.');
      return { ...design, compiler_source: model + (feedback ? '-repaired' : '') };
    } catch (e) {
      if (e.clarification) throw e;
      if (attempt || repair)
        throw Object.assign(
          Error(
            'The AI response did not contain a valid circuit. Try describing the ports and behavior.',
          ),
          { status: 502 },
        );
      feedback = { candidate: String(content).slice(0, 32768), error: e.message };
    }
  }
}
