import { HttpError } from './http.mjs';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 20;
const MAX_CLIENTS = 10000;

/** Construct an isolated fixed-window counter. Its memory is bounded across IP churn.
 * @param {()=>number} [clock]
 * @returns {(identity:string)=>boolean} True when admitted.
 */
export function createLimiter(clock = Date.now) {
  const counts = new Map();
  let window = -1;
  return (identity) => {
    const now = Math.floor(clock() / (1000 * WINDOW_SECONDS));
    if (window !== now) {
      counts.clear();
      window = now;
    }
    const count = counts.get(identity) || 0;
    if ((!count && counts.size >= MAX_CLIENTS) || count >= MAX_REQUESTS) return false;
    counts.set(identity, count + 1);
    return true;
  };
}
const local = createLimiter();

/** Apply a platform rate binding or the bounded process-local counter.
 * @param {Request} request
 * @param {object} env
 * @param {string} [peer]
 * @returns {Promise<void>}
 */
export async function limitWrites(request, env, peer) {
  const key = peer || request.headers.get('cf-connecting-ip') || 'local';
  const allowed = env.RATE_LIMIT?.limit
    ? (await env.RATE_LIMIT.limit({ key })).success
    : local(key);
  if (!allowed)
    throw new HttpError(429, 'Too many requests. Try again in a minute.', {
      'retry-after': String(WINDOW_SECONDS),
    });
}
