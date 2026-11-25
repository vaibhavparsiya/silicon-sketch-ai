import { faultTrace } from '../../shared/booleanEngine.js';
import { button, byId as $ } from './dom.js';
/** Report the first observable input fault and provide a probe action.
 * @param {number} mask
 * @param {Function} probe
 * @returns {void}
 */
export function showFault(mask, probe) {
  const pin = $('pin').selectedIndex,
    stuck = Number($('stuck').value);
  const failures = faultTrace(mask, pin, stuck).filter((x) => x.expected !== x.observed);
  const report = document.createElement('p');
  if (!failures.length) {
    report.textContent =
      'Undetectable for this function. All eight outputs agree despite the stuck input.';
    $('fault').replaceChildren(report);
    return;
  }
  const first = failures[0],
    binary = first.row.toString(2).padStart(3, '0');
  report.textContent =
    failures.length +
    ' of 8 vectors expose this fault. At ' +
    binary +
    ', Y should be ' +
    first.expected +
    ' but the faulty circuit produces ' +
    first.observed +
    '.';
  $('fault').replaceChildren(
    report,
    button('Probe ' + binary, () => {
      probe(first.row, 'sw0');
      $('canvas').scrollIntoView({ block: 'center' });
    }),
  );
}
