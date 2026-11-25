import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { transformSync } from 'esbuild';

registerHooks({
  load(url, context, next) {
    if (!new URL(url).pathname.endsWith('.jsx')) return next(url, context);
    const source = readFileSync(new URL(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: transformSync(source, {
        loader: 'jsx',
        jsx: 'automatic',
        jsxImportSource: 'preact',
        format: 'esm',
        target: 'es2022',
        sourcefile: new URL(url).pathname,
        sourcemap: 'inline',
      }).code,
    };
  },
});

/** Mount a real lab entry in a private DOM and restore Node globals after the test.
 * @param {import('node:test').TestContext} t
 * @param {string} page
 * @param {string} entry
 * @param {string} [query]
 * @returns {Promise<JSDOM>}
 */
export async function lab(t, page, entry, query = '') {
  const html = await readFile('web/' + page + '.html', 'utf8'),
    dom = new JSDOM(html, { url: 'https://lab.test/' + query });
  const props = ['window', 'document', 'Option', 'location', 'sessionStorage'];
  const saved = props.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  for (const key of props)
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true,
      writable: true,
    });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  t.after(() => {
    dom.window.close();
    props.forEach((key, i) => {
      if (saved[i]) Object.defineProperty(globalThis, key, saved[i]);
      else delete globalThis[key];
    });
  });
  const component = await import('../' + entry);
  const mount = component.mountLogicLab ?? component.mountSequenceLab ?? component.mountRtlLab;
  if (mount) mount();
  return dom;
}
