/** Create an SVG element with text and attributes.
 * @param {string} tag
 * @param {object} [attrs]
 * @param {string} [value]
 * @returns {SVGElement}
 */
export function svg(tag, attrs = {}, value = '') {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.textContent = value;
  return e;
}
/** Create an announced diagram with its own title and description.
 * @param {number} width
 * @param {number} height
 * @param {string} label
 * @param {string} description
 * @returns {SVGElement}
 */
export function drawing(width, height, label, description) {
  const root = svg('svg', {
    viewBox: '0 0 ' + width + ' ' + height,
    role: 'img',
    'aria-label': label,
  });
  root.append(svg('title', {}, label), svg('desc', {}, description));
  return root;
}
/** Append a sampled wire path.
 * @param {SVGElement} root
 * @param {string} d
 * @param {boolean} high
 * @returns {void}
 */
export const line = (root, d, high) =>
  root.append(svg('path', { d, class: high ? 'wire hot' : 'wire' }));
/** Append a text label at a diagram coordinate.
 * @param {SVGElement} root
 * @param {number} x
 * @param {number} y
 * @param {string} s
 * @param {string} [cls]
 * @returns {void}
 */
export const label = (root, x, y, s, cls = '') => root.append(svg('text', { x, y, class: cls }, s));
