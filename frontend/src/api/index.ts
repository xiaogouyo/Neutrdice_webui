import axios, { AxiosError } from 'axios';

const API_BASE = '/api';
const AUTH_BASE = '/auth';
const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

const getPassword = () => localStorage.getItem('neutrdice_password') || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const logsApi = {
  connect: (containerId: string, onMessage: (data: string) => void, onError?: (err?: Event) => void) => {
    // Use SSE for streaming logs - works with standard HTTP proxy
    const es = new EventSource(`/api/logs/stream/${encodeURIComponent(containerId)}`);
    es.onmessage = (event) => {
      onMessage(event.data);
    };
    es.onerror = (err) => {
      console.error('SSE error:', err);
      onError?.(err);
    };
    return es;
  },
};

api.interceptors.request.use((config) => {
  const pwd = getPassword();
  if (pwd) {
    config.headers['X-Panel-Password'] = pwd;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('neutrdice_password');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (password: string) => {
    const res = await axios.post(`${AUTH_BASE}/login`, { password });
    return res.data;
  },
};

export const containersApi = {
  list: async () => {
    const res = await api.get('/containers');
    return res.data;
  },

  getInfo: async (id: string) => {
    const res = await api.get(`/containers/${encodeURIComponent(id)}/info`);
    return res.data;
  },

  getLogs: async (id: string, tail = 100) => {
    const res = await api.get(`/containers/${encodeURIComponent(id)}/logs`, {
      params: { tail },
    });
    return res.data;
  },

  start: async (id: string) => {
    const res = await api.post(`/containers/${encodeURIComponent(id)}/start`);
    return res.data;
  },

  stop: async (id: string) => {
    const res = await api.post(`/containers/${encodeURIComponent(id)}/stop`);
    return res.data;
  },

  restart: async (id: string) => {
    const res = await api.post(`/containers/${encodeURIComponent(id)}/restart`);
    return res.data;
  },

  update: async (id: string, channel: string) => {
    const res = await api.post(`/containers/${encodeURIComponent(id)}/update`, { channel });
    return res.data;
  },
};

export const instancesApi = {
  list: async () => {
    const res = await api.get('/instances');
    return res.data;
  },

  get: async (id: string) => {
    const res = await api.get(`/instances/${encodeURIComponent(id)}`);
    return res.data;
  },

  deploy: async (options: {
    qq: string;
    channel: string;
    login_method: string;
  }) => {
    const res = await api.post('/deploy', options);
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete(`/instances/${encodeURIComponent(id)}`);
    return res.data;
  },
};

export const versionsApi = {
  getVersions: async () => {
    const res = await api.get('/versions');
    return res.data;
  },
};

export const configApi = {
  get: async () => {
    const res = await api.get('/config');
    return res.data;
  },

  save: async (config: Record<string, string>) => {
    const res = await api.post('/config', config);
    return res.data;
  },
};

export const statsApi = {
  get: async () => {
    const res = await api.get('/stats');
    return res.data;
  },
};

export default api;
