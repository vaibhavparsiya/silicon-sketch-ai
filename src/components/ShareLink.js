/** Present a usable snapshot URL and announce user-requested clipboard actions.
 * @param {HTMLElement} host @param {URL} url @returns {void}
 */
export function showShareLink(host, url) {
  const link = document.createElement('a'),
    copy = document.createElement('button'),
    status = document.createElement('span');
  link.href = url.href;
  link.textContent = url.href;
  copy.type = 'button';
  copy.textContent = 'Copy link';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = 'Link copied.';
    } catch {
      link.focus();
      status.textContent = 'Select and copy the link above.';
    }
  };
  host.replaceChildren(
    link,
    document.createTextNode(' '),
    copy,
    document.createTextNode(' '),
    status,
  );
}
