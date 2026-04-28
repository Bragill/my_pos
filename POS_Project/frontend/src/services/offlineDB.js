import { openDB } from 'idb';

const DB_NAME = 'pos_offline';
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pending_orders')) {
        db.createObjectStore('pending_orders', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('products_cache')) {
        const store = db.createObjectStore('products_cache', { keyPath: 'id' });
        store.createIndex('barcode', 'barcode');
        store.createIndex('name', 'name');
      }
      if (!db.objectStoreNames.contains('categories_cache')) {
        db.createObjectStore('categories_cache', { keyPath: 'id' });
      }
    },
  });
}

// ออเดอร์ออฟไลน์
export async function savePendingOrder(order) {
  const db = await getDB();
  return db.add('pending_orders', { ...order, created_at: new Date().toISOString() });
}

export async function getPendingOrders() {
  const db = await getDB();
  return db.getAll('pending_orders');
}

export async function deletePendingOrder(id) {
  const db = await getDB();
  return db.delete('pending_orders', id);
}

// แคชสินค้า
export async function cacheProducts(products) {
  const db = await getDB();
  const tx = db.transaction('products_cache', 'readwrite');
  await Promise.all(products.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function getCachedProducts() {
  const db = await getDB();
  return db.getAll('products_cache');
}

export async function getCachedProductByBarcode(barcode) {
  const db = await getDB();
  return db.getFromIndex('products_cache', 'barcode', barcode);
}

// แคชหมวดหมู่
export async function cacheCategories(categories) {
  const db = await getDB();
  const tx = db.transaction('categories_cache', 'readwrite');
  await Promise.all(categories.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function getCachedCategories() {
  const db = await getDB();
  return db.getAll('categories_cache');
}
