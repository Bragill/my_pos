import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { securityAPI, biometricsAPI } from '../services/api';
import { getDeviceMacAddress, detectBotSignals } from '../utils/deviceFingerprint';
import { isBiometricsAvailable, startBiometricAuthentication } from '../utils/webAuthnHelper';
import toast from 'react-hot-toast';

// ─── Step constants ────────────────────────────────────────────────
const STEP_AUTH = 'auth';       // PIN / password entry
const STEP_STORE = 'store';     // Store selection
const LOCK_STORAGE_KEY = 'pos_device_lock_info';

function getStoredLockInfo() {
  try {
    const raw = localStorage.getItem(LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    if (parsed.status === 'LOCKED_PERMANENT' || parsed.status === 'BLACKLISTED') {
      return {
        locked: true,
        permanent: true,
        remainingSeconds: 0,
        lockUntil: null,
        status: parsed.status,
        reason: parsed.reason || ''
      };
    }

    if (parsed.status === 'LOCKED_TEMP' && parsed.lock_until) {
      let str = String(parsed.lock_until).trim();
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
        str = str.replace(' ', 'T') + 'Z';
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
        str = str + 'Z';
      }
      const lockUntil = new Date(str).getTime();
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
      if (remaining > 0) {
        return {
          locked: true,
          permanent: false,
          remainingSeconds: remaining,
          lockUntil: str,
          status: 'LOCKED_TEMP',
          reason: parsed.reason || 'คุณพยายามเข้าสู่ระบบผิดพลาดเกินกำหนด'
        };
      } else {
        localStorage.removeItem(LOCK_STORAGE_KEY);
      }
    }
  } catch (e) {
    console.warn('Failed to parse stored lock info:', e);
  }
  return null;
}

