import { svg, drawing, line, label } from './svg.js';
import { button } from './dom.js';
import { bit } from '../../shared/booleanEngine.js';
/** Draw all probe waveforms and the keyboard-selectable current vector.
 * @param {HTMLElement} host
 * @param {number} mask
 * @param {number} vector
 * @param {Function} probe
 * @returns {void}
 */
export function analyzer(host, mask, vector, probe) {
  const s = drawing(
    590,
    136,
    'Logic waveform',
    'Inputs A, B, C and output Y for vectors 000 through 111. Selected vector ' +
      vector.toString(2).padStart(3, '0') +
      ', Y equals ' +
      ((mask >> vector) & 1) +
      '.',
  );
  s.append(svg('rect', { x: 64 + vector * 64, y: 0, width: 64, height: 136, class: 'cursor' }));
  ['A', 'B', 'C', 'Y'].forEach((name, j) => {
    const base = 24 + j * 30;
    label(s, 16, base, name);
    let d = '';
    for (let i = 0; i < 8; i++) {
      const level = j === 3 ? (mask >> i) & 1 : bit(i, j);
      d +=
        (i === 0 ? 'M64 ' + (base - level * 15) : 'V' + (base - level * 15)) +
        'H' +
        (64 + (i + 1) * 64);
    }
    line(s, d, j === 3);
  });
  const nav = document.createElement('div');
  nav.className = 'vectors';
  for (let i = 0; i < 8; i++) {
    const b = button(i.toString(2).padStart(3, '0'), () => probe(i, 'vector' + i));
    b.id = 'vector' + i;
    b.setAttribute('aria-pressed', String(i === vector));
    b.setAttribute('aria-label', 'Probe input vector ' + i.toString(2).padStart(3, '0'));
    nav.append(b);
  }
  host.replaceChildren(s, nav);
}
