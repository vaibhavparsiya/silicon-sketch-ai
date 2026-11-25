import { existsSync } from 'node:fs';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { secured } from '../worker/http.mjs';

for (const path of ['.env', '.dev.vars']) if (existsSync(path)) process.loadEnvFile(path);
const { values } = parseArgs({
  options: { port: { type: 'string' }, host: { type: 'string' }, strictPort: { type: 'boolean' } },
});
const { default: worker } = await import('../dist/server/index.js');
const bucket = {
  async get(key) {
    try {
      const data = await readFile('.local/' + key + '.json', 'utf8');
      return { json: () => JSON.parse(data) };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },
  async put(key, data, options) {
    const path = '.local/' + key + '.json';
    await mkdir(dirname(path), { recursive: true });
    const staged = path + '.' + crypto.randomUUID() + '.tmp';
    try {
      await writeFile(staged, data, { flag: 'wx' });
      if (options?.onlyIf) await link(staged, path);
      else await rename(staged, path);
      return {};
    } catch (err) {
      if (err.code === 'EEXIST') return null;
      throw err;
    } finally {
      await rm(staged, { force: true });
    }
  },
};
createServer(async (req, res) => {
  let response;
  try {
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const base = process.env.PUBLIC_ORIGIN || protocol + '://' + req.headers.host;
    const headers = new Headers(Object.entries(req.headers).filter(([, v]) => v !== undefined));
    // Only the accepted socket peer is authoritative on Node. Cloudflare supplies this at its edge.
    headers.set('cf-connecting-ip', req.socket.remoteAddress || 'local');
    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req;
      init.duplex = 'half';
    }
    response = await worker.fetch(new Request(new URL(req.url, base), init), {
      BUCKET: bucket,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
    });
  } catch {
    response = secured(new Response('Invalid request', { status: 400 }));
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(
  Number(values.port || process.env.PORT || 8000),
  values.host || process.env.HOST || '0.0.0.0',
  function () {
    console.log('Silicon Sketch listening on port ' + this.address().port);
  },
);
