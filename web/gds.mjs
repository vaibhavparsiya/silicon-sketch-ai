/** Serialize rectangular layer geometry into GDSII binary records.
 * @param {string} name
 * @param {object[]} shapes
 * @returns {Uint8Array}
 */
export function gds(name, shapes) {
  const bytes = [];
  const int = (v, n) => Array.from({ length: n }, (_, i) => (v >>> (8 * (n - i - 1))) & 255);
  function record(type, format, payload = []) {
    bytes.push(...int(payload.length + 4, 2), type, format, ...payload);
  }
  const ascii = (s) => [...s, ...(s.length % 2 ? ['\0'] : [])].map((c) => c.charCodeAt(0));
  function real(v) {
    let exponent = 64;
    while (v < 1 / 16) {
      v *= 16;
      exponent--;
    }
    return [
      exponent,
      ...Array.from({ length: 7 }, () => {
        v *= 256;
        const b = Math.floor(v);
        v -= b;
        return b;
      }),
    ];
  }
  const date = [2026, 1, 1, 0, 0, 0, 2026, 1, 1, 0, 0, 0].flatMap((v) => int(v, 2));
  record(0, 2, int(600, 2));
  record(1, 2, date);
  record(2, 6, ascii('SILICON'));
  record(3, 5, [...real(0.001), ...real(1e-9)]);
  record(5, 2, date);
  record(6, 6, ascii(name.slice(0, 32)));
  for (const { layer, x, y, w, h } of shapes) {
    record(8, 0);
    record(13, 2, int(layer, 2));
    record(14, 2, [0, 0]);
    record(
      16,
      3,
      [x, y, x + w, y, x + w, y + h, x, y + h, x, y].flatMap((v) => int(v, 4)),
    );
    record(17, 0);
  }
  record(7, 0);
  record(4, 0);
  return new Uint8Array(bytes);
}