export default function LoginPage() {
  const [mode, setMode] = useState('pin'); // 'password' | 'pin'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(STEP_AUTH);
  const [pendingStores, setPendingStores] = useState([]);   // stores returned after auth

  // Biometric & 2FA Quick PIN state
  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [bioAssertion, setBioAssertion] = useState(null);
  const [quickPinModalOpen, setQuickPinModalOpen] = useState(false);
  const [quickPin, setQuickPin] = useState('');
  const [quickPinLoading, setQuickPinLoading] = useState(false);
  
  // Security & Lockout state — initialized synchronously from localStorage to prevent flash of unlocked UI
  const [macAddress, setMacAddress] = useState('');
  const [deviceStatus, setDeviceStatus] = useState(() => {
    const stored = getStoredLockInfo();
    return stored || {
      locked: false,
      permanent: false,
      remainingSeconds: 0,
      lockUntil: null,
      status: 'NORMAL',
      reason: ''
    };
  });
  const [hpToken, setHpToken] = useState(''); // Invisible Honeypot field
  const renderTimeRef = useRef(Date.now());

  const { login, pinLogin, selectStore, setAuthSession } = useAuth();
  const navigate = useNavigate();

  const saveLockInfo = (status, lockUntil, reason) => {
    try {
      localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify({
        status,
        lock_until: lockUntil,
        reason: reason || ''
      }));
    } catch (_) {}
  };

  const clearLockInfo = () => {
    try {
      localStorage.removeItem(LOCK_STORAGE_KEY);
    } catch (_) {}
  };

  // ─── Initialize Device MAC and Check Status on Mount ────────────
  useEffect(() => {
    const mac = getDeviceMacAddress();
    setMacAddress(mac);

    const verifyDevice = async () => {
      try {
        const res = await securityAPI.checkDevice({ mac_address: mac });
        if (res.data?.success) {
          if (res.data.locked) {
            setDeviceStatus({
              locked: true,
              permanent: Boolean(res.data.permanent),
              remainingSeconds: res.data.remaining_seconds || 0,
              lockUntil: res.data.lock_until || null,
              status: res.data.status,
              reason: res.data.reason || ''
            });
            saveLockInfo(res.data.status, res.data.lock_until, res.data.reason || '');
            setPin('');
          } else {
            clearLockInfo();
            setDeviceStatus({
              locked: false,
              permanent: false,
              remainingSeconds: 0,
              lockUntil: null,
              status: res.data.status || 'NORMAL',
              reason: ''
            });
          }
        }
      } catch (e) {
        console.warn('Check device status failed:', e.message);
      }
    };

    verifyDevice();
    isBiometricsAvailable().then(avail => setBiometricsSupported(Boolean(avail)));
  }, []);

  // ─── Wall-clock countdown timer for temporary lock ───────────────
  useEffect(() => {
    if (!deviceStatus.locked || deviceStatus.permanent) return;

    let targetTime = null;
    if (deviceStatus.lockUntil) {
      let str = String(deviceStatus.lockUntil).trim();
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
        str = str.replace(' ', 'T') + 'Z';
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
        str = str + 'Z';
      }
      targetTime = new Date(str).getTime();
    }
    if (!targetTime || isNaN(targetTime)) {
      targetTime = Date.now() + (deviceStatus.remainingSeconds * 1000);
    }

    const tick = () => {
      const remaining = Math.ceil((targetTime - Date.now()) / 1000);
      if (remaining <= 0) {
        clearLockInfo();
        setDeviceStatus({
          locked: false,
          permanent: false,
          remainingSeconds: 0,
          lockUntil: null,
          status: 'NORMAL',
          reason: ''
        });
        // Check with backend if temporary lock is cleared
        const mac = getDeviceMacAddress();
        if (mac) {
          securityAPI.checkDevice({ mac_address: mac }).catch(() => {});
        }
      } else {
        setDeviceStatus(prev => ({
          ...prev,
          remainingSeconds: remaining
        }));
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deviceStatus.locked, deviceStatus.permanent, deviceStatus.lockUntil]);

  const formatCountdown = (secs) => {
    const m = Math.floor(Math.max(0, secs) / 60);
    const s = Math.max(0, secs) % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getSecurityPayload = () => ({
    mac_address: macAddress,
    hp_token: hpToken,
    submit_elapsed_ms: Date.now() - renderTimeRef.current,
    ...detectBotSignals()
  });

  // ─── After successful auth, decide what step to go to ───────────
  const handleAuthSuccess = (userStores) => {
    clearLockInfo();
    if (userStores.length === 0) {
      toast.error('บัญชีนี้ไม่มีร้านค้าที่กำหนด กรุณาติดต่อผู้ดูแลระบบ');
      return;
    }
    if (userStores.length === 1) {
      // Only one store — auto-select and continue
      try {
        selectStore(userStores[0].id, userStores);
        toast.success('เข้าสู่ระบบสำเร็จ');
        navigate('/pos');
      } catch {
        toast.error('เกิดข้อผิดพลาดในการเลือกร้านค้า');
      }
    } else {
      // Multiple stores — let user pick
      setPendingStores(userStores);
      setStep(STEP_STORE);
    }
  };

  const handleSecurityError = (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error?.message || 'เข้าสู่ระบบไม่สำเร็จ';

    if (status === 429) {
      // Temporary lockout
      toast.error(msg, { duration: 5000 });
      setPin('');

      const lockUntil = err.response?.data?.lock_until || 
                        err.response?.data?.error?.lock_until || 
                        new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const remSecs = err.response?.data?.remaining_seconds || 
                      err.response?.data?.error?.remaining_seconds || 
                      300;

      setDeviceStatus({
        locked: true,
        permanent: false,
        remainingSeconds: remSecs,
        lockUntil: lockUntil,
        status: 'LOCKED_TEMP',
        reason: msg
      });
      saveLockInfo('LOCKED_TEMP', lockUntil, msg);

      // Refresh device check to sync exact remaining seconds from server
      securityAPI.checkDevice({ mac_address: macAddress }).then(res => {
        if (res.data?.locked) {
          setDeviceStatus({
            locked: true,
            permanent: false,
            remainingSeconds: res.data.remaining_seconds || remSecs,
            lockUntil: res.data.lock_until || lockUntil,
            status: 'LOCKED_TEMP',
            reason: res.data.reason || msg
          });
          saveLockInfo('LOCKED_TEMP', res.data.lock_until || lockUntil, res.data.reason || msg);
        }
      }).catch(() => {});
    } else if (status === 403) {
      // Permanent lockout or blacklisted
      setPin('');
      setDeviceStatus({
        locked: true,
        permanent: true,
        remainingSeconds: 0,
        lockUntil: null,
        status: 'LOCKED_PERMANENT',
        reason: msg
      });
      saveLockInfo('LOCKED_PERMANENT', null, msg);
      toast.error(msg, { duration: 8000 });
    } else {
      toast.error(msg);
    }
  };

  // ─── Password login ──────────────────────────────────────────────
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (deviceStatus.locked) return;
    setLoading(true);
    try {
      const { userStores } = await login(username, password, getSecurityPayload());
      handleAuthSuccess(userStores);
    } catch (err) {
      handleSecurityError(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── PIN login (6 digits) ────────────────────────────────────────
  const handlePinLogin = async (pinValue) => {
    if (pinValue.length < 6 || deviceStatus.locked) return;
    setLoading(true);
    try {
      const { userStores } = await pinLogin(pinValue, getSecurityPayload());
      handleAuthSuccess(userStores);
    } catch (err) {
      handleSecurityError(err);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handlePinPress = (digit) => {
    if (pin.length >= 6 || deviceStatus.locked) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 6) {
      handlePinLogin(newPin);
    }
  };

  // ─── Biometric login (Face ID / Fingerprint) ──────────────────────
  const handleBiometricLogin = async () => {
    if (deviceStatus.locked) return;
    setLoading(true);
    try {
      // 1. Fetch options & enrolled credentials for current device MAC
      const optionsRes = await biometricsAPI.getLoginOptions({ mac_address: macAddress });
      if (!optionsRes.data?.success || !optionsRes.data?.data) {
        throw new Error(optionsRes.data?.message || 'ไม่สามารถขอข้อมูลการยืนยันตัวตนชีวมาตรได้');
      }

      const options = optionsRes.data.data;
      if (!options.allowCredentials || options.allowCredentials.length === 0) {
        toast.error('ไม่พบบัญชีผู้จัดการที่ลงทะเบียน Face ID/ลายนิ้วมือ บนเครื่องนี้ กรุณาเข้าสู่ระบบด้วยรหัสผ่านก่อนเพื่อเปิดใช้งาน');
        return;
      }

      // 2. Prompt native hardware dialog
      const assertionData = await startBiometricAuthentication(options);

      // 3. Hardware scan successful -> prompt Quick PIN dialog for 2FA
      setBioAssertion(assertionData);
      setQuickPin('');
      setQuickPinModalOpen(true);
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.message?.includes('ยกเลิก')) {
        toast('ยกเลิกการสแกนชีวมาตร', { icon: 'ℹ️' });
      } else {
        handleSecurityError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Quick PIN handling (2FA step after biometric assertion) ───────
  const handleQuickPinPress = (digit) => {
    if (quickPin.length >= 6 || deviceStatus.locked || quickPinLoading) return;
    const newPin = quickPin + digit;
    setQuickPin(newPin);
    if (newPin.length === 6) {
      handleQuickPinSubmit(newPin);
    }
  };

  const handleQuickPinSubmit = async (pinValue) => {
    const pinToVerify = pinValue || quickPin;
    if (!pinToVerify || pinToVerify.length < 4 || !bioAssertion) return;

    setQuickPinLoading(true);
    try {
      const payload = {
        mac_address: macAddress,
        credential_id: bioAssertion.credential_id,
        authenticator_data: bioAssertion.authenticator_data,
        client_data_json: bioAssertion.client_data_json,
        signature: bioAssertion.signature,
        quick_pin: pinToVerify
      };

      const res = await biometricsAPI.verifyLogin(payload);
      if (res.data?.success && res.data?.data) {
        setQuickPinModalOpen(false);
        setBioAssertion(null);
        setQuickPin('');
        const { userStores } = setAuthSession(res.data.data);
        handleAuthSuccess(userStores);
      } else {
        throw new Error(res.data?.message || 'การยืนยันรหัส PIN 2FA ไม่ถูกต้อง');
      }
    } catch (err) {
      setQuickPin('');
      handleSecurityError(err);
      if (err.response?.status === 429 || err.response?.status === 403) {
        setQuickPinModalOpen(false);
        setBioAssertion(null);
      }
    } finally {
      setQuickPinLoading(false);
    }
  };

  // ─── Store selection via card click ─────────────────────────────
  const handleSelectStore = (storeId) => {
    try {
      selectStore(storeId, pendingStores);
      toast.success('เลือกร้านค้าสำเร็จ');
      navigate('/pos');
    } catch (err) {
      toast.error(err.message || 'ไม่พบ Store ID นี้ในระบบ');
    }
  };

  // ─── Keyboard support for PIN mode and Quick PIN modal ───────────
  useEffect(() => {
    if (deviceStatus.locked) return;

    const handleKeyDown = (e) => {
      if (quickPinModalOpen) {
        if (e.key >= '0' && e.key <= '9') {
          handleQuickPinPress(e.key);
        } else if (e.key === 'Backspace') {
          setQuickPin(prev => prev.slice(0, -1));
        } else if (e.key === 'Escape') {
          setQuickPinModalOpen(false);
          setBioAssertion(null);
          setQuickPin('');
        }
        return;
      }

      if (step !== STEP_AUTH) return;
      if (mode === 'pin') {
        if (e.key >= '0' && e.key <= '9') {
          handlePinPress(e.key);
        } else if (e.key === 'Backspace') {
          setPin(prev => prev.slice(0, -1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, pin, step, deviceStatus.locked, quickPinModalOpen, quickPin]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: '#EB0000', backgroundImage: 'linear-gradient(to left, #3300FC, #95008A, #EB0000)' }}>

      {/* Invisible Honeypot Trap for Bot Detection */}
      <div style={{ display: 'none', opacity: 0, position: 'absolute', left: '-9999px' }} aria-hidden="true">
        <input 
          type="text" 
          name="hp_token_website" 
          value={hpToken} 
          onChange={(e) => setHpToken(e.target.value)} 
          tabIndex={-1} 
          autoComplete="off" 
        />
      </div>

      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-sm bg-white/15 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/30 p-6 sm:p-8">

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-2xl mb-3 shadow-lg border border-white/30">
            <span className="text-4xl">🛒</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-wide">POS</h1>
          <p className="text-orange-100 text-xs sm:text-sm mt-0.5">ระบบขายหน้าร้าน</p>
          {macAddress && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 text-white/70 text-[10px] font-mono border border-white/10">
              <span>🖥️</span> {macAddress}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════ SECURITY LOCK BANNERS */}
        {deviceStatus.locked && (
          <div className={`mb-6 p-4 rounded-2xl border shadow-lg animate-fade-in ${
            deviceStatus.permanent 
              ? 'bg-rose-950/80 border-rose-400/50 text-rose-100' 
              : 'bg-amber-950/80 border-amber-400/50 text-amber-100'
          }`}>
            <div className="flex items-center gap-2 mb-2 font-bold text-sm">
              <span>{deviceStatus.permanent ? '🚨' : '⏳'}</span>
              <span>{deviceStatus.permanent ? 'อุปกรณ์ถูกระงับการเข้าถึง' : 'ระบบหน่วงเวลาชั่วคราว'}</span>
            </div>
            
            <p className="text-xs leading-relaxed opacity-90 mb-2.5">
              {deviceStatus.reason || (
                deviceStatus.permanent 
                  ? 'ตรวจพบพฤติกรรมผิดปกติ ระบบได้ส่งคำขอปลดล็อคไปยังผู้จัดการผ่าน LINE แล้ว' 
                  : 'คุณพยายามเข้าสู่ระบบผิดพลาดเกินกำหนด'
              )}
            </p>

            {!deviceStatus.permanent && deviceStatus.remainingSeconds > 0 && (
              <div className="text-center bg-black/30 py-2 rounded-xl border border-amber-400/30">
                <span className="text-xs text-amber-300 font-medium">รอใหม่อีก: </span>
                <span className="text-xl font-mono font-black text-white tracking-wider">
                  {formatCountdown(deviceStatus.remainingSeconds)}
                </span>
              </div>
            )}

            {deviceStatus.permanent && (
              <p className="text-[11px] text-rose-200/80 mt-1">
                กรุณาติดต่อผู้ดูแลระบบเพื่อทำการ <strong>Whitelist</strong> อุปกรณ์นี้ในหน้า Settings
              </p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════ STEP: STORE PICKER */}
        {step === STEP_STORE && (
          <div>
            {/* Header */}
            <div className="text-center mb-6">
              <p className="text-white font-semibold text-lg">เลือกร้านค้า</p>
              <p className="text-white/60 text-xs mt-1">บัญชีของคุณมีสิทธิ์เข้าถึง {pendingStores.length} ร้านค้า</p>
            </div>

            {/* Store cards */}
            <div className="space-y-3 mb-6 max-h-56 overflow-y-auto pr-1">
              {pendingStores.map(store => (
                <button
                  key={store.id}
                  id={`store-btn-${store.id}`}
                  onClick={() => handleSelectStore(store.id)}
                  className="w-full flex items-center gap-3 bg-white/20 hover:bg-white/30 active:scale-95 border border-white/30 hover:border-white/50 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 shadow-sm group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform">
                    🏪
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{store.name}</p>
                    <p className="text-white/60 text-xs truncate">{store.address || 'สาขาหลัก'}</p>
                  </div>
                  <span className="text-white/50 text-sm group-hover:translate-x-1 transition-transform">→</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => { setStep(STEP_AUTH); setPin(''); }}
              className="w-full py-2.5 text-white/70 hover:text-white text-xs font-semibold text-center transition-colors"
            >
              ← กลับไปหน้าเข้าสู่ระบบ
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════ STEP: AUTH */}
        {step === STEP_AUTH && (
          <>
            {/* Biometric 2FA Login Option (Admin / Manager) */}
            {biometricsSupported && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={loading || deviceStatus.locked}
                  className={`w-full py-3.5 px-4 rounded-2xl font-bold text-xs sm:text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-white/30 hover:border-white/50 ${
                    deviceStatus.locked ? 'bg-white/10' : 'hover:shadow-indigo-500/40'
                  }`}
                  style={{
                    background: deviceStatus.locked
                      ? 'rgba(255,255,255,0.1)'
                      : 'linear-gradient(135deg, rgba(79, 70, 229, 0.9) 0%, rgba(124, 58, 237, 0.9) 100%)'
                  }}
                >
                  <span className="text-xl">🧬</span>
                  <span>
                    {deviceStatus.locked
                      ? `🔒 ระบบหน่วงเวลา (${formatCountdown(deviceStatus.remainingSeconds)})`
                      : 'สแกน Face ID / ลายนิ้วมือ (ผู้จัดการ)'}
                  </span>
                </button>
                <div className="flex items-center gap-2 mt-4 text-white/40 text-[11px] font-medium">
                  <div className="flex-1 h-px bg-white/20"></div>
                  <span>หรือเข้าสู่ระบบด้วย</span>
                  <div className="flex-1 h-px bg-white/20"></div>
                </div>
              </div>
            )}

            {/* Mode Toggle */}
            <div className="flex bg-white/10 rounded-2xl p-1 mb-6 border border-white/20">
              {[['pin', '🔢 PIN (6 หลัก)'], ['password', '🔑 รหัสผ่าน']].map(([val, label]) => (
                <button key={val} onClick={() => { setMode(val); setPin(''); }}
                  className={'flex-1 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ' +
                    (mode === val ? 'bg-white text-indigo-700 shadow-lg' : 'text-white/70 hover:text-white')}>
                  {label}
                </button>
              ))}
            </div>

            {/* Password Mode */}
            {mode === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-white/80 mb-1.5">ชื่อผู้ใช้</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    disabled={deviceStatus.locked}
                    className="w-full bg-white/20 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all text-sm disabled:opacity-50"
                    placeholder="กรอกชื่อผู้ใช้" required autoComplete="username" />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-white/80 mb-1.5">รหัสผ่าน</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    disabled={deviceStatus.locked}
                    className="w-full bg-white/20 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all text-sm disabled:opacity-50"
                    placeholder="กรอกรหัสผ่าน" required autoComplete="current-password" />
                </div>
                <button type="submit" disabled={loading || deviceStatus.locked}
                  className="w-full bg-white text-purple-700 font-bold py-3.5 rounded-2xl shadow-lg hover:bg-red-50 active:scale-95 transition-all mt-2 disabled:opacity-50 text-sm sm:text-base">
                  {loading ? '⏳ กำลังเข้าสู่ระบบ...' : deviceStatus.locked ? '🔒 ระบบถูกระงับ' : 'เข้าสู่ระบบ →'}
                </button>
              </form>
            )}

            {/* PIN Mode (6 Digits) */}
            {mode === 'pin' && (
              <div>
                <div className="flex justify-center gap-2 sm:gap-3 mb-8">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="relative group">
                      {/* Outer Wrapper */}
                      <div className={'w-10 h-13 sm:w-12 sm:h-16 rounded-xl p-[2px] transition-all duration-300 ' +
                        (pin.length > i
                          ? 'bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 shadow-[0_0_15px_rgba(168,85,247,0.4)] scale-105'
                          : 'bg-transparent border border-white/20')}>

                        {/* Inner Content Box */}
                        <div className={'w-full h-full rounded-[10px] flex items-center justify-center text-xl sm:text-2xl font-bold transition-all duration-200 ' +
                          (pin.length > i
                            ? 'bg-white/20 text-white backdrop-blur-md'
                            : 'bg-white/5 text-white/30')}>
                          {pin[i] ? (
                            <span className="animate-in zoom-in duration-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]">●</span>
                          ) : (
                            <span className="text-white/10 text-xs">○</span>
                          )}
                        </div>
                      </div>

                      {/* Subtle active pulse */}
                      {pin.length === i && !loading && !deviceStatus.locked && (
                        <div className="absolute inset-0 rounded-xl border-2 border-white/40 animate-pulse" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, idx) => (
                    <button key={idx}
                      onClick={() => {
                        if (deviceStatus.locked) return;
                        if (key === 'del') setPin(p => p.slice(0, -1));
                        else if (key !== null) handlePinPress(String(key));
                      }}
                      disabled={key === null || loading || deviceStatus.locked}
                      className={
                        'h-14 sm:h-16 rounded-2xl text-lg sm:text-xl font-bold transition-all active:scale-90 ' +
                        (key === null ? 'invisible' :
                          key === 'del'
                            ? 'bg-white/10 text-red-300 hover:bg-red-500/30 border border-white/20'
                            : 'bg-white/20 text-white hover:bg-white/35 border border-white/25 shadow-sm backdrop-blur-sm hover:border-white/50 disabled:opacity-30')
                      }>
                      {key === 'del' ? '⌫' : key}
                    </button>
                  ))}
                </div>
                {loading && <p className="text-center text-orange-100 text-xs sm:text-sm mt-5 animate-pulse">⏳ กำลังตรวจสอบ PIN...</p>}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════ 2FA QUICK PIN MODAL */}
      {quickPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xs bg-slate-900/95 border border-indigo-500/30 rounded-3xl p-6 text-white shadow-2xl animate-scale-up">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-2 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-2xl shadow-inner">
                🧬
              </div>
              <h3 className="text-base font-bold text-white">ยืนยันรหัส Quick PIN</h3>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                สแกนชีวมาตรผ่านแล้ว กรุณากรอกรหัส PIN เพื่อเข้าสู่ระบบ
              </p>
            </div>

            {/* PIN Dots (4 to 6 digits) */}
            <div className="flex justify-center gap-2 mb-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-9 h-11 rounded-xl flex items-center justify-center text-lg font-bold border transition-all ${
                    quickPin.length > i
                      ? 'border-indigo-400 bg-indigo-500/30 text-white shadow-sm scale-105'
                      : 'border-white/20 bg-white/5 text-white/20'
                  }`}
                >
                  {quickPin[i] ? '●' : '○'}
                </div>
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (quickPinLoading) return;
                    if (key === 'del') setQuickPin((p) => p.slice(0, -1));
                    else if (key !== null) handleQuickPinPress(String(key));
                  }}
                  disabled={key === null || quickPinLoading}
                  className={`h-12 rounded-xl text-lg font-bold transition-all active:scale-95 cursor-pointer ${
                    key === null
                      ? 'invisible'
                      : key === 'del'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                      : 'bg-white/10 text-white border border-white/15 hover:bg-white/20'
                  }`}
                >
                  {key === 'del' ? '⌫' : key}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuickPinModalOpen(false);
                  setBioAssertion(null);
                  setQuickPin('');
                }}
                disabled={quickPinLoading}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/80 transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleQuickPinSubmit(quickPin)}
                disabled={quickPin.length < 4 || quickPinLoading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-bold text-white shadow-lg transition-all cursor-pointer"
              >
                {quickPinLoading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
