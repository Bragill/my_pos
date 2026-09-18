import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { biometricsAPI } from '../services/api';
import {
  isBiometricsAvailable,
  startBiometricRegistration
} from '../utils/webAuthnHelper';
import {
  getDeviceMacAddress,
  detectClientDeviceName
} from '../utils/deviceFingerprint';

export default function BiometricsProfileModal({ isOpen, onClose, user }) {
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [supported, setSupported] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const currentMac = getDeviceMacAddress();
  const currentDeviceName = detectClientDeviceName();

  useEffect(() => {
    if (isOpen) {
      checkSupport();
      loadCredentials();
    }
  }, [isOpen]);

  const checkSupport = async () => {
    const isAvailable = await isBiometricsAvailable();
    setSupported(isAvailable);
  };

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const res = await biometricsAPI.getMyCredentials();
      if (res.data?.success) {
        setCredentials(res.data.credentials || []);
      }
    } catch (err) {
      console.warn('Failed to load biometric credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setRegistering(true);
    try {
      // 1. Get registration challenge and options from backend
      const optionsRes = await biometricsAPI.getRegisterOptions();
      if (!optionsRes.data?.success || !optionsRes.data?.data) {
        throw new Error(optionsRes.data?.message || 'ไม่สามารถรับข้อมูลเริ่มต้นการลงทะเบียนชีวมาตรได้');
      }

      // 2. Prompt user with platform authenticator (Face ID / Fingerprint)
      const credData = await startBiometricRegistration(optionsRes.data.data);

      // 3. Send back public key & credential to save in D1
      const verifyRes = await biometricsAPI.verifyRegistration({
        credential_id: credData.credential_id,
        public_key: credData.public_key,
        algorithm: 'ES256',
        device_name: currentDeviceName,
        mac_address: currentMac
      });

      if (verifyRes.data?.success) {
        toast.success('ลงทะเบียน Face ID / ลายนิ้วมือ สำหรับเครื่องนี้สำเร็จ! 🎉');
        await loadCredentials();
      } else {
        throw new Error(verifyRes.data?.message || 'ไม่สามารถบันทึกข้อมูลชีวมาตรได้');
      }
    } catch (err) {
      console.error('Biometric registration error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการลงทะเบียนชีวมาตร');
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id, deviceName) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการเพิกถอนสิทธิ์ชีวมาตรของ "${deviceName || 'อุปกรณ์นี้'}"?`)) {
      return;
    }
    setDeletingId(id);
    try {
      await biometricsAPI.deleteCredential(id);
      toast.success('เพิกถอนสิทธิ์เรียบร้อยแล้ว');
      await loadCredentials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'ไม่สามารถลบข้อมูลได้');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  const isCurrentDeviceRegistered = credentials.some(
    (c) => c.mac_address && c.mac_address === currentMac
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div
          className="px-6 py-5 text-white flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-xl shadow-inner">
              🧬
            </div>
            <div>
              <h3 className="text-lg font-bold leading-tight">จัดการ Face ID / ลายนิ้วมือ</h3>
              <p className="text-xs text-indigo-200">
                เข้าสู่ระบบ 2 ขั้นตอน (2FA) รวดเร็วและปลอดภัยสำหรับผู้จัดการ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Current Device Status Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  อุปกรณ์ปัจจุบันของคุณ
                </span>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <span>💻</span>
                  <span>{currentDeviceName}</span>
                </h4>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  {currentMac}
                </p>
              </div>

              {/* Support Badge */}
              <div className="flex-shrink-0">
                {supported === null ? (
                  <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-gray-100 text-gray-500">
                    กำลังตรวจสอบ...
                  </span>
                ) : supported ? (
                  <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    พร้อมใช้งาน Face ID
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    ⚠️ ไม่รองรับชีวมาตร
                  </span>
                )}
              </div>
            </div>

            {/* Registration Action */}
            <div className="pt-2 border-t border-slate-200/60">
              {supported ? (
                isCurrentDeviceRegistered ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                      <span>✓</span> เครื่องนี้ลงทะเบียน Face ID / ลายนิ้วมือ เรียบร้อยแล้ว
                    </div>
                    <button
                      onClick={handleRegister}
                      disabled={registering}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                      {registering ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนซ้ำ'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleRegister}
                    disabled={registering}
                    className="w-full py-2.5 px-4 rounded-xl text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                  >
                    {registering ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>กำลังเชื่อมต่อฮาร์ดแวร์ชีวมาตร...</span>
                      </>
                    ) : (
                      <>
                        <span>➕</span>
                        <span>เปิดใช้งาน Face ID / ลายนิ้วมือ บนเครื่องนี้</span>
                      </>
                    )}
                  </button>
                )
              ) : (
                <p className="text-xs text-slate-500 bg-amber-50/60 border border-amber-200/50 rounded-xl p-2.5">
                  💡 เบราว์เซอร์หรืออุปกรณ์นี้ไม่พบโมดูล Face ID/ลายนิ้วมือ (WebAuthn Platform Authenticator) หากใช้อุปกรณ์ที่มี Touch ID/Face ID กรุณาเปิดผ่าน Safari หรือ Chrome ที่รองรับ
                </p>
              )}
            </div>
          </div>

          {/* Enrolled Devices Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                รายการอุปกรณ์ที่ลงทะเบียนไว้ ({credentials.length})
              </h4>
              <button
                onClick={loadCredentials}
                disabled={loading}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
              </button>
            </div>

            {loading && credentials.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                กำลังดึงข้อมูลอุปกรณ์ที่ลงทะเบียน...
              </div>
            ) : credentials.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <div className="text-3xl mb-1">🔐</div>
                <p className="text-xs font-medium text-slate-600">ยังไม่มีอุปกรณ์ที่ลงทะเบียน</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  กดปุ่มด้านบนเพื่อลงทะเบียนอุปกรณ์เครื่องนี้เป็นเครื่องแรก
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {credentials.map((cred) => {
                  const isThisDevice = cred.mac_address === currentMac;
                  return (
                    <div
                      key={cred.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isThisDevice
                          ? 'bg-indigo-50/40 border-indigo-200 shadow-sm'
                          : 'bg-white border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {cred.device_name?.toLowerCase().includes('phone')
                              ? '📱'
                              : cred.device_name?.toLowerCase().includes('pad')
                              ? '📋'
                              : '💻'}
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {cred.device_name || 'อุปกรณ์พกพา'}
                          </span>
                          {isThisDevice && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-100 text-indigo-700">
                              เครื่องนี้
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                          <span>ลงทะเบียน: {formatDate(cred.created_at)}</span>
                          <span>
                            ใช้งานล่าสุด: {cred.last_used_at ? formatDate(cred.last_used_at) : 'ยังไม่เคย'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(cred.id, cred.device_name)}
                        disabled={deletingId === cred.id}
                        className="px-2.5 py-1.5 text-xs text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-xl transition-all disabled:opacity-50 flex-shrink-0 cursor-pointer"
                        title="เพิกถอนสิทธิ์"
                      >
                        {deletingId === cred.id ? 'กำลังลบ...' : 'ลบสิทธิ์'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>ความปลอดภัยระดับฮาร์ดแวร์ (Enclave)</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
