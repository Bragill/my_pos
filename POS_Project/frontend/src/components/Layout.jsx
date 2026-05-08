import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import api from '../services/api';
import toast from 'react-hot-toast';

const navItems = [
  { path: '/pos', label: 'หน้าขาย', icon: '🛒', roles: ['admin', 'manager', 'cashier'] },
  { path: '/sales', label: 'ประวัติการขาย', icon: '📜', roles: ['admin', 'manager', 'cashier'] },
  { path: '/dashboard', label: 'แดชบอร์ด', icon: '📊', roles: ['admin', 'manager'] },
  { path: '/products', label: 'สินค้า', icon: '📦', roles: ['admin', 'manager'] },
  { path: '/inventory', label: 'สต๊อก', icon: '🏪', roles: ['admin', 'manager'] },
  { path: '/ocr', label: 'OCR ใบเสร็จ', icon: '🧾', roles: ['admin', 'manager'] },
  { path: '/customers', label: 'ลูกหนี้', icon: '📋', roles: ['admin', 'manager', 'cashier'] },
  { path: '/settings', label: 'ตั้งค่า', icon: '⚙️', roles: ['admin'] },
];

const ROLE_LABEL = { admin: '👑 แอดมิน', manager: '📊 ผู้จัดการ', cashier: '🛒 แคชเชียร์' };

