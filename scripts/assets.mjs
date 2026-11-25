import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { build } from 'esbuild';

/** Compile browser entry modules and load their static documents.
 * @returns {Promise<Record<string,string>>} Public asset names mapped to UTF-8 content.
 */
export async function readAssets() {
  const files = await readdir('web');
  const documents = files.filter((f) => /\.(?:css|html)$/.test(f));
  const modules = files.filter((f) => f.endsWith('.mjs'));
  const output = resolve('dist/client');
  const result = await build({
    entryPoints: modules.map((f) => 'web/' + f),
    bundle: true,
    splitting: true,
    format: 'esm',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    platform: 'browser',
    target: 'es2022',
    outdir: output,
    outExtension: { '.js': '.mjs' },
    chunkNames: 'chunks/[name]-[hash]',
    write: false,
    logLevel: 'silent',
  });
  const assets = Object.fromEntries(
    await Promise.all(documents.map(async (f) => [f, await readFile('web/' + f, 'utf8')])),
  );
  for (const file of result.outputFiles) assets[relative(output, file.path)] = file.text;
  const styles = await build({
    entryPoints: ['web/style.css'],
    bundle: true,
    write: false,
    logLevel: 'silent',
  });
  assets['style.css'] = styles.outputFiles[0].text;
  return assets;
}
