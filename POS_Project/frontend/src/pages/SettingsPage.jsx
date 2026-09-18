import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { canViewModule, canMaintainModule } from '../utils/permissions';
import Pagination from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';
import LineSettingsTab from '../components/LineSettingsTab';
import DeviceSecurityTab from '../components/DeviceSecurityTab';

const ROLE_LABELS = { admin: 'แอดมิน', manager: 'ผู้จัดการ', cashier: 'แคชเชียร์' };

const MODULE_PERMISSIONS = [
  { key: 'pos', label: '🛒 การขาย POS', desc: 'เข้าใช้งานระบบบันทึกขายหน้าร้าน' },
  { key: 'sales', label: '📜 ประวัติการขาย', desc: 'ค้นหา ตรวจสอบ และออกใบเสร็จย้อนหลัง' },
  { key: 'dashboard', label: '📊 แดชบอร์ด & รายงาน', desc: 'ดูสถิติยอดขาย สินค้าขายดี และรายงานการเงิน' },
  { key: 'products', label: '📦 รายการสินค้า & ราคา', desc: 'สร้าง แก้ไข ตั้งราคา และจัดการหมวดหมู่สินค้า' },
  { key: 'inventory', label: '🏪 คลังสินค้า & สต๊อก', desc: 'รับสินค้าเข้า ปรับสต๊อก และตรวจเช็คสต๊อกคงเหลือ' },
  { key: 'recipes', label: '🧪 สูตรอาหาร & วัตถุดิบ', desc: 'ตั้งค่าสูตรอาหาร การตัดสต๊อก และแปลงหน่วย' },
  { key: 'ocr', label: '🧾 สแกนใบเสร็จ OCR', desc: 'อัปโหลดใบเสร็จเพื่อตรวจจับสินค้าเข้าคลังอัตโนมัติ' },
  { key: 'customers', label: '📋 จัดการลูกค้า & ลูกหนี้', desc: 'จัดการสมาชิก สะสมแต้ม และบันทึกขายเชื่อ/ลูกหนี้' },
  { key: 'settings', label: '⚙️ ตั้งค่าระบบ & สาขา', desc: 'จัดการสาขา ผู้ใช้งาน หมวดหมู่ และสิทธิ์การใช้งาน' },
];

const SYSTEM_UNITS = [
  { value: 'ชิ้น', label: 'ชิ้น (pcs)', desc: 'หน่วยนับหลักนับจำนวน' },
  { value: 'g', label: 'กรัม (g)', desc: 'หน่วยน้ำหนักย่อย' },
  { value: 'kg', label: 'กิโลกรัม (kg)', desc: 'หน่วยน้ำหนักหลัก' },
  { value: 'ml', label: 'มิลลิลิตร (ml)', desc: 'หน่วยปริมาตรย่อย' },
  { value: 'L', label: 'ลิตร (L)', desc: 'หน่วยปริมาตรหลัก' },
  { value: 'oz', label: 'ออนซ์ (oz)', desc: 'หน่วยปริมาตร/น้ำหนัก' },
  { value: 'ถุง', label: 'ถุง (bag)', desc: 'บรรจุภัณฑ์ถุง' },
  { value: 'ขวด', label: 'ขวด (bottle)', desc: 'บรรจุภัณฑ์ขวด' },
  { value: 'กล่อง', label: 'กล่อง (box)', desc: 'บรรจุภัณฑ์กล่อง' },
  { value: 'แพ็ค', label: 'แพ็ค (pack)', desc: 'บรรจุภัณฑ์แพ็ค' },
  { value: 'แก้ว', label: 'แก้ว (cup)', desc: 'หน่วยเครื่องดื่ม' },
  { value: 'กระป๋อง', label: 'กระป๋อง (can)', desc: 'บรรจุภัณฑ์กระป๋อง' },
  { value: 'แผ่น', label: 'แผ่น (sheet)', desc: 'หน่วยนับแผ่น' },
  { value: 'ชุด', label: 'ชุด (set)', desc: 'หน่วยนับเซต/ชุด' },
];

