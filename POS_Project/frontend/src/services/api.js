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

// Ingredient API methods
export const ingredientsAPI = {
  getAll: (search) => api.get('/ingredients', { params: { search } }),
  getById: (id) => api.get(`/ingredients/${id}`),
  create: (data) => api.post('/ingredients', data),
  update: (id, data) => api.put(`/ingredients/${id}`, data),
  adjustStock: (id, data) => api.post(`/ingredients/${id}/adjust`, data),
  delete: (id) => api.delete(`/ingredients/${id}`),
};

// Recipe API methods
export const recipesAPI = {
  getByProduct: (productId) => api.get(`/recipes/product/${productId}`),
  saveRecipe: (productId, data) => api.post(`/recipes/product/${productId}`, data),
  deleteRecipe: (productId) => api.delete(`/recipes/product/${productId}`),
  getSummary: () => api.get('/recipes/summary'),
  createMasterRecipe: (data) => api.post('/recipes/master', data),
  deleteMasterRecipe: (id) => api.delete(`/recipes/master/${id}`),
};

// Batch / expiry-tracking API methods
export const batchesAPI = {
  getAll: (params) => api.get('/inventory/batches', { params }),
  writeOff: (id, data) => api.post(`/inventory/batches/${id}/writeoff`, data),
};

export default api;
