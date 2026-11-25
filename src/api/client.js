import { MAX_BODY, MAX_SNAPSHOT } from '../../shared/validators.js';

/** Call the same-origin API. Compress large designs before transmission.
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<object>}
 */
export async function api(path, body) {
  const init = { cache: 'no-store' };
  if (body !== undefined) {
    init.method = 'POST';
    init.headers = { 'content-type': 'application/json' };
    const raw = new Blob([JSON.stringify(body)]);
    if (raw.size > MAX_SNAPSHOT) throw Error('Design exceeds the snapshot size limit.');
    if (raw.size > MAX_BODY) {
      const compressed = await new Response(
        raw.stream().pipeThrough(new CompressionStream('gzip')),
      ).blob();
      if (compressed.size > MAX_BODY)
        throw Error('This design exceeds the compressed transfer limit.');
      init.headers['content-encoding'] = 'gzip';
      init.body = compressed;
    } else init.body = raw;
  }
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(Error(data.error || 'Request failed.'), {
      status: response.status,
      fallback: data.fallback_available,
    });
  return data;
}
