import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_token');
  const storeId = localStorage.getItem('pos_active_store_id');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (storeId) {
    config.headers['x-store-id'] = storeId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
