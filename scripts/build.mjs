import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { readAssets } from './assets.mjs';

const assets = await readAssets();
await mkdir('dist/server', { recursive: true });
await build({
  stdin: {
    contents:
      "import {handle} from './worker/server.mjs';\nconst assets=" +
      JSON.stringify(assets) +
      ';\nexport default {fetch(request,env){return handle(request,env,assets);}};',
    resolveDir: resolve('.'),
    sourcefile: 'entry.mjs',
  },
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'silent',
});
try {
  await mkdir('dist/.openai', { recursive: true });
  await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
