/* Tiny toast queue for admin confirmations (ok / error). */
export function toast(message, kind = 'ok') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'a-toast' + (kind === 'err' ? ' err' : '');
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 300ms ease-out';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 4000);
}
