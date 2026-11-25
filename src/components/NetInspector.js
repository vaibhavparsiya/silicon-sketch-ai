import { byId as $ } from './dom.js';
/** Describe the selected net, its driver and any forced level.
 * @param {object} net
 * @param {number|null} pin
 * @param {object} state
 * @param {object|null} fault
 * @returns {void}
 */
export function explainNet(net, pin, state, fault) {
  const driver = pin === null ? null : net.cells.find((c) => (c.pins.Q ?? c.pins.Y) === pin);
  if (pin === null)
    $('gate-reason').textContent = 'Select a gate or input to inspect its current value.';
  else if (fault?.net === pin)
    $('gate-reason').textContent =
      'Net ' + pin + ' is forced to ' + state.get(pin) + ' by the selected stuck-at fault.';
  else if (driver) {
    const values = Object.entries(driver.pins)
      .filter(([k]) => k !== 'Q' && k !== 'Y')
      .map(([k, v]) => k + '=' + state.get(v))
      .join(', ');
    $('gate-reason').textContent =
      driver.type +
      ' · ' +
      values +
      ' → ' +
      ('Q' in driver.pins ? 'stored Q' : 'Y') +
      '=' +
      state.get(pin) +
      '.';
  } else
    $('gate-reason').textContent = 'Input net ' + pin + ' currently reads ' + state.get(pin) + '.';
}
