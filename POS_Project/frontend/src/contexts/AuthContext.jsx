import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.clear();
      return null;
    }
  });

  const [stores, setStores] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_available_stores');
      return (saved && saved !== 'undefined') ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeStoreId, setActiveStoreId] = useState(() => {
    return localStorage.getItem('pos_active_store_id') || null;
  });

  const [currentStore, setCurrentStore] = useState(null);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { token, user: userData, stores: userStores } = res.data.data;
    
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(userData));
    localStorage.setItem('pos_available_stores', JSON.stringify(userStores));
    
    setUser(userData);
    setStores(userStores);
    // Store selection is handled by LoginPage after this returns
    return { userData, userStores };
  };

  const pinLogin = async (pin) => {
    const res = await api.post('/auth/pin-login', { pin });
    const { token, user: userData, stores: userStores } = res.data.data;
    
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(userData));
    localStorage.setItem('pos_available_stores', JSON.stringify(userStores));
    
    setUser(userData);
    setStores(userStores);
    // Store selection is handled by LoginPage after this returns
    return { userData, userStores };
  };

  const selectStore = (storeId, availableStores) => {
    const found = (availableStores || stores).find(s => String(s.id) === String(storeId));
    if (!found) {
      throw new Error(`ไม่พบ Store ID: ${storeId}`);
    }
    localStorage.setItem('pos_active_store_id', found.id);
    setActiveStoreId(found.id);
    return found;
  };

  const logout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_available_stores');
    localStorage.removeItem('pos_active_store_id');
    setUser(null);
    setStores([]);
    setActiveStoreId(null);
    setCurrentStore(null);
  };

  const switchStore = (storeId) => {
    localStorage.setItem('pos_active_store_id', storeId);
    setActiveStoreId(storeId);
    // Refresh page to clear all data and re-fetch for new store
    window.location.reload();
  };

  const refreshActiveStore = async () => {
    if (!activeStoreId || !user) return;
    try {
      const res = await api.get('/stores/current');
      setCurrentStore(res.data.data);
      
      // Update the store in the full list too
      const updatedStores = stores.map(s => 
        s.id === res.data.data.id ? res.data.data : s
      );
      setStores(updatedStores);
      localStorage.setItem('pos_available_stores', JSON.stringify(updatedStores));
    } catch (err) {
      console.error('Failed to refresh current store:', err);
    }
  };

  const refreshStores = async () => {
    try {
      const res = await api.get('/stores');
      const newStores = res.data.data;
      setStores(newStores);
      localStorage.setItem('pos_available_stores', JSON.stringify(newStores));
      
      // If active store was deleted, switch to the first available one
      if (activeStoreId && !newStores.find(s => s.id === activeStoreId)) {
        if (newStores.length > 0) {
          localStorage.setItem('pos_active_store_id', newStores[0].id);
          setActiveStoreId(newStores[0].id);
        } else {
          localStorage.removeItem('pos_active_store_id');
          setActiveStoreId(null);
        }
      }
    } catch (err) {
      console.error('Failed to refresh stores:', err);
    }
  };

  useEffect(() => {
    if (user && activeStoreId) {
      refreshActiveStore();
      
      const interval = setInterval(() => {
        refreshActiveStore();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user, activeStoreId]);

  const activeStore = currentStore || stores.find(s => s.id === activeStoreId);

  return (
    <AuthContext.Provider value={{ 
      user, 
      stores, 
      activeStoreId, 
      activeStore, 
      login, 
      pinLogin, 
      logout, 
      switchStore, 
      selectStore,
      refreshStores,
      refreshActiveStore 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
