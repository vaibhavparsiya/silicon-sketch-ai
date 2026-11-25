import { showShareLink } from './ShareLink.js';
import { api } from '../api/client.js';
import { byId as $ } from './dom.js';
/** Bind private probe games and shared RTL fault challenges.
 * @param {Function} current
 * @param {Function} fault
 * @param {Function} load
 * @param {Function} probes
 * @returns {void}
 */
export function bindHunts(current, fault, load, probes) {
  const option = (value, label) => new Option(label, value);
  let game;
  for (let i = 0; i < 8; i++) $('abc').add(option(i, i.toString(2).padStart(3, '0')));
  for (const a of 'ABC')
    for (const type of ['SA0', 'SA1']) $('guess').add(option(a + type, a + ' ' + type));
  async function play(id, fn) {
    $(id).disabled = true;
    try {
      await fn();
    } catch (e) {
      $('results').textContent += '\n' + e.message;
    } finally {
      $(id).disabled = false;
    }
  }
  $('start').onclick = () =>
    play('start', async () => {
      $('game').hidden = false;
      game = await api('/api/challenge', {});
      $('results').textContent = 'Majority voter · four probes available.';
    });
  $('probe').onclick = () =>
    play('probe', async () => {
      const r = await api('/api/probe', {
        challenge_id: game.challenge_id,
        vector: Number($('abc').value),
      });
      $('results').textContent +=
        '\n' +
        r.used +
        '/4   ABC ' +
        r.vector.toString(2).padStart(3, '0') +
        '   expected ' +
        r.expected +
        '   observed ' +
        r.observed;
    });
  $('verify').onclick = () =>
    play('verify', async () => {
      const g = $('guess').value;
      const r = await api('/api/verify-fault', {
        challenge_id: game.challenge_id,
        guessed_faults: [{ node: g[0], type: g.slice(1) }],
      });
      $('results').textContent +=
        '\n' + (r.solved ? 'Correct diagnosis.' : 'Incorrect diagnosis. Challenge closed.');
    });

  const snapshotSave = $('save').onclick;
  $('save').onclick = async () => {
    if (!$('sabotage').checked) return snapshotSave();
    try {
      const { id } = await api('/api/hunts', { design: current(), fault: fault() });
      const url = new URL('/rtl', location.origin);
      url.searchParams.set('hunt', id);
      showShareLink($('shared'), url);
    } catch (e) {
      $('shared').textContent = e.message;
    }
  };
  const hunt = new URLSearchParams(location.search).get('hunt');
  if (hunt)
    api('/api/hunts/open', { id: hunt })
      .then((r) => {
        load(r.design);
        $('blind-tools').hidden = false;
        for (const [id, action] of [
          ['blind-probe', 'probe'],
          ['blind-solve', 'solve'],
        ])
          $(id).onclick = async () => {
            try {
              const values = probes();
              const result = await api('/api/hunts/' + action, { id: hunt, inputs: values });
              $('blind-result').textContent = JSON.stringify(result);
            } catch (e) {
              $('blind-result').textContent = e.message;
            }
          };
      })
      .catch((e) => {
        $('shared').textContent = e.message;
      });
}
