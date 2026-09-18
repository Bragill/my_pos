import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NetworkProvider } from './contexts/NetworkContext';
import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from "./pages/InventoryPage";
import SalesHistoryPage from "./pages/SalesHistoryPage";
import CustomersPage from "./pages/CustomersPage";
import SettingsPage from './pages/SettingsPage';
import OcrPage from './pages/OcrPage';
import RecipesPage from './pages/RecipesPage';
import ApprovalsPage from './pages/ApprovalsPage';
import Layout from './components/Layout';
import InstallPWA from './components/InstallPWA';
import { canViewModule } from './utils/permissions';

function ProtectedRoute({ children, roles, moduleKey }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'admin') return children;
  if (user.permissions && Object.keys(user.permissions).length > 0) {
    if (moduleKey && !canViewModule(user, moduleKey)) return <Navigate to="/pos" />;
  } else if (roles && !roles.includes(user.role)) {
    return <Navigate to="/pos" />;
  }
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <AuthProvider>
          <CartProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
              <InstallPWA />
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="/pos" />} />
                  <Route path="pos" element={<ProtectedRoute moduleKey="pos" roles={['admin', 'manager', 'cashier']}><POSPage /></ProtectedRoute>} />
                  <Route path="dashboard" element={
                    <ProtectedRoute moduleKey="dashboard" roles={['admin', 'manager']}><DashboardPage /></ProtectedRoute>
                  } />
                  <Route path="products" element={
                    <ProtectedRoute moduleKey="products" roles={['admin', 'manager']}><ProductsPage /></ProtectedRoute>
                  } />
                  <Route path="inventory" element={
                    <ProtectedRoute moduleKey="inventory" roles={['admin', 'manager']}><InventoryPage /></ProtectedRoute>
                  } />
                  <Route path="recipes" element={
                    <ProtectedRoute moduleKey="recipes" roles={['admin', 'manager']}><RecipesPage /></ProtectedRoute>
                  } />
                  <Route path="approvals" element={
                    <ProtectedRoute moduleKey="approvals" roles={['admin', 'manager']}><ApprovalsPage /></ProtectedRoute>
                  } />
                  <Route path="sales" element={
                    <ProtectedRoute moduleKey="sales" roles={['admin', 'manager', 'cashier']}><SalesHistoryPage /></ProtectedRoute>
                  } />
                  <Route path="ocr" element={
                    <ProtectedRoute moduleKey="ocr" roles={['admin', 'manager']}><OcrPage /></ProtectedRoute>
                  } />
                  <Route path="customers" element={<ProtectedRoute moduleKey="customers"><CustomersPage /></ProtectedRoute>} />
                  <Route path="settings" element={
                    <ProtectedRoute moduleKey="settings" roles={['admin']}><SettingsPage /></ProtectedRoute>
                  } />
                </Route>
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </AuthProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

export default App;
