import { render } from 'preact';
import { bit, signals } from '../../shared/booleanEngine.js';

/** Render the eight probeable rows. Stable keys keep keyboard focus during edits.
 * @param {HTMLElement} host
 * @param {number} mask
 * @param {number} vector
 * @param {(row:number)=>void} toggle
 * @returns {void}
 */
export function truthTable(host, mask, vector, toggle) {
  const rows = Array.from({ length: 8 }, (_, row) => {
    const value = (mask >> row) & 1,
      bits = row.toString(2).padStart(3, '0');
    return (
      <tr key={row} class={row === vector ? 'selected' : undefined}>
        {signals.map((name, index) => (
          <td key={name}>{bit(row, index)}</td>
        ))}
        <td>
          <button
            type="button"
            id={'cell' + row}
            aria-pressed={value === 1}
            aria-label={'Toggle output for A B C ' + bits + '. Current output ' + value}
            onClick={() => toggle(row)}
          >
            {value}
          </button>
        </td>
      </tr>
    );
  });
  render(rows, host);
}
