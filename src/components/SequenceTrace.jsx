import { node } from './dom.js';
/** Render accessible clock columns and the transition captured on each edge.
 * @param {HTMLElement} host
 * @param {object[]} trace
 * @param {Function} select
 * @returns {void}
 */
export function clockTable(host, trace, select) {
  const table = node('table', '');
  table.className = 'wave-table';
  table.setAttribute('aria-label', 'Clock, input, detector output and state waveform');
  const body = document.createElement('tbody');
  for (const [name, key] of [
    ['Clock', 'cycle'],
    ['DIN', 'input'],
    ['DETECT', 'hit'],
    ['State', 'next'],
  ]) {
    const tr = document.createElement('tr');
    const th = node('th', name);
    th.scope = 'row';
    tr.append(th);
    trace.forEach((r, i) => {
      const cell = node('td', '');
      if (key === 'cycle') {
        const b = node('button', r.cycle);
        b.type = 'button';
        b.dataset.cycle = i;
        b.setAttribute('aria-label', 'Inspect clock ' + r.cycle);
        b.onclick = () => select(i, false);
        cell.append(b);
      } else {
        cell.textContent = key === 'next' ? 'S' + r.next : r[key];
        if (key === 'input' || key === 'hit') cell.className = r[key] ? 'level up' : 'level down';
      }
      tr.append(cell);
    });
    body.append(tr);
  }
  table.append(body);
  host.replaceChildren(table);
}
