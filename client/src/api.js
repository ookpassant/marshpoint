import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT (admin requests) from localStorage.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 from an admin endpoint, drop the session and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config && err.config.url ? err.config.url : '';
    const isAdmin = url.includes('/admin') || url.includes('/auth/me');
    if (err.response && err.response.status === 401 && isAdmin) {
      localStorage.removeItem('mp_token');
      localStorage.removeItem('mp_user');
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(err);
  }
);

// Pull a friendly message out of an axios error.
export function errMessage(err, fallback = 'Something went wrong') {
  return (err && err.response && err.response.data && err.response.data.error) || fallback;
}

// Download a file from an authenticated endpoint, preserving the JWT header.
export async function downloadFile(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const href = window.URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(href);
}

export default api;
