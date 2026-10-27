import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired mid-session. In the desktop app there is no login
      // ceremony — silently mint a fresh local session and retry the request
      // once. Falls back to the login page only if that isn't available.
      const original = error.config || {};
      if (!original._retried && !String(original.url || '').includes('/auth/local-session')) {
        try {
          const { data } = await axios.post('/api/auth/local-session');
          localStorage.setItem('token', data.token);
          original._retried = true;
          original.headers = { ...original.headers, Authorization: `Bearer ${data.token}` };
          return api.request(original);
        } catch {
          // fall through to the login redirect
        }
      }
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
