import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { getPendingCount, syncPendingOrders } from '../services/syncService';

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastChecked, setLastChecked] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  const prevOnlineRef = useRef(isOnline);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
    return count;
  }, []);

  const checkNetworkStatus = useCallback(async () => {
    const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setIsOnline(browserOnline);

    if (!browserOnline) {
      setIsServerReachable(false);
      await refreshPendingCount();
      setLastChecked(new Date());
      return { isOnline: false, isServerReachable: false };
    }

    setIsChecking(true);
    try {
      // Lightweight health ping check (timeout 4s)
      const res = await api.get('/health', { timeout: 4000 });
      const reachable = res.status === 200 && res.data?.status === 'ok';
      setIsServerReachable(reachable);
    } catch {
      setIsServerReachable(false);
    } finally {
      setIsChecking(false);
      setLastChecked(new Date());
    }

    const currentPending = await refreshPendingCount();
    return { isOnline: browserOnline, isServerReachable };
  }, [refreshPendingCount, isServerReachable]);

  // Handle transitions between Online and Offline
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      toast.success('🌐 กลับมาเชื่อมต่ออินเทอร์เน็ตแล้ว', { id: 'net-status' });
      await checkNetworkStatus();
      
      // Auto-trigger sync on returning online
      const result = await syncPendingOrders();
      await refreshPendingCount();
      
      if (result && result.synced > 0) {
        toast.success(`✅ ซิงค์ออเดอร์ค้างสำเร็จ ${result.synced} รายการ`, { duration: 4000 });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
      refreshPendingCount();
      toast.error('⚠️ ขาดการเชื่อมต่ออินเทอร์เน็ต - ระบบเข้าสู่โหมดขายออฟไลน์', { id: 'net-status', duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkNetworkStatus, refreshPendingCount]);

  // Periodic heartbeat ping probe every 20 seconds (paused when page hidden)
  useEffect(() => {
    checkNetworkStatus();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkNetworkStatus();
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [checkNetworkStatus]);

  // Overall status classification:
  // 'online' = Browser online & Server reachable
  // 'offline' = Browser offline
  // 'server_down' = Browser online but server ping failed
  const status = !isOnline 
    ? 'offline' 
    : !isServerReachable 
    ? 'server_down' 
    : 'online';

  return (
    <NetworkContext.Provider value={{
      isOnline,
      isServerReachable,
      status,
      pendingCount,
      lastChecked,
      isChecking,
      checkNetworkStatus,
      refreshPendingCount,
    }}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
