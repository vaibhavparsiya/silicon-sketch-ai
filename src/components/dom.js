/** Read a named control in the active lab.
 * @param {string} id
 * @returns {HTMLElement} */
export const byId = (id) => document.getElementById(id);

/** Create a native push button.
 * @param {string} text
 * @param {Function} action
 * @returns {HTMLButtonElement} */
export function button(text, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.onclick = action;
  return element;
}
/** Create a text-only DOM element.
 * @param {string} tag
 * @param {string} text
 * @param {string} [cls]
 * @returns {HTMLElement}
 */
export const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
