import { catalog } from '../web/catalog.mjs';
import { MAX_BODY, MAX_PROMPT } from '../shared/validators.js';
import { generateRTL } from './rtl.mjs';
import { interpret } from './interpreter.mjs';

const modes = new Set(['auto', 'sequence', 'universal_rtl', 'logic']);
const descriptions = new Map([
  ['8-bit alu with add, sub, and, or, xor and zero flag', 'alu'],
  ['traffic light controller fsm with pedestrian button', 'traffic'],
  ['7-segment bcd decoder', 'decoder'],
  ['4-bit synchronous up/down counter with reset', 'counter'],
  ['pwm generator', 'pwm'],
  ...Object.entries(catalog).map(([key, design]) => [design.title.toLowerCase(), key]),
]);
const hardwareWords = /\b(\d+[- ]bit|alu|pwm|counter|flip.flop|decoder|fsm)\b/i;

function deterministic(prompt, mode) {
  const canonical = prompt
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\d+)\s*[- ]?\s*bits?\b/g, '$1-bit')
    .replace(/[.!]$/, '')
    .replace(/^(build|make|design|create) (an? )?/, '');
  const example = descriptions.get(canonical);
  if (example && (mode === 'auto' || mode === 'universal_rtl')) return catalog[example];
  if (hardwareWords.test(prompt)) return null;
  try {
    const design = interpret(prompt);
    return mode === 'auto' || mode === design.kind ? design : null;
  } catch {
    return null;
  }
}

/** Compile or repair a prompt and preserve the requested lab's schema.
 * @param {string} path
 * @param {object} body
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function compilePrompt(path, body, env) {
  const prompt = body.prompt ?? body.statement,
    mode = body.preferred_mode ?? 'auto';
  if (!modes.has(mode)) throw Error('Unknown lab.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT)
    throw Error('Use a description of 1–1,000 characters.');
  if (body.image !== undefined) {
    if (
      path !== '/api/interpret' ||
      typeof body.image !== 'string' ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)
    )
      throw Error('Invalid JPEG.');
    if (!env.GEMINI_API_KEY) throw Error('Sketch interpretation requires a Gemini key.');
    return generateRTL(env, prompt, undefined, mode, body.image);
  }
  if (path === '/api/repair') {
    if (
      typeof body.verilog !== 'string' ||
      body.verilog.length > MAX_BODY ||
      typeof body.yosys_error !== 'string' ||
      body.yosys_error.length > 2400
    )
      throw Error('Invalid repair request.');
    return generateRTL(env, prompt, { verilog: body.verilog, error: body.yosys_error });
  }
  const design =
    body.force_ai === true || path === '/api/ai-compile' ? null : deterministic(prompt, mode);
  return design ?? generateRTL(env, prompt, undefined, mode);
}
