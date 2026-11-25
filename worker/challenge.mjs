// Ground truth stays in the private bucket. One immutable ticket per probe.
/** Create, probe or conclude the private-input mystery circuit.
 * @param {string} path
 * @param {object} body
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function challenge(path, body, env) {
  if (path === '/api/challenge') {
    const id = crypto.randomUUID(),
      rand = crypto.getRandomValues(new Uint8Array(2));
    const fault = { node: 'ABC'[rand[0] % 3], type: rand[1] % 2 ? 'SA1' : 'SA0' };
    await env.BUCKET.put('ctf/' + id, JSON.stringify(fault));
    return { challenge_id: id, max_probes: 4, circuit: 'Y = (A & B) | (A & C) | (B & C)' };
  }
  if (!/^[0-9a-f-]{36}$/.test(body?.challenge_id)) throw Error('Invalid challenge ID.');
  const key = 'ctf/' + body.challenge_id,
    saved = await env.BUCKET.get(key);
  if (!saved) throw Error('Challenge not found.');
  const f = await saved.json();
  if (path === '/api/verify-fault') {
    const g = body.guessed_faults;
    if (
      !Array.isArray(g) ||
      g.length !== 1 ||
      !['A', 'B', 'C'].includes(g[0]?.node) ||
      !['SA0', 'SA1'].includes(g[0]?.type)
    )
      throw Error('Select one input fault.');
    const result = { solved: g[0].node === f.node && g[0].type === f.type };
    const created = await env.BUCKET.put(key + '/result', JSON.stringify(result), {
      onlyIf: { etagDoesNotMatch: '*' },
    });
    if (!created) return (await env.BUCKET.get(key + '/result')).json();
    return result;
  }
  if (await env.BUCKET.get(key + '/result')) throw Error('This challenge is closed.');
  const v = body.vector;
  if (!Number.isInteger(v) || v < 0 || v > 7) throw Error('Select vector 0–7.');
  const majority = (x) => Number((x >> 2) + ((x >> 1) & 1) + (x & 1) >= 2);
  for (let i = 1; i <= 4; i++) {
    const slot = await env.BUCKET.put(key + '/probe' + i, String(v), {
      onlyIf: { etagDoesNotMatch: '*' },
    });
    if (slot) {
      const m = 1 << (2 - 'ABC'.indexOf(f.node));
      return {
        vector: v,
        expected: majority(v),
        observed: majority(f.type === 'SA0' ? v & ~m : v | m),
        used: i,
      };
    }
  }
  throw Error('Probe budget exhausted.');
}
