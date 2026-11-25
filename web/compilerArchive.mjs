/** Read the pinned compiler's gen directory and attach binary resource URLs to its JS bundle.
 * @param {Uint8Array} tar Uncompressed npm tarball whose digest has already been verified.
 * @returns {string} Module source with local blob URLs for the WASM and data files.
 */
export function compilerSource(tar) {
  const urls = new Map(),
    decoder = new TextDecoder();
  let bundle;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const field = (start, len) =>
      decoder
        .decode(tar.subarray(offset + start, offset + start + len))
        .replace(/\0.*$/s, '')
        .trim();
    const path = field(0, 100);
    if (!path) break;
    const size = parseInt(field(124, 12), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length)
      throw Error('Invalid compiler archive.');
    const data = tar.subarray(offset + 512, offset + 512 + size),
      name = path.split('/').at(-1);
    if (path.startsWith('package/gen/')) {
      if (name === 'bundle.js') bundle = decoder.decode(data);
      else
        urls.set(
          name,
          URL.createObjectURL(
            new Blob([data], {
              type: name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
            }),
          ),
        );
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!bundle || !urls.has('yosys.core.wasm')) throw Error('Incomplete compiler package.');
  bundle = bundle.replace(/new URL\("\.\/([^"]+)", import\.meta\.url\)/g, (match, name) =>
    urls.has(name) ? JSON.stringify(urls.get(name)) : match,
  );
  return bundle;
}
