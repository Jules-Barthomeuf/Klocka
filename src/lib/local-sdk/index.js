// Drop-in local replacement for `@base44/sdk`'s createClient().
// Mirrors the base44 client surface the app uses (entities, auth, integrations,
// functions, agents, appLogs) but talks to the local Express backend at /api.
//
// Wired in via Vite alias (@base44/sdk -> this file), so the application source
// keeps importing `createClient` from '@base44/sdk' unchanged.

function normalizeBase(serverUrl) {
  // Default to same-origin ('') so requests hit '/api/...' (Vite dev proxy).
  if (!serverUrl || serverUrl === 'null' || serverUrl === 'undefined') return '';
  return serverUrl.replace(/\/$/, '');
}

export function createClient(config = {}) {
  const base = normalizeBase(config.serverUrl);
  const token = config.token;

  async function request(method, url, { body, isForm } = {}) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (config.appId) headers['X-App-Id'] = config.appId;
    let payload;
    if (isForm) {
      payload = body; // FormData
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const resp = await fetch(`${base}${url}`, { method, headers, body: payload });
    if (!resp.ok) {
      let data = null;
      try {
        data = await resp.json();
      } catch {
        /* no body */
      }
      const err = new Error(data?.error || `Request failed: ${resp.status}`);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    if (resp.status === 204) return null;
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('application/json') ? resp.json() : resp.text();
  }

  const qs = (params) => {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  };

  // --- Entities: base44 methods (list/filter/get/create/update/delete) ---
  function makeEntity(name) {
    return {
      list: (sort, limit, skip) =>
        request('GET', `/api/entities/${name}${qs({ sort, limit, skip })}`),
      filter: (query, sort, limit) =>
        request('POST', `/api/entities/${name}/filter`, { body: { query, sort, limit } }),
      get: (id) => request('GET', `/api/entities/${name}/${id}`),
      create: (data) => request('POST', `/api/entities/${name}`, { body: data }),
      update: (id, data) => request('PUT', `/api/entities/${name}/${id}`, { body: data }),
      delete: (id) => request('DELETE', `/api/entities/${name}/${id}`),
      bulkCreate: async (items) => {
        const out = [];
        for (const it of items || []) out.push(await request('POST', `/api/entities/${name}`, { body: it }));
        return out;
      },
    };
  }

  const entities = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop !== 'string') return undefined;
        return makeEntity(prop);
      },
    }
  );

  // --- Auth ---
  const auth = {
    me: () => request('GET', '/api/auth/me'),
    updateMe: (data) => request('POST', '/api/auth/updateMe', { body: data }),
    updateMyUserData: (data) => request('POST', '/api/auth/updateMe', { body: data }),
    logout: async (redirectUrl) => {
      // Await the call so the session cookie is cleared before we navigate,
      // otherwise the reload can land back on an authenticated page.
      try {
        await request('POST', '/api/auth/logout');
      } catch {
        /* logging out is best-effort */
      }
      if (typeof window !== 'undefined') {
        window.location.href = redirectUrl || '/Home';
      }
      return { success: true };
    },
    redirectToLogin: (fromUrl) => {
      // Google sign-in: it authenticates the user AND grants mail sending.
      if (typeof window === 'undefined') return;
      let returnTo = '/Dashboard';
      try {
        if (fromUrl) returnTo = new URL(fromUrl, window.location.origin).pathname || '/Dashboard';
      } catch {
        /* keep the default */
      }
      // Never bounce back to the landing page — it would look like a no-op.
      if (returnTo === '/' || returnTo === '/Home') returnTo = '/Dashboard';
      window.location.href = `/api/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`;
    },
    isAuthenticated: async () => {
      try {
        await request('GET', '/api/auth/me');
        return true;
      } catch {
        return false;
      }
    },
    deleteMe: () => request('POST', '/api/auth/logout'),
  };

  // --- Integrations (Core) ---
  const Core = {
    InvokeLLM: (params) => request('POST', '/api/integrations/invoke-llm', { body: params }),
    SendEmail: (params) => request('POST', '/api/integrations/send-email', { body: params }),
    SendSMS: (params) => request('POST', '/api/integrations/send-sms', { body: params }),
    GenerateImage: (params) => request('POST', '/api/integrations/generate-image', { body: params }),
    ExtractDataFromUploadedFile: (params) =>
      request('POST', '/api/integrations/extract-data', { body: params }),
    UploadFile: ({ file }) => {
      const form = new FormData();
      form.append('file', file);
      return request('POST', '/api/integrations/upload-file', { body: form, isForm: true });
    },
  };

  // --- Functions ---
  const functions = {
    invoke: (name, params) => request('POST', `/api/functions/${name}`, { body: params }),
  };

  // --- Agents ---
  const agents = {
    listConversations: (params = {}) =>
      request('GET', `/api/agents/conversations${qs({ agent_name: params.agent_name })}`),
    getConversation: (id) => request('GET', `/api/agents/conversations/${id}`),
    createConversation: (params) => request('POST', '/api/agents/conversations', { body: params }),
    deleteConversation: (id) => request('DELETE', `/api/agents/conversations/${id}`),
    addMessage: (conversation, message) => {
      const id = typeof conversation === 'string' ? conversation : conversation?.id;
      return request('POST', `/api/agents/conversations/${id}/messages`, { body: message });
    },
    // Polling-based subscription: fetches the conversation and invokes cb on updates.
    subscribeToConversation: (id, cb) => {
      let stopped = false;
      let lastLen = -1;
      const poll = async () => {
        if (stopped) return;
        try {
          const conv = await request('GET', `/api/agents/conversations/${id}`);
          const msgs = conv?.messages || [];
          if (msgs.length !== lastLen) {
            lastLen = msgs.length;
            cb({ messages: msgs });
          }
        } catch {
          /* keep polling */
        }
      };
      poll();
      const interval = setInterval(poll, 900);
      return () => {
        stopped = true;
        clearInterval(interval);
      };
    },
  };

  // --- App logs (no-op locally) ---
  const appLogs = {
    // Consigne la page ouverte : c'est la matière du centre de suivi. Un échec
    // est avalé — un journal ne doit jamais gêner la navigation.
    logUserInApp: (page) =>
      request('POST', '/api/journal/page', { body: { page, url: window.location.href } }).catch(() => ({
        success: false,
      })),
  };

  return {
    appId: config.appId,
    entities,
    auth,
    integrations: { Core },
    functions,
    agents,
    appLogs,
    // Accès direct pour les endpoints hors surface Base44 (préanalyse, etc.).
    request,
  };
}

export default { createClient };
