import { boundedBytes, MAX_BODY, MAX_SNAPSHOT, safeJson } from '../shared/validators.js';

export class HttpError extends Error {
  /** @param {number} status
   * @param {string} message
   * @param {Record<string,string>} headers */
  constructor(status, message, headers = {}) {
    super(message);
    Object.assign(this, { status, headers });
  }
}

/** Attach browser policies to HTML, scripts, API replies and errors.
 * @param {Response} response
 * @param {string} [path]
 * @returns {Response}
 */
export function secured(response, path = '') {
  const compiler = path === '/yosys-worker.mjs';
  const headers = new Headers(response.headers);
  const policy = [
    "default-src 'self'",
    compiler ? "script-src 'self' blob: 'wasm-unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    compiler ? "connect-src 'self' blob: https://registry.npmjs.org" : "connect-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ];
  headers.set('content-security-policy', policy.join('; '));
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, headers });
}

/** Serialize an API result without caching prompts or design data.
 * @param {unknown} value
 * @param {number} [status]
 * @param {HeadersInit} [extra]
 * @returns {Response}
 */
export function json(value, status = 200, extra = {}) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...extra } });
}

/** Parse a bounded same-origin JSON submission, including compressed netlists.
 * @param {Request} request
 * @param {boolean} largeDesign
 * @returns {Promise<unknown>}
 */
export async function readBody(request, largeDesign) {
  if (Number(request.headers.get('content-length')) > MAX_BODY)
    throw new HttpError(413, 'Request body exceeds the allowed size.');
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    throw new HttpError(415, 'JSON required.');
  const encoding = request.headers.get('content-encoding')?.toLowerCase() || 'identity';
  if (!['identity', 'gzip'].includes(encoding))
    throw new HttpError(415, 'Unsupported content encoding.');
  try {
    let bytes = await boundedBytes(request.body, MAX_BODY);
    if (encoding === 'gzip') {
      const decoded = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = await boundedBytes(decoded, largeDesign ? MAX_SNAPSHOT : MAX_BODY);
    }
    return safeJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (err) {
    if (err instanceof RangeError)
      throw new HttpError(413, 'Request body exceeds the allowed size.');
    throw new HttpError(400, err.message === 'Unsafe object key.' ? err.message : 'Invalid JSON.');
  }
}
