import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './worker/server.mjs';
import { catalog } from './web/catalog.mjs';
const native = (text) => Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
function post(route, body, env = {}) {
  return handle(
    new Request('https://lab.test/api/' + route, {
      method: 'POST',
      headers: { origin: 'https://lab.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    {},
  );
}
test('missing credentials and screenshot wording', async () => {
  const missing = await post('interpret', { prompt: 'new UART', force_ai: true });
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), {
    ok: false,
    error: 'AI provider key not configured',
    fallback_available: true,
  });
  const d = await (await post('interpret', { prompt: 'MAKE A 8 BIT ALU' })).json();
  assert.equal(d.module_name, 'alu');
});
test('Gemini primary, explicit repair and absent-key Groq fallback', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options]);
    return url.includes('googleapis')
      ? native(JSON.stringify(catalog.adder))
      : Response.json({ choices: [{ message: { content: JSON.stringify(catalog.adder) } }] });
  });
  for (const [route, env, model] of [
    [
      'interpret',
      { GEMINI_API_KEY: 'dummy', GROQ_API_KEY: 'alternative' },
      'gemini-3.5-flash-lite',
    ],
    ['repair', { GEMINI_API_KEY: 'dummy' }, 'gemini-3.5-flash-lite'],
    ['interpret', { GROQ_API_KEY: 'dummy' }, 'openai/gpt-oss-120b'],
  ]) {
    const r = await post(
      route,
      { force_ai: true, prompt: 'adder', verilog: 'module a;', yosys_error: 'syntax error' },
      env,
    );
    assert.equal(r.status, 200);
    const [url, options] = calls.at(-1);
    const data = JSON.parse(options.body);
    if (env.GEMINI_API_KEY) {
      assert.equal(
        url,
        'https://generativelanguage.googleapis.com/v1beta/models/' +
          model +
          ':generateContent?key=dummy',
      );
      assert.deepEqual(data.generationConfig, { responseMimeType: 'application/json' });
    } else {
      assert.equal(data.model, model);
      assert.equal(options.headers.Authorization, 'Bearer dummy');
    }
  }
});
test('invalid Gemini output is corrected using the repair model once', async (t) => {
  const models = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    models.push(url.split('/models/')[1].split(':')[0]);
    const content = models.length === 1 ? 'incomplete' : JSON.stringify(catalog.adder);
    return native(content);
  });
  const response = await post(
    'interpret',
    { prompt: 'four-port adder', force_ai: true },
    { GEMINI_API_KEY: 'dummy' },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(models, ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.equal((await response.json()).kind, 'universal_rtl');
});
test('lab prompts build the example in the selected lab and constrain AI results', async (t) => {
  const sequence = await post('interpret', {
    prompt: 'Detect 101 in 10101 with overlap',
    preferred_mode: 'sequence',
  });
  assert.equal((await sequence.json()).sequence.initial_stream, '10101');
  const rtl = await post('interpret', {
    prompt: 'Make an 8-bit ALU',
    preferred_mode: 'universal_rtl',
  });
  assert.equal((await rtl.json()).module_name, 'alu');
  const payloads = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    payloads.push(JSON.parse(options.body));
    const answer =
      payloads.length === 1
        ? catalog.alu
        : { kind: 'sequence', pattern: '110', stream: '110', overlap: false };
    return native(JSON.stringify(answer));
  });
  const generated = await post(
    'interpret',
    { prompt: 'Remember two ones then a zero', preferred_mode: 'sequence', force_ai: true },
    { GEMINI_API_KEY: 'dummy' },
  );
  assert.equal((await generated.json()).kind, 'sequence');
  assert.equal(payloads.length, 2);
  assert.match(payloads[0].systemInstruction.parts[0].text, /active lab requires kind "sequence"/);
});
for (const route of ['interpret', 'repair'])
  test(route + ' retries 503 and 429 in order', async (t) => {
    const seen = [],
      delays = [];
    t.mock.method(globalThis, 'setTimeout', (fn, ms) => {
      delays.push(ms);
      queueMicrotask(fn);
    });
    t.mock.method(globalThis, 'fetch', async (url) => {
      seen.push(url.split('/models/')[1].split(':')[0]);
      return seen.length < 3
        ? new Response(null, { status: seen.length === 1 ? 503 : 429 })
        : native(JSON.stringify(catalog.adder));
    });
    const r = await post(
      route,
      { force_ai: true, prompt: 'adder', verilog: 'module a;', yosys_error: 'syntax error' },
      { GEMINI_API_KEY: 'dummy' },
    );
    assert.equal(r.status, 200);
    assert.deepEqual(delays, [800, 1500]);
    assert.deepEqual(seen, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']);
  });

for (const endpoint of ['interpret', 'repair'])
  test(
    endpoint + ' switches to Gemma, sanitizes fenced JSON and preserves the rotator interface',
    async (t) => {
      const seen = [];
      t.mock.method(globalThis, 'setTimeout', (fn) => queueMicrotask(fn));
      const rotator = {
        kind: 'universal_rtl',
        title: 'Five-bit rotate',
        summary: 'Combinational left rotation by two.',
        module_name: 'rot5',
        verilog: 'module rot5(input [4:0] a, output [4:0] y); assign y={a[2:0],a[4:3]}; endmodule',
        testbench: 'module tb; endmodule',
        ports: [
          { name: 'a', dir: 'input', width: 5 },
          { name: 'y', dir: 'output', width: 5 },
        ],
        sample_vectors: [{ inputs: { a: 17 }, expected: { y: 6 } }],
      };
      t.mock.method(globalThis, 'fetch', async (url, req) => {
        const model = url.split('/models/')[1].split(':')[0];
        seen.push(model);
        const body = JSON.parse(req.body);
        if (!model.startsWith('gemma-')) return new Response(null, { status: 503 });
        assert.equal('systemInstruction' in body, false);
        assert.match(body.contents[0].parts[0].text, /rotat/i);
        return native('\x60\x60\x60json\n' + JSON.stringify(rotator) + '\n\x60\x60\x60');
      });
      const r = await post(
        endpoint,
        {
          prompt: 'Make a 5-bit rotator',
          force_ai: true,
          verilog: 'module rot5;',
          yosys_error: 'missing endmodule',
        },
        { GEMINI_API_KEY: 'test' },
      );
      assert.equal(r.status, 200);
      const result = await r.json();
      assert.equal(result.ports[0].width, 5);
      assert.equal(result.verilog, rotator.verilog);
      assert.equal(seen.at(-1), 'gemma-4-26b-a4b-it');
    },
  );
test('capacity exhaustion ends cleanly, while invalid credentials stop after one request', async (t) => {
  t.mock.method(globalThis, 'setTimeout', (fn) => queueMicrotask(fn));
  let status = 503,
    calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(null, { status });
  });
  const ask = () =>
    post('interpret', { prompt: 'custom design', force_ai: true }, { GEMINI_API_KEY: 'dummy' });
  assert.equal((await ask()).status, 503);
  assert.equal(calls, 5);
  calls = 0;
  status = 401;
  assert.equal((await ask()).status, 502);
  assert.equal(calls, 1);
});
