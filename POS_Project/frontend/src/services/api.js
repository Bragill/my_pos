import axios from 'axios';
import { getDeviceMacAddress, detectClientDeviceName } from '../utils/deviceFingerprint';

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

  // Attach Device Fingerprint and Device Name to all API requests
  try {
    const mac = getDeviceMacAddress();
    if (mac) {
      config.headers['x-device-mac'] = mac;
    }
    const devName = detectClientDeviceName();
    if (devName) {
      config.headers['x-device-name'] = encodeURIComponent(devName);
    }
  } catch (_) {}

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
    // Blocked device redirect to login screen
    if (error.response?.status === 403 && error.response?.data?.code === 'DEVICE_BLOCKED') {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Inventory API methods
export const inventoryAPI = {
  cancelPurchaseOrder: (id, data) => api.post(`/inventory/purchase-orders/${id}/cancel`, data),
};

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
  cancelWorkOrder: (id, data) => api.post(`/recipes/work-orders/${id}/cancel`, data),
};

// Batch / expiry-tracking API methods
export const batchesAPI = {
  getAll: (params) => api.get('/inventory/batches', { params }),
  writeOff: (id, data) => api.post(`/inventory/batches/${id}/writeoff`, data),
};

// Approvals API methods
export const approvalsAPI = {
  getAll: (params) => api.get('/approvals', { params }),
  getById: (id) => api.get(`/approvals/${id}`),
  getByDocument: (docId) => api.get(`/approvals/document/${docId}`),
  request: (data) => api.post('/approvals/request', data),
  approve: (id, data) => api.post(`/approvals/${id}/approve`, data),
  reject: (id, data) => api.post(`/approvals/${id}/reject`, data),
  checkRequirement: () => api.get('/approvals/check-store-requirement'),
};

// Device Security API methods
export const securityAPI = {
  checkDevice: (data) => api.post('/auth/check-device', data),
  pingDevice: (data) => api.post('/auth/ping-device', data),
  getDevices: () => api.get('/settings/devices'),
  whitelistDevice: (id) => api.post(`/settings/devices/${id}/whitelist`),
  blacklistDevice: (id) => api.post(`/settings/devices/${id}/blacklist`),
  resetDevice: (id) => api.post(`/settings/devices/${id}/reset`),
  deleteDevice: (id) => api.delete(`/settings/devices/${id}`),
};

export default api;