function StoreSwitcher({ stores, activeStoreId, onSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const activeStore = stores.find(s => s.id === activeStoreId);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!activeStore && stores.length === 0) return null;

  return (
    <div ref={ref} className="relative ml-2">
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-all text-white max-w-[150px] sm:max-w-[200px]"
      >
        <span className="text-lg">🏪</span>
        <span className="text-xs font-bold truncate">{activeStore?.name || 'เลือกสาขา'}</span>
        <span className="text-[10px] opacity-60">{open ? '▲' : '▼'}</span>
      </button>

      {open && stores.length >= 1 && (
        <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-purple-100 overflow-hidden z-50 animate-fade-in">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            สลับสาขา
          </div>
          <div className="max-h-60 overflow-y-auto">
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => { onSwitch(s.id); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors text-left ${
                  s.id === activeStoreId ? 'bg-purple-50 text-purple-700 font-bold' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{s.name}</span>
                {s.id === activeStoreId && <span className="text-purple-500">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({ full_name: '', current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openEdit = () => {
    setForm({ full_name: user?.fullName || '', current_password: '', new_password: '', confirm_password: '' });
    setOpen(false);
    setEditModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.new_password && form.new_password !== form.confirm_password) {
      toast.error('รหัสผ่านใหม่ไม่ตรงกัน'); return;
    }
    setSaving(true);
    try {
      const payload = { full_name: form.full_name };
      if (form.new_password) { payload.password = form.new_password; payload.current_password = form.current_password; }
      await api.put('/users/me', payload);
      toast.success('อัปเดตข้อมูลสำเร็จ');
      setEditModal(false);
      // Update local user display name
      if (user) user.fullName = form.full_name;
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  };

  const initials = (user?.fullName || 'U').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Avatar Button & Dropdown Container */}
      <div 
        ref={ref} 
        className="relative ml-2 flex-shrink-0"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button 
          className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-white/20 transition-all cursor-pointer h-12"
        >
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs text-white font-semibold leading-tight">{user?.fullName}</span>
            <span className="text-[10px] text-white/60 leading-tight uppercase tracking-wider">{ROLE_LABEL[user?.role] || user?.role}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
            {initials}
          </div>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-[90%] pt-2 w-56 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-purple-100 overflow-hidden">
              {/* User info header */}
              <div className="px-4 py-3 border-b border-gray-100" style={{ background: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-sm">{initials}</div>
                  <div>
                    <p className="text-white text-sm font-semibold leading-tight">{user?.fullName}</p>
                    <p className="text-white/70 text-[10px] uppercase">{ROLE_LABEL[user?.role] || user?.role}</p>
                  </div>
                </div>
              </div>
              {/* Menu items */}
              <button onClick={openEdit}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 transition-colors text-left">
                <span className="text-base">✏️</span> แก้ไขข้อมูลส่วนตัว
              </button>
              <div className="border-t border-gray-100" />
              <button onClick={() => { setOpen(false); onLogout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
                <span className="text-base">🚪</span> ออกจากระบบ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-scale-up">
            <h3 className="text-lg font-bold text-gray-800 mb-4">✏️ แก้ไขข้อมูลส่วนตัว</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">ชื่อ-นามสกุล</label>
                <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                  className="input-field" placeholder="ชื่อ-นามสกุล" />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400 mb-2">เปลี่ยนรหัสผ่าน (เว้นว่างถ้าไม่ต้องการเปลี่ยน)</p>
                <div className="space-y-2">
                  <input type="password" value={form.current_password} onChange={e => setForm({ ...form, current_password: e.target.value })}
                    className="input-field" placeholder="รหัสผ่านปัจจุบัน" />
                  <input type="password" value={form.new_password} onChange={e => setForm({ ...form, new_password: e.target.value })}
                    className="input-field" placeholder="รหัสผ่านใหม่" />
                  <input type="password" value={form.confirm_password} onChange={e => setForm({ ...form, confirm_password: e.target.value })}
                    className="input-field" placeholder="ยืนยันรหัสผ่านใหม่" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditModal(false)} className="btn-ghost flex-1">ยกเลิก</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function HamburgerMenu({ navItems, user, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  // Close when clicking outside
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close when route changes
  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  const initials = (user?.fullName || 'U').slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 flex flex-col items-center justify-center gap-1.5 rounded-xl hover:bg-white/20 transition-all cursor-pointer"
      >
        <div className={`w-6 h-0.5 bg-white rounded-full transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-2' : ''}`} />
        <div className={`w-6 h-0.5 bg-white rounded-full transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
        <div className={`w-6 h-0.5 bg-white rounded-full transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-2' : ''}`} />
      </button>

      {/* Side Drawer / Overlay Menu */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          
          {/* Menu Panel */}
          <div className="relative w-72 h-full bg-white shadow-2xl flex flex-col animate-slide-right">
            {/* Header with User Info */}
            <div 
              className="p-6 pb-8 text-white relative overflow-hidden pt-[calc(1.5rem+env(safe-area-inset-top))]"
              style={{ background: 'linear-gradient(135deg, #EB0000 0%, #95008A 50%, #3300FC 100%)' }}
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-xl font-bold">
                    {initials}
                  </div>
                  <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-lg">✕</button>
                </div>
                <h2 className="text-xl font-bold">{user?.fullName}</h2>
                <p className="text-white/70 text-sm font-medium">{ROLE_LABEL[user?.role] || user?.role}</p>
              </div>
              {/* Decorative circle */}
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 py-4 overflow-y-auto px-3 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-medium ` +
                    (isActive 
                      ? 'bg-purple-50 text-purple-700 shadow-sm border border-purple-100' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')
                  }
                >
                  <span className="text-xl grayscale-[0.5] group-hover:grayscale-0">{item.icon}</span>
                  <span className="text-sm">{item.label}</span>
                  {location.pathname === item.path && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500" />
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Footer / Logout */}
            <div className="p-4 border-t border-gray-100">
              <button 
                onClick={onLogout}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-red-500 font-bold hover:bg-red-50 transition-all text-left"
              >
                <span className="text-xl">🚪</span>
                <span className="text-sm">ออกจากระบบ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, stores, activeStoreId, switchStore } = useAuth();
  const { cart, clearCart } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => { 
    if (cart.items.length > 0) {
      const confirmLogout = window.confirm("คุณยังมีสินค้าค้างอยู่ในตะกร้า ต้องการออกจากระบบและล้างตะกร้าสินค้าหรือไม่?");
      if (!confirmLogout) return;
    }
    clearCart();
    logout(); 
    navigate('/login'); 
  };
  const visibleNav = navItems.filter((item) => item.roles.includes(user?.role));

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'linear-gradient(160deg,#fff0f0 0%,#fdf0ff 50%,#f0f0ff 100%)' }}>
      {/* Navbar */}
      <nav className="shadow-md px-4 py-2 flex items-center justify-between sticky top-0 z-40 min-h-[56px] h-[calc(56px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]"
        style={{ background: '#EB0000', backgroundImage: 'linear-gradient(to left, #3300FC, #95008A, #EB0000)' }}>
        
        <div className="flex items-center gap-3">
          {/* Hamburger Menu */}
          <HamburgerMenu navItems={visibleNav} user={user} onLogout={handleLogout} />
          
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-white font-bold text-lg tracking-wide hidden xs:block">🛒 POS</span>
          </div>

          {/* Store Switcher */}
          <StoreSwitcher stores={stores} activeStoreId={activeStoreId} onSwitch={switchStore} />
        </div>

        {/* User Menu Dropdown */}
        <UserMenu user={user} onLogout={handleLogout} />
      </nav>

      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
