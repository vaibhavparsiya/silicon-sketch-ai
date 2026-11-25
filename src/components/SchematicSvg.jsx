import { svg, drawing, line, label } from './svg.js';
import { expression, bit, signals, literals, covers } from '../../shared/booleanEngine.js';
const gate = (root, x, y, w, name, high) => {
  root.append(
    svg('rect', { x, y: y - 14, width: w, height: 28, rx: 6, class: high ? 'gate lit' : 'gate' }),
  );
  label(root, x + w / 2, y + 4, name, 'center');
};
/** Draw the minimized Boolean gates and current logic levels.
 * @param {HTMLElement} host
 * @param {number} mask
 * @param {string[]} terms
 * @param {number} vector
 * @returns {void}
 */
export function schematic(host, mask, terms, vector) {
  const h = Math.max(165, terms.length * 78 + 18),
    mid = h / 2,
    output = (mask >> vector) & 1;
  const s = drawing(
    580,
    h,
    'Logic network for ' + expression(terms),
    'Three binary input probes feed the minimized network. Current output Y is ' + output,
  );
  if (!terms.length || terms[0] === '---') {
    const v = Number(terms.length > 0);
    gate(s, 60, mid, 90, 'CONST ' + v, v);
    line(s, 'M150 ' + mid + 'H500', v);
  } else {
    terms.forEach((term, i) => {
      const args = literals(term),
        y = ((i + 0.5) * h) / terms.length,
        on = covers(term, vector);
      args.forEach((name, j) => {
        const yy = y + (j - (args.length - 1) / 2) * 19,
          inv = name.startsWith('~'),
          signal = name.at(-1),
          v = bit(vector, signals.indexOf(signal));
        label(s, 18, yy + 4, signal + ' ' + v);
        line(s, 'M50 ' + yy + 'H76', v);
        if (inv) {
          s.append(
            svg('path', { d: 'M76 ' + (yy - 6) + 'v12l13 -6z', class: 'gate' }),
            svg('circle', { cx: 92, cy: yy, r: 3, class: 'gate' }),
          );
        }
        line(
          s,
          'M' + (inv ? 95 : 76) + ' ' + yy + 'H170L215 ' + (y + (j - (args.length - 1) / 2) * 7),
          inv ? !v : v,
        );
      });
      gate(s, 215, y, 70, args.length === 1 ? 'BUF' : 'AND', on);
      const target = mid + (i - (terms.length - 1) / 2) * 6;
      line(s, 'M285 ' + y + 'H310C360 ' + y + ' 360 ' + target + ' 403 ' + target, on);
    });
    gate(s, 403, mid, 60, terms.length === 1 ? 'BUF' : 'OR', output);
    line(s, 'M463 ' + mid + 'H500', output);
  }
  gate(s, 500, mid, 63, 'Y = ' + output, output);
  host.replaceChildren(s);
}
