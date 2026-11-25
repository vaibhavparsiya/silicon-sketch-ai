/** @typedef {{next:number,hit:number}} Transition */
/** @typedef {{cycle:number,state:number,input:number,next:number,hit:number}} Cycle */
export const maxCycles = 96;

/** Construct the prefix-matching Mealy transition table.
 * @param {string} pattern
 * @param {boolean} overlap
 * @returns {Transition[][]}
 */
export function buildDetector(pattern, overlap = true) {
  if (typeof pattern !== 'string' || !/^[01]{1,8}$/.test(pattern)) {
    throw Error('Choose a pattern of 1–8 binary digits.');
  }
  // State k remembers k matching prefix bits. After each edge, retain
  // the longest suffix that can still start another occurrence.
  return Array.from({ length: pattern.length }, (_, state) =>
    ['0', '1'].map((input) => {
      const seen = pattern.slice(0, state) + input;
      const hit = Number(seen === pattern);
      let next = hit && !overlap ? 0 : Math.min(pattern.length - 1, seen.length);
      while (next && !seen.endsWith(pattern.slice(0, next))) next--;
      return { next, hit };
    }),
  );
}

/** Replay a binary stream from the reset state.
 * @param {Transition[][]} machine
 * @param {string} stream
 * @returns {Cycle[]}
 */
export function simulate(machine, stream) {
  if (typeof stream !== 'string' || !/^[01]*$/.test(stream) || stream.length > maxCycles) {
    throw Error('Enter up to 96 binary digits.');
  }
  let state = 0;
  return [...stream].map((input, i) => {
    const { next, hit } = machine[state][Number(input)];
    const row = { cycle: i + 1, state, input: Number(input), next, hit };
    state = next;
    return row;
  });
}
