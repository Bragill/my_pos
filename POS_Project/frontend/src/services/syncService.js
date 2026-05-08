import api from './api';
import { getPendingOrders, deletePendingOrder } from './offlineDB';

let syncInProgress = false;

export async function syncPendingOrders() {
  if (syncInProgress || !navigator.onLine) return;

  syncInProgress = true;
  try {
    const pendingOrders = await getPendingOrders();

    for (const order of pendingOrders) {
      try {
        await api.post('/orders', order);
        await deletePendingOrder(order.id);
        console.log(`✅ Synced order: ${order.id}`);
      } catch (err) {
        console.error(`❌ Failed to sync order ${order.id}:`, err.message);
      }
    }
  } finally {
    syncInProgress = false;
  }
}

// ตรวจสอบและ sync เมื่อกลับมาออนไลน์
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 กลับมาออนไลน์ - เริ่มซิงค์ข้อมูล...');
    syncPendingOrders();
  });

  // Initial sync attempt on load
  if (navigator.onLine) {
    syncPendingOrders();
  }
}
