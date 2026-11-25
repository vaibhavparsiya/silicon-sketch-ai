/** Upper bound on an HTTP body before decompression, in bytes. */
export const MAX_BODY = 32 * 1024;
export const MAX_SNAPSHOT = 512 * 1024;
export const MAX_PROMPT = 1000;
const reserved = new Set(['__proto__', 'prototype', 'constructor']);

/** Check a public HDL port or module name.
 * @param {unknown} value
 * @returns {boolean} */
export function identifier(value) {
  return (
    typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(value) && !reserved.has(value)
  );
}

/** Accept compact snapshot IDs and the original full SHA-256 IDs.
 * @param {unknown} id
 * @returns {boolean} */
export function designId(id) {
  return typeof id === 'string' && /^(?:[A-Za-z0-9_-]{6,32}|[a-f0-9]{64})$/.test(id);
}

/** Validate untrusted JSON at the boundary before using it in application objects.
 * @param {string} text
 * @returns {unknown} The decoded JSON value.
 */
export function safeJson(text) {
  const value = JSON.parse(text);
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, item] of Object.entries(current)) {
      if (reserved.has(key)) throw new Error('Unsafe object key.');
      pending.push(item);
    }
  }
  return value;
}

/** Bound streaming and compressed inputs without trusting Content-Length.
 * @param {ReadableStream<Uint8Array>|null} stream
 * @param {number} limit
 * @returns {Promise<Uint8Array>}
 */
export async function boundedBytes(stream, limit) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        throw new RangeError('Request body exceeds the allowed size.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}
