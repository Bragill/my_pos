import api from './api';

const ocrService = {
  uploadReceipt: async (file) => {
    const formData = new FormData();
    formData.append('receipt', file);
    const response = await api.post('/ocr/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  listReceipts: async (params) => {
    const response = await api.get('/ocr', { params });
    return response.data;
  },

  getReceipt: async (id) => {
    const response = await api.get(`/ocr/${id}`);
    return response.data;
  },

  deleteReceipt: async (id) => {
    const response = await api.delete(`/ocr/${id}`);
    return response.data;
  },
};

export default ocrService;
