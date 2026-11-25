import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { handle } from './worker/server.mjs';
import { readAssets } from './scripts/assets.mjs';
import { createLimiter } from './worker/rate-limit.mjs';
import { designId, identifier, MAX_BODY } from './shared/validators.js';
import { catalog } from './web/catalog.mjs';

const origin = 'https://lab.test';
const assets = await readAssets();
const headers = { origin, 'content-type': 'application/json' };
const post = (path, body, env = {}, other = {}, peer) =>
  handle(
    new Request(origin + '/api/' + path, {
      method: 'POST',
      headers: { ...headers, ...other },
      body,
    }),
    env,
    assets,
    peer,
  );
const get = (path, env = {}, method = 'GET') =>
  handle(new Request(origin + path, { method }), env, assets);
const prompt = JSON.stringify({ prompt: 'A and B' });

test('security headers protect real pages, JS, HEAD, successful and unsuccessful API responses', async () => {
  for (const [path, status] of [
    ['/', 200],
    ['/rtl', 200],
    ['/app.mjs', 200],
    ['/unknown', 404],
    ['/api/bad', 404],
    ['/api/validate', 405],
  ]) {
    const response = await get(path);
    assert.equal(response.status, status, path);
    for (const [name, value] of Object.entries({
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    }))
      assert.equal(response.headers.get(name), value);
    const policy = response.headers.get('content-security-policy');
    assert.match(policy, /script-src 'self';/);
    assert.match(policy, /connect-src 'self';/);
    assert.match(policy, /frame-ancestors 'none'/);
  }
  const head = await get('/rtl', {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await get('/', {}, 'PUT')).status, 405);
  const wasm = await get('/yosys-worker.mjs');
  assert.match(wasm.headers.get('content-security-policy'), /https:\/\/registry\.npmjs\.org/);
  const compiled = await post('interpret', prompt);
  assert.equal(compiled.status, 200);
  assert.equal(compiled.headers.get('x-frame-options'), 'DENY');
});
test('all writes enforce advertised and streamed sizes, encoding, JSON structure and origin', async () => {
  for (const path of ['interpret', 'repair', 'designs', 'validate', 'fault-analyze', 'hunts']) {
    assert.equal(
      (await post(path, '[', {}, { 'content-length': String(MAX_BODY + 1) })).status,
      413,
      path,
    );
    assert.equal((await post(path, 'x'.repeat(MAX_BODY + 1))).status, 413, path);
  }
  for (const [body, extra, status] of [
    ['{}', { 'content-encoding': 'deflate' }, 415],
    ['{}', { 'content-type': 'text/plain' }, 415],
    ['{}', { origin: 'https://foreign.test' }, 403],
    ['broken', {}, 400],
    ['[]', {}, 422],
    ['null', {}, 422],
    ['{}', { 'content-encoding': 'gzip' }, 400],
  ]) {
    assert.equal((await post('validate', body, {}, extra)).status, status);
  }
  for (const key of ['constructor', 'prototype', '__proto__'])
    assert.equal((await post('validate', '{"safe":[{"' + key + '":1}]}')).status, 400);
});
test('bounded compression preserves large RTL and rejects inflated inputs over budget', async () => {
  const compress = async (s) =>
    new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const design = { ...catalog.adder, verilog: ' '.repeat(31000) + catalog.adder.verilog },
    body = JSON.stringify(design);
  assert.ok(body.length > MAX_BODY);
  assert.equal(
    (await post('validate', await compress(body), {}, { 'content-encoding': 'gzip' })).status,
    200,
  );
  assert.equal(
    (await post('validate', await compress('x'.repeat(524289)), {}, { 'content-encoding': 'gzip' }))
      .status,
    413,
  );
});
test('storage validates compact IDs and preserves legacy snapshots', async () => {
  const old = 'a'.repeat(64),
    env = {
      BUCKET: { get: (key) => (key === 'designs/' + old ? { json: () => catalog.adder } : null) },
    };
  assert.equal((await get('/api/designs/' + old, env)).status, 200);
  assert.ok(designId('abcdef_01'));
  assert.ok(!designId('x'.repeat(33)));
  for (const v of ['', '123', 'bad%2Fid', '..%2Fbad', 'G'.repeat(64)])
    assert.equal((await get('/api/designs/' + v, env)).status, 404);
  assert.equal((await get('/api/designs/abcdef', env)).status, 404);
  assert.equal((await get('/api/designs/abcdef')).status, 503);
  for (const id of ['1wire', 'two words', 'constructor', 'a'.repeat(33)])
    assert.equal(identifier(id), false);
  assert.equal(identifier('_good9'), true);
});
test('local admission shares a limit across compiler aliases, repair and saves, and isolates peers', async () => {
  const peer = 'peer-rate-test';
  for (let i = 0; i < 20; i++)
    assert.equal((await post('interpret', prompt, {}, {}, peer)).status, 200);
  for (const path of ['ai-compile', 'repair', 'designs']) {
    const response = await post(path, prompt, {}, { 'x-forwarded-for': 'untrusted' }, peer);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
  }
  assert.equal((await post('interpret', prompt, {}, {}, 'other-peer')).status, 200);
  const managed = { RATE_LIMIT: { limit: async ({ key }) => ({ success: key === 'permitted' }) } };
  assert.equal((await post('interpret', prompt, managed, {}, 'managed')).status, 429);
  assert.equal((await post('interpret', prompt, managed, {}, 'permitted')).status, 200);
  let clock = 900;
  const can = createLimiter(() => clock);
  for (let i = 0; i < 20; i++) assert.ok(can('viewer'));
  assert.equal(can('viewer'), false);
  clock += 60000;
  assert.ok(can('viewer'));
});
test('provider health reports configuration without disclosing credentials', async () => {
  for (const [env, provider] of [
    [{}, null],
    [{ GROQ_API_KEY: 'private-test' }, 'groq'],
    [{ GEMINI_API_KEY: 'private-test' }, 'gemini'],
  ]) {
    const response = await get('/api/ai-health', env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { configured: !!provider, provider });
  }
});
test('all three lab documents provide a working skip link, form labels and status announcements', async () => {
  for (const [path, control] of [
    ['/', 'rule'],
    ['/sequence', 'pattern'],
    ['/rtl', 'source'],
  ]) {
    const response = await get(path);
    const dom = new JSDOM(await response.text()),
      doc = dom.window.document;
    assert.equal(doc.querySelector('a').hash, '#main-content');
    assert.equal(doc.querySelector('main').id, 'main-content');
    assert.ok(doc.getElementById(control));
    for (const field of doc.querySelectorAll('input,select,textarea'))
      assert.ok(doc.querySelector('label[for="' + field.id + '"]'), field.id);
    assert.equal(doc.getElementById('shared').getAttribute('aria-live'), 'polite');
    dom.window.close();
  }
});
