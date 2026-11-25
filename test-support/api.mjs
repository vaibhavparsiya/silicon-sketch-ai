import { handle } from '../worker/server.mjs';

/** Connect a DOM test to the real HTTP router with isolated in-memory snapshot storage.
 * @param {import('node:test').TestContext} t
 * @returns {object} Bindings that can be adjusted to simulate storage outages.
 */
export function connectApi(t) {
  const store = new Map(),
    env = {
      BUCKET: {
        get: (key) => (store.has(key) ? { json: () => JSON.parse(store.get(key)) } : null),
        put: (key, value, options) => {
          if (options && store.has(key)) return null;
          store.set(key, value);
          return {};
        },
      },
    };
  t.mock.method(globalThis, 'fetch', async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('origin', 'https://lab.test');
    return handle(
      new Request(new URL(path, 'https://lab.test'), { ...init, headers }),
      env,
      {},
      'fixture',
    );
  });
  return env;
}
