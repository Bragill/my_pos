import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS = { admin: '👑 แอดมิน', manager: '📊 ผู้จัดการ', cashier: '🛒 แคชเชียร์' };
const EMPTY_USER = { username: '', password: '', full_name: '', pin_code: '', role_id: '', status: 'active' };

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
            <label className="block text-sm font-medium mb-3 text-gray-700 flex items-center gap-2">
              <span>🔐 PIN Code (4 หลัก)</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="flex justify-center gap-4 py-2">
              {[0, 1, 2, 3].map(i => (
                <input
                  key={i}
                  type="password"
                  inputMode="numeric"
                  value={form.pin_code[i] || ''}
                  onMouseDown={e => {
                    setForm(prev => ({ ...prev, pin_code: '' }));
                    // Use setTimeout to ensure focus happens after the click event finishes
                    const parent = e.currentTarget.parentNode;
                    setTimeout(() => {
                      if (parent && parent.children[0]) parent.children[0].focus();
                    }, 0);
                  }}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(-1);
                    const pinArr = (form.pin_code || '').split('');
                    while(pinArr.length < 4) pinArr.push('');
                    pinArr[i] = val;
                    const finalPin = pinArr.join('').slice(0, 4);
                    setForm({ ...form, pin_code: finalPin });
                    
                    if (val && i < 3) {
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
                  className="w-14 h-16 text-center text-3xl font-bold border border-purple-100 rounded-2xl transition-all outline-none bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 text-purple-700 shadow-sm hover:border-purple-200"
                  placeholder="-"
                  required
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">บทบาท <span className="text-red-500">*</span></label>
            <select required value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })} className="input-field">
              <option value="">-- เลือกบทบาท --</option>
              {roles.map(r => <option key={r.id} value={r.id}>{ROLE_LABELS[r.name] || r.name}</option>)}
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
        vat_rate: store.vat_rate ?? 7
      });
    }
  }, [isEdit, store]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, vat_rate: parseFloat(form.vat_rate) || 0 };
      if (isEdit) await api.put(`/stores/${store.id}`, payload);
      else await api.post('/stores', payload);
      toast.success(isEdit ? 'แก้ไขสาขาสำเร็จ' : 'เพิ่มสาขาสำเร็จ');
      onSaved();
    } catch (err) { 
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด'); 
    }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{isEdit ? '✏️ แก้ไขสาขา' : '➕ เพิ่มสาขาใหม่'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">ชื่อสาขา <span className="text-red-500">*</span></label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">เบอร์โทรศัพท์</label>
            <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">PromptPay Number</label>
            <input value={form.promptpay_number || ''} onChange={e => setForm({ ...form, promptpay_number: e.target.value })} className="input-field" placeholder="08x-xxx-xxxx / ID บัตรประชาชน" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ชื่อบัญชีพร้อมเพย์</label>
            <input value={form.promptpay_name || ''} onChange={e => setForm({ ...form, promptpay_name: e.target.value })} className="input-field" placeholder="เช่น นาย สมชาย ใจดี" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ที่อยู่</label>
            <textarea value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">เลขผู้เสียภาษี</label>
              <input value={form.tax_id || ''} onChange={e => setForm({ ...form, tax_id: e.target.value })} className="input-field" />
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
  const { refreshStores, refreshActiveStore } = useAuth();
  const [storeList, setStoreList] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [userModal, setUserModal] = useState(null);
  const [storeModal, setStoreModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    loadStores();
    loadUsers();
    loadRoles();
  }, []);

  const loadStores = async () => {
    try {
      const res = await api.get('/stores');
      setStoreList(res.data.data);
      refreshStores(); // Update global context/localStorage
      refreshActiveStore(); // Force refresh current store details (VAT etc)
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
      setRoles(res.data.data);
    } catch {}
  };

  const handleDeleteUser = async (user) => {
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

  return (
    <div className="p-4 md:p-6 overflow-y-auto h-[calc(100vh-56px)]">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">⚙️ ตั้งค่าระบบ (ผู้ดูแลระบบ)</h1>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* LEFT — Store Management */}
        <div className="w-full lg:flex-1 min-w-0">
          <div className="card">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-semibold text-lg">🏢 จัดการสาขา</h3>
              <button onClick={() => setStoreModal('new')} className="btn-primary !py-2 !px-4 text-sm">
                + เพิ่มสาขา
              </button>
            </div>
            <div className="space-y-2">
              {storeList.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-lg flex-shrink-0">🏪</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 truncate">{s.name}</p>
                    <p className="text-xs text-gray-500 truncate">{s.phone || 'ไม่มีเบอร์โทร'} · VAT {s.vat_rate}%</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setStoreModal(s)} className="text-sm text-blue-600 hover:underline px-1 font-medium">แก้ไข</button>
                    {storeList.length > 1 && (
                      <button onClick={() => handleDeleteStore(s)} className="text-sm text-red-500 hover:underline px-1 font-medium">ลบ</button>
                    )}
                  </div>
                </div>
              ))}
              {storeList.length === 0 && <p className="text-center py-10 text-gray-400">ยังไม่มีข้อมูลสาขา</p>}
            </div>
          </div>
        </div>

        {/* RIGHT — User Management */}
        <div className="w-full lg:flex-1 min-w-0">
          <div className="card">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-semibold text-lg">👥 จัดการผู้ใช้งาน</h3>
              <button onClick={() => setUserModal('new')} className="btn-primary !py-2 !px-4 text-sm">
                + เพิ่มผู้ใช้
              </button>
            </div>
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg flex-shrink-0">
                    {u.role_name === 'admin' ? '👑' : u.role_name === 'manager' ? '📊' : '🛒'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{u.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">@{u.username} · {ROLE_LABELS[u.role_name] || u.role_name} · 🔑 ****</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setAssignModal(u)} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded-lg border border-purple-100 font-bold hover:bg-purple-100" title="กำหนดสาขา">🔑 สิทธิ์สาขา</button>
                    <button onClick={() => setUserModal(u)} className="text-xs text-blue-600 hover:underline px-1 py-1">แก้ไข</button>
                    <button onClick={() => setDeleteConfirm(u)} className="text-xs text-red-500 hover:underline px-1 py-1">ลบ</button>
                  </div>
                </div>
              ))}
              {users.length === 0 && <p className="text-sm text-gray-400 text-center py-8">ไม่พบผู้ใช้งาน</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {userModal && <UserModal user={userModal === 'new' ? null : userModal} roles={roles} onClose={() => setUserModal(null)} onSaved={() => { setUserModal(null); loadUsers(); }} />}
      {storeModal && <StoreModal store={storeModal === 'new' ? null : storeModal} onClose={() => setStoreModal(null)} onSaved={() => { setStoreModal(null); loadStores(); }} />}
      {assignModal && <AssignmentModal user={assignModal} stores={storeList} onClose={() => setAssignModal(null)} />}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <h3 className="font-bold text-gray-800 mb-1">ยืนยันการลบ</h3>
            <p className="text-sm text-gray-500 mb-5">ต้องการลบผู้ใช้ <strong>{deleteConfirm.full_name}</strong> ใช่หรือไม่?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost flex-1">ยกเลิก</button>
              <button onClick={() => handleDeleteUser(deleteConfirm)} className="btn-danger flex-1">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
