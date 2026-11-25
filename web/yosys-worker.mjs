import { compilerSource } from './compilerArchive.mjs';
import { synth } from './synth.mjs';
// npm tarballs carry the runtime and WASM as one pinned, compressed download.
// Validate the published digest before loading the isolated module.
const url = 'https://registry.npmjs.org/@yowasp/yosys/-/yosys-0.71.188-dev.1267.tgz';
const integrity =
  'd9DlNdxAo2MKLM+XyzduDsgW99l25t07igbZ8lqPBT7ZfGJR4OJiAn55z8TItqwGpngA5tCYmBSSJd0MpvYvMQ==';
async function loadCompiler() {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw Error('Compiler download returned ' + response.status);
  const archive = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-512', archive));
  if (btoa(String.fromCharCode(...digest)) !== integrity)
    throw Error('Compiler download integrity check failed.');
  const tar = new Uint8Array(
    await new Response(
      new Blob([archive]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer(),
  );
  const bundle = compilerSource(tar);
  return import(URL.createObjectURL(new Blob([bundle], { type: 'application/javascript' })));
}
self.onmessage = async ({ data }) => {
  try {
    const { runYosys } = await loadCompiler();
    self.postMessage({ net: await synth(runYosys, data.verilog, data.module_name) });
  } catch (e) {
    self.postMessage({ error: String(e.message || e) });
  }
};
