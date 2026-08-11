// Local replacement for '@base44/sdk/dist/utils/axios-client'.
// AuthContext uses createAxiosClient to fetch app public settings during
// bootstrap. This shim performs the same GET/POST against the local backend
// and mirrors the axios interceptResponses behavior (returns response.data,
// throws errors carrying { status, data }).

export function createAxiosClient({ baseURL = '', headers = {}, token } = {}) {
  const base = (baseURL || '').replace(/\/$/, '');
  const authHeaders = { ...headers };
  if (token) authHeaders['Authorization'] = `Bearer ${token}`;

  async function call(method, url, body) {
    const h = { ...authHeaders };
    let payload;
    if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const resp = await fetch(`${base}${url}`, { method, headers: h, body: payload });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      /* no json body */
    }
    if (!resp.ok) {
      const err = new Error(data?.error || data?.message || `Request failed: ${resp.status}`);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    get: (url) => call('GET', url),
    post: (url, body) => call('POST', url, body),
    put: (url, body) => call('PUT', url, body),
    delete: (url) => call('DELETE', url),
  };
}

export default { createAxiosClient };
