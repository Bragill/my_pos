import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import CustomersPage from './pages/CustomersPage';
import SettingsPage from './pages/SettingsPage';
import OcrPage from './pages/OcrPage';
import Layout from './components/Layout';
import InstallPWA from './components/InstallPWA';

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/pos" />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
          <InstallPWA />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/pos" />} />
              <Route path="pos" element={<POSPage />} />
              <Route path="dashboard" element={
                <ProtectedRoute roles={['admin', 'manager']}><DashboardPage /></ProtectedRoute>
              } />
              <Route path="products" element={
                <ProtectedRoute roles={['admin', 'manager']}><ProductsPage /></ProtectedRoute>
              } />
              <Route path="inventory" element={
                <ProtectedRoute roles={['admin', 'manager']}><InventoryPage /></ProtectedRoute>
              } />
              <Route path="ocr" element={
                <ProtectedRoute roles={['admin', 'manager']}><OcrPage /></ProtectedRoute>
              } />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="settings" element={
                <ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
