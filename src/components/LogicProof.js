import { byId as $ } from './dom.js';
/** Compare later truth-table edits with the saved reference.
 * @param {()=>number} current
 * @returns {void}
 */
export function bindLogicProof(current) {
  const goldenMask = current();
  let referenceMask = goldenMask;
  $('remember-mask').onclick = () => {
    referenceMask = current();
    $('logic-proof').textContent = 'Current table saved as reference.';
  };
  $('compare-mask').onclick = () => {
    const mask = current();
    const delta = referenceMask ^ mask;
    if (!delta) {
      $('logic-proof').textContent = 'Equivalent across all eight input combinations.';
      return;
    }
    const i = Array.from({ length: 8 }, (_, i) => i).find((i) => (delta >> i) & 1);
    $('logic-proof').textContent =
      'Counterexample ABC=' +
      i.toString(2).padStart(3, '0') +
      ' · reference ' +
      ((referenceMask >> i) & 1) +
      ' · current ' +
      ((mask >> i) & 1) +
      '.';
  };
}
