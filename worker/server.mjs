import { blind } from './blind.mjs';
import { contract, analyzeFault } from './contract.mjs';
import { challenge } from './challenge.mjs';
import { compilePrompt } from './compile.mjs';
import { loadDesign, saveDesign, validateDesign } from './designs.mjs';
import { HttpError, json, readBody, secured } from './http.mjs';
import { limitWrites } from './rate-limit.mjs';

const compilers = new Set(['/api/interpret', '/api/repair', '/api/ai-compile']);
const games = new Set(['/api/challenge', '/api/probe', '/api/verify-fault']);
const hunts = new Set(['/api/hunts', '/api/hunts/open', '/api/hunts/probe', '/api/hunts/solve']);
const routes = new Set([
  ...compilers,
  ...games,
  ...hunts,
  '/api/designs',
  '/api/validate',
  '/api/fault-analyze',
]);
const aliases = new Map([
  ['/', 'index.html'],
  ['/rtl', 'rtl.html'],
  ['/sequence', 'sequence.html'],
]);
const smallDesignLimit = 8192;

function requireMethod(request, method) {
  if (request.method !== method) throw new HttpError(405, method + ' required.', { allow: method });
}

function asset(request, path, assets) {
  if (!['GET', 'HEAD'].includes(request.method))
    throw new HttpError(405, 'GET or HEAD required.', { allow: 'GET, HEAD' });
  const file = aliases.get(path) ?? path.slice(1);
  if (!Object.hasOwn(assets, file)) return new Response('Not found', { status: 404 });
  const mime = file.endsWith('.html')
    ? 'text/html'
    : file.endsWith('.css')
      ? 'text/css'
      : 'application/javascript';
  return new Response(request.method === 'HEAD' ? null : assets[file], {
    headers: { 'content-type': mime + '; charset=utf-8', 'cache-control': 'no-cache' },
  });
}

async function api(request, url, env, peer) {
  const path = url.pathname;
  if (path === '/api/ai-health') {
    requireMethod(request, 'GET');
    const provider = env.GEMINI_API_KEY ? 'gemini' : env.GROQ_API_KEY ? 'groq' : null;
    return json({ configured: Boolean(provider), provider });
  }
  if (path.startsWith('/api/designs/')) {
    requireMethod(request, 'GET');
    return loadDesign(path.slice('/api/designs/'.length), env.BUCKET);
  }
  if (!routes.has(path)) throw new HttpError(404, 'Unknown API route.');
  requireMethod(request, 'POST');
  if (request.headers.get('origin') !== url.origin)
    throw new HttpError(403, 'Same-origin requests only.');
  if (compilers.has(path) || path === '/api/designs') await limitWrites(request, env, peer);
  const body = await readBody(request, !compilers.has(path) || path === '/api/repair');
  if (
    path === '/api/designs' &&
    body?.kind !== 'universal_rtl' &&
    JSON.stringify(body).length > smallDesignLimit
  )
    throw new HttpError(413, 'Design is too large.');
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new HttpError(422, 'Expected a JSON object.');
  let design;
  try {
    if (hunts.has(path)) return json(await blind(path, body, env.BUCKET));
    if (games.has(path)) return json(await challenge(path, body, env));
    if (path === '/api/fault-analyze')
      return json(analyzeFault(validateDesign(body.design), body.fault));
    design = compilers.has(path) ? await compilePrompt(path, body, env) : validateDesign(body);
    if (path !== '/api/designs') return json(contract(design));
  } catch (err) {
    return json(
      { ok: false, error: err.message, ...(err.fallback ? { fallback_available: true } : {}) },
      err.status || 422,
    );
  }
  return saveDesign(design, env.BUCKET);
}

/** Shared Worker and Node HTTP entry point.
 * @param {Request} request
 * @param {object} env Server-only bindings.
 * @param {Record<string,string>} assets Public build assets.
 * @param {string} [peer] Node socket peer.
 * @returns {Promise<Response>}
 */
export async function handle(request, env, assets, peer) {
  const url = new URL(request.url);
  try {
    const response = url.pathname.startsWith('/api/')
      ? await api(request, url, env, peer)
      : asset(request, url.pathname, assets);
    return secured(response, url.pathname);
  } catch (err) {
    const known = err instanceof HttpError;
    return secured(
      json(
        {
          ok: false,
          error: known ? err.message : 'Design storage is temporarily unavailable. Try again.',
        },
        known ? err.status : 503,
        err.headers,
      ),
      url.pathname,
    );
  }
}
