import { designId } from '../shared/validators.js';
import { rtlDesign } from './rtl.mjs';
import { snapshot } from './interpreter.mjs';
import { HttpError, json } from './http.mjs';

/** Normalize a saved or submitted design using its lab's schema.
 * @param {object} body
 * @returns {object} */
export function validateDesign(body) {
  return body?.kind === 'universal_rtl' ? rtlDesign(body) : snapshot(body);
}

/** Retrieve a current or legacy snapshot.
 * @param {string} id
 * @param {object} bucket
 * @returns {Promise<Response>} */
export async function loadDesign(id, bucket) {
  if (!designId(id)) throw new HttpError(404, 'Invalid design link.');
  const saved = await bucket.get('designs/' + id);
  if (!saved) throw new HttpError(404, 'Shared design was not found.');
  return json(await saved.json());
}

/** Create a content-addressed immutable snapshot.
 * @param {object} design
 * @param {object} bucket
 * @returns {Promise<Response>} */
export async function saveDesign(design, bucket) {
  const data = JSON.stringify(design);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const id = Array.from(new Uint8Array(digest, 0, 16), (v) => v.toString(16).padStart(2, '0')).join(
    '',
  );
  await bucket.put('designs/' + id, data);
  return json({ id }, 201);
}