function RoleModal({ role, onClose, onSaved }) {
  const isEdit = !!role?.id;
  const isSystemAdmin = role?.name === 'admin';
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [permissions, setPermissions] = useState(role?.permissions || {
    pos: { view: true, maintain: true },
    sales: { view: false, maintain: false },
    dashboard: { view: false, maintain: false },
    products: { view: false, maintain: false },
    inventory: { view: false, maintain: false },
    recipes: { view: false, maintain: false },
    ocr: { view: false, maintain: false },
    customers: { view: true, maintain: true },
    settings: { view: false, maintain: false }
  });
  const [saving, setSaving] = useState(false);

  const getPermState = (key) => {
    if (permissions?.all) return { view: true, maintain: true };
    const val = permissions?.[key];
    if (val === true) return { view: true, maintain: true };
    if (typeof val === 'object' && val !== null) {
      return { view: Boolean(val.view || val.maintain), maintain: Boolean(val.maintain) };
    }
    return { view: false, maintain: false };
  };

  const handleToggleView = (key) => {
    const curr = getPermState(key);
    const nextView = !curr.view;
    const nextMaintain = nextView ? curr.maintain : false;
    setPermissions(prev => {
      const { all, ...rest } = prev || {};
      return { ...rest, [key]: { view: nextView, maintain: nextMaintain } };
    });
  };

  const handleToggleMaintain = (key) => {
    const curr = getPermState(key);
    const nextMaintain = !curr.maintain;
    const nextView = nextMaintain ? true : curr.view;
    setPermissions(prev => {
      const { all, ...rest } = prev || {};
      return { ...rest, [key]: { view: nextView, maintain: nextMaintain } };
    });
  };

  const handleSelectAllMode = (mode) => {
    if (mode === 'clear') {
      const updated = {};
      MODULE_PERMISSIONS.forEach(m => { updated[m.key] = { view: false, maintain: false }; });
      setPermissions(updated);
    } else if (mode === 'view') {
      const updated = {};
      MODULE_PERMISSIONS.forEach(m => { updated[m.key] = { view: true, maintain: false }; });
      setPermissions(updated);
    } else if (mode === 'full') {
      const updated = { all: true };
      MODULE_PERMISSIONS.forEach(m => { updated[m.key] = { view: true, maintain: true }; });
      setPermissions(updated);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('กรุณาระบุชื่อบทบาท');
    setSaving(true);
    try {
      const payload = { name: name.trim(), description, permissions };
      if (isEdit) {
        await api.put(`/users/roles/${role.id}`, payload);
        toast.success('แก้ไขบทบาทสำเร็จ');
      } else {
        await api.post('/users/roles', payload);
        toast.success('สร้างบทบาทใหม่สำเร็จ');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-900 dark:text-slate-100 rounded-3xl shadow-2xl w-full max-w-xl p-6 max-h-[92vh] flex flex-col overflow-hidden animate-scale-up">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 mb-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
            <span>🎭</span> {isEdit ? 'แก้ไขบทบาท & สิทธิ์การใช้งาน' : 'เพิ่มบทบาทใหม่'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 font-bold text-xl cursor-pointer">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">
              ชื่อบทบาท <span className="text-red-500">*</span>
            </label>
            <input
              required
              disabled={isSystemAdmin}
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field font-bold dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
              placeholder="เช่น พนักงานบัญชี, หัวหน้าคลังสินค้า, บาริสต้า"
            />
            {isSystemAdmin && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">🔒 สงวนชื่อบทบาทระบบสูงสุด (Admin) ไม่สามารถเปลี่ยนชื่อได้</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">รายละเอียด / คำอธิบายบทบาท</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input-field text-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
              placeholder="เช่น มีสิทธิ์ดูรายงานการเงินและออกใบกำกับภาษี"
            />
          </div>

          <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
              <div>
                <label className="block text-xs font-bold text-gray-800 dark:text-slate-100">
                  🔑 กำหนดสิทธิ์การเข้าถึงเมนู (Granular Permissions)
                </label>
                <p className="text-[10px] text-gray-500 dark:text-slate-400">แยกสิทธิ์การดูข้อมูล (View) และการจัดการ/แก้ไข (Maintain) แต่ละหน้า</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => handleSelectAllMode('full')} className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer">
                  จัดการได้ทั้งหมด
                </button>
                <span className="text-gray-300 dark:text-slate-700">|</span>
                <button type="button" onClick={() => handleSelectAllMode('view')} className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline font-bold cursor-pointer">
                  ดูได้อย่างเดียว
                </button>
                <span className="text-gray-300 dark:text-slate-700">|</span>
                <button type="button" onClick={() => handleSelectAllMode('clear')} className="text-[10px] text-gray-400 dark:text-slate-500 hover:underline font-medium cursor-pointer">
                  ล้างทั้งหมด
                </button>
              </div>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto p-1">
              {MODULE_PERMISSIONS.map(m => {
                const { view, maintain } = getPermState(m.key);
                return (
                  <div
                    key={m.key}
                    className={`p-3 rounded-2xl border transition-all ${
                      maintain
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-700/80'
                        : view
                        ? 'bg-sky-50/70 dark:bg-sky-950/60 border-sky-200 dark:border-sky-700/80'
                        : 'bg-gray-50/60 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{m.label}</span>
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-snug">{m.desc}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* View Permission Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleView(m.key)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                            view
                              ? 'bg-sky-600 dark:bg-sky-500 text-white border-sky-600 dark:border-sky-500 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-gray-400'
                          }`}
                        >
                          <span>👁️</span>
                          <span>ดูข้อมูล</span>
                          {view && <span>✓</span>}
                        </button>

                        {/* Maintain Permission Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleMaintain(m.key)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                            maintain
                              ? 'bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-gray-400'
                          }`}
                        >
                          <span>✏️</span>
                          <span>จัดการ/แก้ไข</span>
                          {maintain && <span>✓</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">ยกเลิก</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกบทบาท'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserModal({ user, roles, onClose, onSaved }) {
  const isEdit = !!user?.id;
  const [form, setForm] = useState({ username: '', password: '', full_name: '', pin_code: '', role_id: '', status: 'active' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && roles.length > 0) {
      const matchedRole = roles.find(r => r.name === user.role_name);
      setForm({
        full_name: user.full_name || '',
        password: '',
        pin_code: String(user.pin_code || ''),
        role_id: matchedRole ? matchedRole.id : '',
        status: user.status || 'active',
      });
    }
  }, [roles, isEdit, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.pin_code && form.pin_code.length !== 6) {
      toast.error('กรุณาระบุ PIN Code ให้ครบ 6 หลัก');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const payload = { full_name: form.full_name, pin_code: form.pin_code, role_id: form.role_id, status: form.status };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${user.id}`, payload);
        toast.success('แก้ไขผู้ใช้งานสำเร็จ');
      } else {
        await api.post('/users', form);
        toast.success('เพิ่มผู้ใช้งานสำเร็จ');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{isEdit ? '✏️ แก้ไขผู้ใช้งาน' : '➕ เพิ่มผู้ใช้งาน'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
            <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="input-field" placeholder="ชื่อ-นามสกุล" />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อผู้ใช้ <span className="text-red-500">*</span></label>
              <input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="input-field" placeholder="username" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">{isEdit ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน *'}</label>
            <input type="password" required={!isEdit} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-field" placeholder="รหัสผ่าน" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 flex items-center justify-between">
              <span>🔐 PIN Code (6 หลัก)</span>
              <span className="text-[11px] text-purple-600 font-semibold">ห้ามซ้ำกับผู้ใช้อื่น</span>
            </label>
            <div className="flex justify-center gap-2 sm:gap-2.5 py-2">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <input
                  key={i}
                  type="password"
                  inputMode="numeric"
                  value={form.pin_code[i] || ''}
                  onMouseDown={e => {
                    setForm(prev => ({ ...prev, pin_code: '' }));
                    const parent = e.currentTarget.parentNode;
                    setTimeout(() => {
                      if (parent && parent.children[0]) parent.children[0].focus();
                    }, 0);
                  }}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(-1);
                    const pinArr = (form.pin_code || '').split('');
                    while(pinArr.length < 6) pinArr.push('');
                    pinArr[i] = val;
                    const finalPin = pinArr.join('').slice(0, 6);
                    setForm({ ...form, pin_code: finalPin });
                    if (val && i < 5) {
                      const next = e.target.parentNode.children[i + 1];
                      if (next) next.focus();
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Backspace' && !form.pin_code[i] && i > 0) {
                      const prev = e.target.parentNode.children[i - 1];
                      if (prev) prev.focus();
                    }
                  }}
                  className="w-10 h-13 sm:w-12 sm:h-15 text-center text-2xl font-bold border border-purple-100 rounded-xl transition-all outline-none bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 text-purple-700 shadow-sm hover:border-purple-200"
                  placeholder="-"
                  required
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">บทบาท (ประเภทบัญชี) <span className="text-red-500">*</span></label>
            <select required value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })} className="input-field">
              <option value="">-- เลือกบทบาท --</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>
                  {ROLE_LABELS[r.name] || r.name} {r.description ? `(${r.description})` : ''}
                </option>
              ))}
            </select>
          </div>
          {isEdit && (
            <div>
              <label className="block text-sm font-medium mb-1">สถานะ</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input-field">
                <option value="active">✅ ใช้งาน</option>
                <option value="inactive">🚫 ปิดใช้งาน</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">ยกเลิก</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StoreModal({ store, onClose, onSaved }) {
  const isEdit = !!store?.id;
  const [form, setForm] = useState({ name: '', address: '', phone: '', tax_id: '', promptpay_number: '', promptpay_name: '', vat_rate: 7 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && store) {
      setForm({
        name: store.name || '',
        address: store.address || '',
        phone: store.phone || '',
        tax_id: store.tax_id || '',
        promptpay_number: store.promptpay_number || '',
        promptpay_name: store.promptpay_name || '',
        vat_rate: store.vat_rate ?? 7,
      });
    }
  }, [store, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/stores/${store.id}`, form);
        toast.success('แก้ไขสาขาสำเร็จ');
      } else {
        await api.post('/stores', form);
        toast.success('เพิ่มสาขาสำเร็จ');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{isEdit ? '✏️ แก้ไขสาขา' : '➕ เพิ่มสาขาใหม่'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">ชื่อสาขา <span className="text-red-500">*</span></label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="เช่น สาขาหลัก, สาขา 2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ที่อยู่</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" placeholder="ที่อยู่สาขา" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">เบอร์โทรศัพท์</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="08X-XXX-XXXX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">เลขผู้เสียภาษี</label>
              <input value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">VAT (%)</label>
              <input type="number" step="0.01" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: e.target.value })} className="input-field" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">ยกเลิก</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">💾 บันทึก</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryModal({ category, onClose, onSaved }) {
  const isEdit = !!category?.id;
  const [form, setForm] = useState({
    name: category?.name || '',
    description: category?.description || '',
    sort_order: category?.sort_order ?? 0,
    is_raw_material: Boolean(category?.is_raw_material || category?.name === 'วัตถุดิบ' || (category?.name && category.name.includes('วัตถุดิบ'))),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('กรุณาระบุชื่อหมวดหมู่');
    setSaving(true);
    try {
      const payload = {
        ...form,
        is_raw_material: form.is_raw_material ? 1 : 0
      };
      if (isEdit) {
        await api.put(`/categories/${category.id}`, payload);
        toast.success('แก้ไขหมวดหมู่สำเร็จ');
      } else {
        await api.post('/categories', payload);
        toast.success('เพิ่มหมวดหมู่สำเร็จ');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          {isEdit ? '✏️ แก้ไขหมวดหมู่สินค้า' : '🏷️ เพิ่มหมวดหมู่สินค้าใหม่'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ชื่อหมวดหมู่ *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="เช่น เบเกอรี่, ชาเขียว, กาแฟ, วัตถุดิบ"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">รายละเอียดหมวดหมู่</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="input-field"
              placeholder="รายละเอียดสินค้ากลุ่มนี้ (ถ้ามี)"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ลำดับการแสดงผล (Sort Order)</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
              className="input-field"
            />
          </div>
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-amber-900">
              <input
                type="checkbox"
                checked={form.is_raw_material}
                onChange={e => setForm({ ...form, is_raw_material: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>🌾 เป็นหมวดหมู่วัตถุดิบ (Raw Material Category)</span>
            </label>
            <p className="text-[11px] text-amber-700 pl-6 leading-tight">
              สินค้าในหมวดนี้จะถูกระบุเป็นวัตถุดิบ และล็อกราคาขายเป็น ฿0 อัตโนมัติ (ไม่ต้องตั้งราคาขาย)
            </p>
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">ยกเลิก</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกหมวดหมู่'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryStockModal({ category, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchStock = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/categories/${category.id}/stock`);
        setItems(res.data.data || []);
      } catch (err) {
        try {
          const fallback = await api.get(`/inventory?category_id=${category.id}`);
          setItems(fallback.data.data || []);
        } catch {
          toast.error('ไม่สามารถโหลดข้อมูลสต๊อกสินค้าได้');
        }
      } finally {
        setLoading(false);
      }
    };
    if (category?.id) fetchStock();
  }, [category?.id]);

  const filteredItems = items.filter(item => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.name?.toLowerCase().includes(term) ||
      item.sku?.toLowerCase().includes(term) ||
      item.barcode?.toLowerCase().includes(term)
    );
  });

  const totalQty = items.reduce((acc, i) => acc + (parseFloat(i.quantity) || 0), 0);
  const totalValuation = items.reduce((acc, i) => acc + ((parseFloat(i.quantity) || 0) * (parseFloat(i.cost_price) || 0)), 0);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-900 dark:text-slate-100 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏷️</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-gray-800 dark:text-slate-100">
                  สต๊อกสินค้าในหมวด: <span className="text-indigo-600 dark:text-indigo-400">{category.name}</span>
                </h3>
                {category.is_raw_material && (
                  <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                    🌾 วัตถุดิบสต๊อก
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">
                {category.description || 'รายการสินค้าคงคลังและราคาในหมวดนี้'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 text-lg font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-gray-50/70 dark:bg-slate-800/40 border-b border-gray-100 dark:border-slate-800">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 ค้นหาชื่อสินค้า, SKU, บาร์โค้ด ในหมวดนี้..."
            className="w-full py-2 px-3.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 dark:text-slate-100"
          />
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-gray-400">
              <span className="animate-spin text-3xl inline-block mb-2">⏳</span>
              <p className="text-xs">กำลังโหลดรายการสินค้าคงเหลือ...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-gray-400 dark:text-slate-500">
              <span className="text-4xl inline-block mb-2">📦</span>
              <p className="text-sm font-medium">
                {search ? 'ไม่พบสินค้าที่ตรงกับการค้นหา' : 'ยังไม่มีสินค้าผูกกับหมวดหมู่นี้'}
              </p>
              <p className="text-xs mt-1 text-gray-400">
                คุณสามารถเลือกหมวดหมู่นี้ตอนสร้างหรือแก้ไขสินค้าในหน้า "รายการสินค้า" ได้
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800/80">
              {filteredItems.map((item) => {
                const qty = parseFloat(item.quantity) || 0;
                const reorder = parseFloat(item.reorder_level) || 5;
                const isOutOfStock = qty <= 0;
                const isLowStock = !isOutOfStock && qty <= reorder;

                return (
                  <div
                    key={item.id}
                    className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/80 dark:hover:bg-slate-800/50 rounded-xl transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{item.is_raw_material ? '🌾' : '📦'}</span>
                        <h4 className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">
                          {item.name}
                        </h4>
                        {item.is_raw_material ? (
                          <span className="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold border border-amber-200 dark:border-amber-800/60">
                            วัตถุดิบ
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-slate-400">
                        {item.sku && <span>SKU: <strong className="text-gray-600 dark:text-slate-300 font-mono">{item.sku}</strong></span>}
                        {item.barcode && <span>Barcode: <strong className="text-gray-600 dark:text-slate-300 font-mono">{item.barcode}</strong></span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      {/* Price & Cost */}
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          ทุน: <span className="font-bold text-gray-700 dark:text-slate-200 font-mono">฿{parseFloat(item.cost_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </p>
                        {!item.is_raw_material && (
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            ขาย: <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">฿{parseFloat(item.selling_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </p>
                        )}
                      </div>

                      {/* Stock Quantity Badge */}
                      <div className="text-right min-w-[90px]">
                        <div
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold ${
                            isOutOfStock
                              ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                              : isLowStock
                              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          <span>{isOutOfStock ? '🔴' : isLowStock ? '🟡' : '🟢'}</span>
                          <span>{qty} {item.unit || 'ชิ้น'}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          เตือนต่ำ: {reorder} {item.unit || 'ชิ้น'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Summary */}
        {!loading && items.length > 0 && (
          <div className="p-4 bg-gray-50 dark:bg-slate-800/60 border-t border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 text-gray-600 dark:text-slate-300 font-medium">
              <span>รวมสินค้า: <strong>{items.length}</strong> รายการ</span>
              <span>สต๊อกรวม: <strong>{totalQty.toLocaleString()}</strong></span>
              <span>มูลค่าทุนสต๊อก: <strong>฿{totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-xl font-bold text-gray-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              ปิด
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UnitModal({ unit, onClose, onSaved }) {
  const isEdit = !!unit?.oldValue;
  const [form, setForm] = useState({
    name: unit?.name || '',
    symbol: unit?.symbol || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const symbol = form.symbol.trim();
    if (!name) return toast.error('กรุณาระบุชื่อหน่วยนับ');

    const displayLabel = symbol ? `${name} (${symbol})` : name;
    let savedUnits = [];
    try {
      const existing = localStorage.getItem('pos_custom_units');
      savedUnits = existing ? JSON.parse(existing) : [];
    } catch {}

    if (isEdit) {
      savedUnits = savedUnits.map(u => (u.value === unit.oldValue || u.name === unit.name) ? { value: name, label: displayLabel, name, symbol } : u);
      toast.success(`แก้ไขหน่วยนับ "${displayLabel}" สำเร็จ`);
    } else {
      if (savedUnits.some(u => u.value.toLowerCase() === name.toLowerCase())) {
        return toast.error(`หน่วยนับ "${name}" มีอยู่แล้ว`);
      }
      savedUnits.push({ value: name, label: displayLabel, name, symbol });
      toast.success(`เพิ่มหน่วยนับ "${displayLabel}" สำเร็จ`);
    }

    try {
      localStorage.setItem('pos_custom_units', JSON.stringify(savedUnits));
    } catch {}
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          {isEdit ? '✏️ แก้ไขหน่วยนับ (Custom Unit)' : '📏 เพิ่มหน่วยนับใหม่ (Custom Unit)'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ชื่อหน่วยนับ (ภาษาไทย/อังกฤษ) *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="เช่น ถัง, ปอนด์, ถาด, กะละมัง, cc"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ตัวย่อ/สัญลักษณ์ภาษาอังกฤษ (ถ้ามี)</label>
            <input
              value={form.symbol}
              onChange={e => setForm({ ...form, symbol: e.target.value })}
              className="input-field"
              placeholder="เช่น bucket, lb, tray, cc"
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">ยกเลิก</button>
            <button type="submit" className="btn-primary flex-1">💾 บันทึกหน่วยนับ</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignmentModal({ user, stores, onClose }) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await api.get(`/stores/user/${user.id}`);
      setSelected(res.data.data);
    };
    load();
  }, [user.id]);

  const handleToggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/stores/assign', { user_id: user.id, store_ids: selected });
      toast.success('อัปเดตสิทธิ์การเข้าถึงสำเร็จ');
      onClose();
    } catch { toast.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-bold text-gray-800 mb-1">🔑 กำหนดสาขา</h3>
        <p className="text-sm text-gray-500 mb-4">ผู้ใช้: {user.full_name}</p>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-5 p-1">
          {stores.map(s => (
            <label key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => handleToggle(s.id)} className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
              <span className="text-sm font-medium text-gray-700">{s.name}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">💾 บันทึกสิทธิ์</button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, refreshStores, refreshActiveStore } = useAuth();
  const canMaintain = canMaintainModule(user, 'settings');
  const [activeTab, setActiveTab] = useState('stores_users'); // 'stores_users' | 'categories' | 'units'
  const [storeList, setStoreList] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customUnits, setCustomUnits] = useState([]);

  const [userModal, setUserModal] = useState(null);
  const [roleModal, setRoleModal] = useState(null);
  const [storeModal, setStoreModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(null);
  const [stockModalCategory, setStockModalCategory] = useState(null);
  const [unitModal, setUnitModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState(null);

  useEffect(() => {
    loadStores();
    loadUsers();
    loadRoles();
    loadCategories();
    loadCustomUnits();
  }, []);

  const loadStores = async () => {
    try {
      const res = await api.get('/stores');
      setStoreList(res.data.data);
      refreshStores();
      refreshActiveStore();
    } catch {}
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data);
    } catch {}
  };

  const loadRoles = async () => {
    try {
      const res = await api.get('/users/roles');
      setRoles(res.data.data || []);
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลบทบาทได้');
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data.data || []);
    } catch {}
  };

  const loadCustomUnits = () => {
    try {
      const saved = localStorage.getItem('pos_custom_units');
      setCustomUnits(saved ? JSON.parse(saved) : []);
    } catch { setCustomUnits([]); }
  };

  const handleDeleteUser = async (user) => {
    if (!canMaintain) return toast.error('คุณไม่มีสิทธิ์ลบผู้ใช้งาน');
    try {
      await api.delete(`/users/${user.id}`);
      toast.success('ลบผู้ใช้งานสำเร็จ');
      setDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleDeleteStore = async (store, force = false) => {
    if (!canMaintain) return toast.error('คุณไม่มีสิทธิ์ลบสาขา');
    const confirmMsg = force 
      ? `⚠️ ยืนยันการลบแบบถาวร!\nการลบสาขา "${store.name}" จะทำให้ข้อมูลสินค้า ยอดขาย และประวัติทั้งหมดของสาขานี้ถูกลบออกถาวรและไม่สามารถกู้คืนได้\n\nคุณแน่ใจหรือไม่?`
      : `คุณต้องการลบสาขา "${store.name}" ใช่หรือไม่?\nคำเตือน: การลบจะลบสิทธิ์การเข้าถึงของผู้ใช้ทุกคนในสาขานี้ด้วย`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.delete(`/stores/${store.id}${force ? '?force=true' : ''}`);
      toast.success('ลบสาขาสำเร็จ');
      loadStores();
    } catch (err) {
      const message = err.response?.data?.error?.message || err.response?.data?.message || 'ไม่สามารถลบสาขานี้ได้';
      if (err.response?.status === 400 && !force && (message.includes('สินค้า') || message.includes('ยอดขาย'))) {
        if (window.confirm(`${message}\n\nคุณต้องการลบข้อมูลทั้งหมดในสาขานี้และลบสาขาเลยหรือไม่?`)) {
          handleDeleteStore(store, true);
        }
      } else {
        toast.error(message);
      }
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!canMaintain) return toast.error('คุณไม่มีสิทธิ์ลบหมวดหมู่');
    try {
      await api.delete(`/categories/${cat.id}`);
      toast.success(`ลบหมวดหมู่ "${cat.name}" สำเร็จ`);
      setDeleteCategoryConfirm(null);
      loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'ไม่สามารถลบหมวดหมู่นี้ได้');
    }
  };

  const handleDeleteUnit = (unitToDelete) => {
    if (!canMaintain) return toast.error('คุณไม่มีสิทธิ์ลบหน่วยนับ');
    if (!window.confirm(`คุณต้องการลบหน่วยนับ "${unitToDelete.label || unitToDelete.value}" ใช่หรือไม่?`)) return;
    try {
      const updated = customUnits.filter(u => u.value !== unitToDelete.value);
      localStorage.setItem('pos_custom_units', JSON.stringify(updated));
      setCustomUnits(updated);
      toast.success(`ลบหน่วยนับ "${unitToDelete.label || unitToDelete.value}" สำเร็จ`);
    } catch {
      toast.error('เกิดข้อผิดพลาดในการลบหน่วยนับ');
    }
  };

  const handleDeleteRole = async (role) => {
    if (!canMaintain) return toast.error('คุณไม่มีสิทธิ์ลบบทบาท');
    try {
      await api.delete(`/users/roles/${role.id}`);
      toast.success(`ลบบทบาท "${role.name}" สำเร็จ`);
      setDeleteRoleConfirm(null);
      loadRoles();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'ไม่สามารถลบบทบาทนี้ได้');
    }
  };

  // List pagination (page resets on tab switch)
  const usersPaging = usePagination(users, 10, activeTab);
  const catsPaging = usePagination(categories, 10, activeTab);

  return (
    <div className="p-3 sm:p-4 md:p-6 overflow-y-auto h-[calc(100vh-56px)] pb-24 sm:pb-16">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-slate-100">⚙️ ตั้งค่าระบบ (System Management)</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">จัดการข้อมูลสาขา ผู้ใช้งาน หมวดหมู่สินค้า และหน่วยนับสินค้า</p>
        </div>
      </div>

      {/* Read-Only Notice Banner */}
      {!canMaintain && (
        <div className="mb-4 p-3.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-2xl flex items-center gap-3 text-xs text-amber-800 dark:text-amber-200 font-bold animate-fade-in shadow-xs">
          <span className="text-xl">👁️</span>
          <span>โหมดดูข้อมูลเท่านั้น (View Only): คุณไม่มีสิทธิ์แก้ไข สร้าง หรือลบการตั้งค่าระบบและสาขา</span>
        </div>
      )}

      {/* Tabs - Mobile PWA Optimized */}
      <div className="grid grid-cols-2 sm:flex sm:overflow-x-auto gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 mb-6 scrollbar-none">
        <button
          onClick={() => setActiveTab('stores_users')}
          className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'stores_users'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>🏢</span> <span>สาขา & ผู้ใช้งาน</span>
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'roles'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>🎭</span> <span>บทบาท & สิทธิ์</span> <span className="text-[10px] sm:text-xs opacity-80">({roles.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'categories'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>🏷️</span> <span>หมวดหมู่สินค้า</span> <span className="text-[10px] sm:text-xs opacity-80">({categories.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('units')}
          className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'units'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>📏</span> <span>หน่วยนับสินค้า</span> <span className="text-[10px] sm:text-xs opacity-80">({SYSTEM_UNITS.length + customUnits.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('line')}
          className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'line'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>💬</span> <span>LINE Integration</span>
        </button>
        {user?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('security')}
            className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'security'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>🔒</span> <span>ความปลอดภัย & อุปกรณ์</span>
          </button>
        )}
      </div>

      {/* TAB 1: Stores & Users */}
      {activeTab === 'stores_users' && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Store Management */}
          <div className="w-full lg:flex-1 min-w-0">
            <div className="card">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <div>
                  <h3 className="font-semibold text-lg">🏢 จัดการสาขา</h3>
                  <p className="text-xs text-gray-400">สร้างและตั้งค่าข้อมูลสาขาขาย</p>
                </div>
                {canMaintain && (
                  <button onClick={() => setStoreModal('new')} className="btn-primary !py-2 !px-4 text-sm">
                    + เพิ่มสาขา
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {storeList.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-lg flex-shrink-0">🏪</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 truncate">{s.name}</p>
                      <p className="text-xs text-gray-500 truncate">{s.phone || 'ไม่มีเบอร์โทร'} · VAT {s.vat_rate}%</p>
                    </div>
                    {canMaintain && (
                      <div className="flex gap-2">
                        <button onClick={() => setStoreModal(s)} className="text-sm text-blue-600 hover:underline px-1 font-medium">แก้ไข</button>
                        {storeList.length > 1 && (
                          <button onClick={() => handleDeleteStore(s)} className="text-sm text-red-500 hover:underline px-1 font-medium">ลบ</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {storeList.length === 0 && <p className="text-center py-10 text-gray-400">ยังไม่มีข้อมูลสาขา</p>}
              </div>
            </div>
          </div>

          {/* User Management */}
          <div className="w-full lg:flex-1 min-w-0">
            <div className="card">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <div>
                  <h3 className="font-semibold text-lg">👥 จัดการผู้ใช้งาน</h3>
                  <p className="text-xs text-gray-400">จัดการบัญชีและสิทธิ์การเข้าถึงของผู้ใช้</p>
                </div>
                {canMaintain && (
                  <button onClick={() => setUserModal('new')} className="btn-primary !py-2 !px-4 text-sm">
                    + เพิ่มผู้ใช้
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {usersPaging.paged.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg flex-shrink-0">
                      {u.role_name === 'admin' ? '👑' : u.role_name === 'manager' ? '📊' : '🛒'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{u.full_name}</p>
                      <p className="text-xs text-gray-500 truncate">@{u.username} · {ROLE_LABELS[u.role_name] || u.role_name} · 🔑 ****</p>
                    </div>
                    {canMaintain && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setAssignModal(u)} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded-lg border border-purple-100 font-bold hover:bg-purple-100" title="กำหนดสาขา">🔑 สิทธิ์สาขา</button>
                        <button onClick={() => setUserModal(u)} className="text-xs text-blue-600 hover:underline px-1 py-1">แก้ไข</button>
                        <button onClick={() => setDeleteConfirm(u)} className="text-xs text-red-500 hover:underline px-1 py-1">ลบ</button>
                      </div>
                    )}
                  </div>
                ))}
                {users.length === 0 && <p className="text-sm text-gray-400 text-center py-8">ไม่พบผู้ใช้งาน</p>}
                <Pagination
                  page={usersPaging.page}
                  totalPages={usersPaging.totalPages}
                  perPage={usersPaging.perPage}
                  onPageChange={usersPaging.setPage}
                  onPerPageChange={usersPaging.setPerPage}
                  rangeStart={usersPaging.rangeStart}
                  rangeEnd={usersPaging.rangeEnd}
                  total={usersPaging.total}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Roles & Permissions Management */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <span>🎭</span> จัดการบทบาท & สิทธิ์การใช้งาน (Role & Account Type Management)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  สร้างและกำหนดสิทธิ์การเข้าถึงเมนูต่างๆ ของแต่ละประเภทบัญชีผู้ใช้
                </p>
              </div>
              {canMaintain && (
                <button
                  onClick={() => setRoleModal('new')}
                  className="btn-primary !py-2.5 !px-4 text-sm shadow-md flex items-center gap-1.5"
                >
                  <span>➕</span>
                  <span>เพิ่มบทบาทใหม่</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map(r => {
                const perms = r.permissions || {};
                const activePermsCount = MODULE_PERMISSIONS.filter(m => perms.all || perms[m.key]).length;

                return (
                  <div key={r.id} className="p-4.5 rounded-2xl border border-gray-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">
                            {r.name === 'admin' ? '👑' : r.name === 'manager' ? '📊' : r.name === 'cashier' ? '🛒' : '🎭'}
                          </span>
                          <div>
                            <h4 className="font-bold text-gray-900 dark:text-slate-100 text-base">
                              {ROLE_LABELS[r.name] || r.name}
                            </h4>
                            <p className="text-[10px] text-purple-700 dark:text-purple-300 font-bold bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800/60 px-2.5 py-0.5 rounded-full inline-block">
                              👥 สมาชิก {r.user_count || 0} คน
                            </p>
                          </div>
                        </div>
                      </div>

                      {r.description && (
                        <p className="text-xs text-gray-600 dark:text-slate-300 mb-3 line-clamp-2">{r.description}</p>
                      )}

                      {/* Permissions Tags */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 flex items-center justify-between">
                          <span>สิทธิ์การใช้งาน (Permissions):</span>
                          <span className="text-gray-700 dark:text-slate-200">{perms.all ? 'สิทธิ์ทั้งหมด (All)' : `${activePermsCount} จาก ${MODULE_PERMISSIONS.length} เมนู`}</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {MODULE_PERMISSIONS.map(m => {
                            const isAll = Boolean(perms.all);
                            const mod = perms[m.key];
                            const view = isAll || mod === true || Boolean(mod?.view || mod?.maintain);
                            const maintain = isAll || mod === true || Boolean(mod?.maintain);

                            if (!view && !maintain) {
                              return (
                                <span key={m.key} className="text-[10.5px] px-2 py-0.5 rounded-lg font-medium bg-gray-100 dark:bg-slate-700/50 text-gray-400 dark:text-slate-400 border border-gray-200 dark:border-slate-700/60 line-through opacity-60">
                                  {m.label.split(' ')[1] || m.label}
                                </span>
                              );
                            }

                            return (
                              <span
                                key={m.key}
                                className={`text-[11px] px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 border shadow-xs ${
                                  maintain
                                    ? 'bg-indigo-100 dark:bg-indigo-950/90 text-indigo-900 dark:text-indigo-100 border-indigo-300 dark:border-indigo-700/80'
                                    : 'bg-sky-100 dark:bg-sky-950/90 text-sky-900 dark:text-sky-100 border-sky-300 dark:border-sky-700/80'
                                }`}
                              >
                                <span>{maintain ? '✏️' : '👁️'}</span>
                                <span>{m.label.split(' ')[1] || m.label}</span>
                                <span className={maintain ? "text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300" : "text-[10px] font-extrabold text-sky-700 dark:text-sky-300"}>
                                  ({maintain ? 'จัดการ' : 'ดูเท่านั้น'})
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    {canMaintain && (
                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-slate-700/80">
                        <button
                          onClick={() => setRoleModal(r)}
                          className="px-3 py-1.5 bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-900 rounded-xl text-xs font-bold border border-blue-200 dark:border-blue-800 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          ✏️ แก้ไขสิทธิ์
                        </button>
                        {r.name !== 'admin' && (
                          <button
                            onClick={() => setDeleteRoleConfirm(r)}
                            className="px-3 py-1.5 bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900 rounded-xl text-xs font-bold border border-red-200 dark:border-red-800 transition-all flex items-center gap-1 cursor-pointer"
                          >
                            🗑️ ลบ
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Category Management */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <span>🏷️</span> จัดการหมวดหมู่สินค้า (Category Management)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  สร้าง แก้ไข และเรียงลำดับหมวดหมู่สินค้าในระบบขาย POS
                </p>
              </div>
              {canMaintain && (
                <button
                  onClick={() => setCategoryModal('new')}
                  className="btn-primary !py-2.5 !px-4 text-sm shadow-md"
                >
                  + เพิ่มหมวดหมู่ใหม่
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/70 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">หมวดหมู่</th>
                    <th className="py-3 px-4">รายละเอียด</th>
                    <th className="py-3 px-4 text-center">สินค้าในหมวด</th>
                    <th className="py-3 px-4 text-center">ลำดับแสดง</th>
                    {canMaintain && <th className="py-3 px-4 text-right">จัดการ</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {catsPaging.paged.map((cat) => (
                    <tr
                      key={cat.id}
                      onClick={() => setStockModalCategory(cat)}
                      className="hover:bg-gray-50/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-bold text-gray-800 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-base group-hover:scale-110 transition-transform">🏷️</span>
                          <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline">{cat.name}</span>
                          {(cat.name === 'วัตถุดิบ' || cat.name.includes('วัตถุดิบ') || cat.is_raw_material) && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                              วัตถุดิบสต๊อก
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-500 dark:text-slate-400 max-w-xs truncate">
                        {cat.description || <span className="text-gray-300 dark:text-slate-600 italic">— ไม่มีคำอธิบาย —</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStockModalCategory(cat);
                          }}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold transition-all transform active:scale-95 cursor-pointer shadow-xs ${
                            (cat.product_count || 0) > 0
                              ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/80'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 hover:bg-gray-200'
                          }`}
                          title="คลิกเพื่อดูรายการสินค้าและสต๊อกในหมวดนี้"
                        >
                          📦 {cat.product_count || 0} รายการ
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-xs font-semibold text-gray-600 dark:text-slate-400">
                        {cat.sort_order ?? 0}
                      </td>
                      {canMaintain && (
                        <td className="py-3.5 px-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setCategoryModal(cat)}
                            className="px-3 py-1 bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 hover:bg-blue-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            ✏️ แก้ไข
                          </button>
                          <button
                            onClick={() => setDeleteCategoryConfirm(cat)}
                            className="px-3 py-1 bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-300 hover:bg-red-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            🗑️ ลบ
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={canMaintain ? 5 : 4} className="py-12 text-center text-gray-400">
                        ยังไม่มีหมวดหมู่สินค้าในระบบ กด "+ เพิ่มหมวดหมู่ใหม่" เพื่อสร้าง
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Pagination
                page={catsPaging.page}
                totalPages={catsPaging.totalPages}
                perPage={catsPaging.perPage}
                onPageChange={catsPaging.setPage}
                onPerPageChange={catsPaging.setPerPage}
                rangeStart={catsPaging.rangeStart}
                rangeEnd={catsPaging.rangeEnd}
                total={catsPaging.total}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Weight & Unit Management */}
      {activeTab === 'units' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <span>📏</span> จัดการหน่วยนับและน้ำหนักสินค้า (Weight & Base Unit Management)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  จัดการหน่วยนับมาตรฐานของระบบPOS และเพิ่มหน่วยนับย่อยเพิ่มเติมตามต้องการ
                </p>
              </div>
              {canMaintain && (
                <button
                  onClick={() => setUnitModal('new')}
                  className="btn-primary !py-2.5 !px-4 text-sm shadow-md"
                >
                  + เพิ่มหน่วยนับใหม่
                </button>
              )}
            </div>

            {/* Custom Units Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <span>✏️</span> หน่วยนับเพิ่มเติมที่กำหนดเอง (Custom Base Units)
                  <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                    {customUnits.length} รายการ
                  </span>
                </h4>
              </div>

              {customUnits.length === 0 ? (
                <div className="p-8 border border-dashed border-gray-200 rounded-2xl text-center text-gray-400 bg-gray-50/50">
                  <p className="text-2xl mb-1">📏</p>
                  <p className="text-xs">ยังไม่มีหน่วยนับเพิ่มเติมที่กำหนดเอง</p>
                  {canMaintain && (
                    <button
                      onClick={() => setUnitModal('new')}
                      className="mt-3 text-xs font-bold text-indigo-600 hover:underline"
                    >
                      + คลิกที่นี่เพื่อเพิ่มหน่วยนับใหม่ (เช่น ถัง, ปอนด์, ถาด, cc)
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {customUnits.map((u, idx) => (
                    <div key={idx} className="p-3.5 border border-indigo-100 bg-indigo-50/30 rounded-2xl flex items-center justify-between shadow-sm hover:border-indigo-300 transition-all">
                      <div>
                        <p className="font-bold text-sm text-gray-800">{u.label || u.value}</p>
                        <p className="text-[11px] text-gray-400 font-mono">value: {u.value}</p>
                      </div>
                      {canMaintain && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setUnitModal({ oldValue: u.value, name: u.name || u.value, symbol: u.symbol || '' })}
                            className="p-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="แก้ไข"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(u)}
                            className="p-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg"
                            title="ลบ"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* System Default Units Section */}
            <div>
              <div className="flex items-center justify-between mb-3 border-t pt-5 border-gray-100">
                <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <span>🔒</span> หน่วยนับมาตรฐานของระบบ (System Standard Base Units)
                  <span className="text-xs bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-full">
                    {SYSTEM_UNITS.length} รายการมาตรฐาน
                  </span>
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {SYSTEM_UNITS.map((su) => (
                  <div key={su.value} className="p-3.5 border border-gray-100 bg-gray-50/80 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-gray-800">{su.label}</p>
                      <p className="text-[11px] text-gray-400">{su.desc}</p>
                    </div>
                    <span className="text-[10px] bg-gray-200/80 text-gray-600 font-semibold px-2 py-1 rounded-lg flex items-center gap-1">
                      🔒 ระบบ
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: LINE Integration */}
      {activeTab === 'line' && (
        <LineSettingsTab canMaintain={canMaintain} />
      )}

      {/* TAB 6: Device Security & Whitelist (Admin Only) */}
      {activeTab === 'security' && user?.role === 'admin' && (
        <DeviceSecurityTab canMaintain={canMaintain} />
      )}

      {/* MODALS */}
      {userModal && <UserModal user={userModal === 'new' ? null : userModal} roles={roles} onClose={() => setUserModal(null)} onSaved={() => { setUserModal(null); loadUsers(); }} />}
      {roleModal && <RoleModal role={roleModal === 'new' ? null : roleModal} onClose={() => setRoleModal(null)} onSaved={() => { setRoleModal(null); loadRoles(); }} />}
      {storeModal && <StoreModal store={storeModal === 'new' ? null : storeModal} onClose={() => setStoreModal(null)} onSaved={() => { setStoreModal(null); loadStores(); }} />}
      {categoryModal && <CategoryModal category={categoryModal === 'new' ? null : categoryModal} onClose={() => setCategoryModal(null)} onSaved={() => { setCategoryModal(null); loadCategories(); }} />}
      {stockModalCategory && <CategoryStockModal category={stockModalCategory} onClose={() => setStockModalCategory(null)} />}
      {unitModal && <UnitModal unit={unitModal === 'new' ? null : unitModal} onClose={() => setUnitModal(null)} onSaved={() => { setUnitModal(null); loadCustomUnits(); }} />}
      {assignModal && <AssignmentModal user={assignModal} stores={storeList} onClose={() => setAssignModal(null)} />}

      {/* Delete User Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <h3 className="font-bold text-gray-800 mb-1">ยืนยันการลบผู้ใช้</h3>
            <p className="text-sm text-gray-500 mb-5">ต้องการลบผู้ใช้ <strong>{deleteConfirm.full_name}</strong> ใช่หรือไม่?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost flex-1">ยกเลิก</button>
              <button onClick={() => handleDeleteUser(deleteConfirm)} className="btn-danger flex-1">ลบ</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Role Confirm */}
      {deleteRoleConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scale-up">
            <p className="text-4xl mb-3">🗑️</p>
            <h3 className="font-bold text-gray-800 mb-1">ยืนยันการลบบทบาท</h3>
            <p className="text-sm text-gray-600 mb-2">
              ต้องการลบบทบาท <strong>"{ROLE_LABELS[deleteRoleConfirm.name] || deleteRoleConfirm.name}"</strong> ใช่หรือไม่?
            </p>
            {(deleteRoleConfirm.user_count || 0) > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mb-4">
                ⚠️ บทบาทนี้มีผู้ใช้งานผูกอยู่ <strong>{deleteRoleConfirm.user_count} คน</strong> กรุณาย้ายผู้ใช้งานไปบทบาทอื่นก่อนลบ
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setDeleteRoleConfirm(null)} className="btn-ghost flex-1">ยกเลิก</button>
              <button
                onClick={() => handleDeleteRole(deleteRoleConfirm)}
                disabled={(deleteRoleConfirm.user_count || 0) > 0}
                className="btn-danger flex-1 disabled:opacity-40"
              >
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirm */}
      {deleteCategoryConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <h3 className="font-bold text-gray-800 mb-1">ยืนยันการลบหมวดหมู่</h3>
            <p className="text-sm text-gray-600 mb-2">
              ต้องการลบหมวดหมู่ <strong>"{deleteCategoryConfirm.name}"</strong> ใช่หรือไม่?
            </p>
            {(deleteCategoryConfirm.product_count || 0) > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mb-4">
                ⚠️ หมวดหมู่นี้มีสินค้าผูกอยู่ <strong>{deleteCategoryConfirm.product_count} รายการ</strong> กรุณาย้ายหมวดหมู่ของสินค้าก่อนทำการลบ
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setDeleteCategoryConfirm(null)} className="btn-ghost flex-1">ยกเลิก</button>
              <button
                onClick={() => handleDeleteCategory(deleteCategoryConfirm)}
                className="btn-danger flex-1"
              >
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
