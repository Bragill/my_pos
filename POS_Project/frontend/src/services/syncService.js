import api from './api';
import { getPendingOrders, deletePendingOrder } from './offlineDB';

let syncInProgress = false;

export async function getPendingCount() {
  try {
    const pendingOrders = await getPendingOrders();
    return pendingOrders ? pendingOrders.length : 0;
  } catch {
    return 0;
  }
}

export async function syncPendingOrders() {
  if (syncInProgress || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { synced: 0, total: 0 };
  }

  syncInProgress = true;
  let syncedCount = 0;
  let totalCount = 0;
  try {
    const pendingOrders = await getPendingOrders();
    totalCount = pendingOrders ? pendingOrders.length : 0;

    for (const order of pendingOrders) {
      try {
        await api.post('/orders', order);
        await deletePendingOrder(order.id);
        syncedCount++;
        console.log(`✅ Synced order: ${order.id}`);
      } catch (err) {
        console.error(`❌ Failed to sync order ${order.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error fetching pending orders:', err);
  } finally {
    syncInProgress = false;
  }
  return { synced: syncedCount, total: totalCount };
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
