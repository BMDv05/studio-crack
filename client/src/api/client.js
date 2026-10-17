/* One API layer for the whole frontend: same-origin fetch (Vite proxies
 * /api and /media to the backend in dev), JSON everywhere, CSRF header on
 * every mutation (read from the csrf cookie the server sets at login). */
function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)dh_csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || 'Request failed.');
    this.status = status;
    this.errors = (data && data.errors) || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const opts = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body; // browser sets multipart boundary itself
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  if (method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = csrfToken();
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError(0, { error: 'Network error. Check your connection and try again.' });
  }
  if (res.status === 401 && path.startsWith('/api/admin') &&
      !window.location.pathname.startsWith('/admin/login')) {
    window.location.href = '/admin/login?expired=1';
    throw new ApiError(401, { error: 'Signed out.' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });
