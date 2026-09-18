import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function LineSettingsTab({ canMaintain }) {
  const { stores, activeStoreId } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState(activeStoreId || stores?.[0]?.id || 'store-1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingApproval, setTestingApproval] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectCountdown, setDetectCountdown] = useState(0);
  const [detectedInfo, setDetectedInfo] = useState(null);

  const [form, setForm] = useState({
    channel_access_token: '',
    channel_secret: '',
    target_group_id: '',
    enable_daily_report: true,
    daily_report_time: '22:00',
    enable_approval_notifications: true
  });

  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Read-only webhook URL for LINE Console
  const webhookUrl = 'https://pos-backend.bragill2012.workers.dev/api/line/webhook';

  useEffect(() => {
    if (selectedStoreId) {
      fetchSettings(selectedStoreId);
    }
  }, [selectedStoreId]);

  const fetchSettings = async (storeId) => {
    setLoading(true);
    try {
      const res = await api.get(`/settings/line?store_id=${storeId || selectedStoreId}`);
      const data = res.data?.data || {};
      setTokenConfigured(Boolean(data.has_token));
      setSecretConfigured(Boolean(data.has_secret));
      setForm({
        channel_access_token: data.channel_access_token || '',
        channel_secret: data.channel_secret || '',
        target_group_id: data.target_group_id || '',
        enable_daily_report: Boolean(data.enable_daily_report ?? true),
        daily_report_time: data.daily_report_time || '22:00',
        enable_approval_notifications: Boolean(data.enable_approval_notifications ?? true)
      });
    } catch (err) {
      console.error('Failed to load LINE settings:', err);
      toast.error('ไม่สามารถโหลดข้อมูลการตั้งค่า LINE ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success('คัดลอก Webhook URL สำเร็จ!');
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canMaintain) return toast.error('คุณไม่มีสิทธิ์แก้ไขการตั้งค่า');
    setSaving(true);
    try {
      await api.put('/settings/line', { ...form, store_id: selectedStoreId });
      toast.success('บันทึกการตั้งค่า LINE สำเร็จแล้ว 🎉');
      fetchSettings(selectedStoreId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleTestMessage = async () => {
    if (!form.target_group_id) {
      return toast.error('กรุณาระบุ Target Group ID หรือ User ID');
    }
    setTesting(true);
    try {
      const res = await api.post('/settings/line/test', { store_id: selectedStoreId });
      toast.success(res.data?.message || 'ส่งข้อความทดสอบสำเร็จแล้ว!');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'ทดสอบล้มเหลว ตรวจสอบข้อมูล Token/ID');
    } finally {
      setTesting(false);
    }
  };

  const handleTestApproval = async () => {
    if (!form.target_group_id) {
      return toast.error('กรุณาระบุ Target Group ID ก่อนทดสอบขออนุมัติ');
    }
    setTestingApproval(true);
    try {
      const res = await api.post('/settings/line/test-approval', { store_id: selectedStoreId });
      toast.success(res.data?.message || 'ส่งการ์ดทดสอบขออนุมัติเข้ากลุ่ม LINE เรียบร้อยแล้ว!');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'ทดสอบขออนุมัติล้มเหลว ตรวจสอบ Token และ Group ID');
    } finally {
      setTestingApproval(false);
    }
  };

  const handleSendDailyReportNow = async () => {
    const curStore = stores?.find(s => s.id === selectedStoreId);
    const storeLabel = curStore?.name || selectedStoreId;
    if (!window.confirm(`คุณต้องการส่งรายงานสรุปยอดขายของ ${storeLabel} วันนี้เข้ากลุ่ม LINE ตอนนี้เลยใช่หรือไม่?`)) return;
    setSendingReport(true);
    try {
      const res = await api.post('/settings/line/send-daily-report-now', { store_id: selectedStoreId });
      toast.success(res.data?.message || 'ส่งรายงานสรุปยอดเข้า LINE สำเร็จ!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'ส่งรายงานไม่สำเร็จ');
    } finally {
      setSendingReport(false);
    }
  };

  // Auto-detect target ID polling loop
  useEffect(() => {
    let timer = null;
    if (detecting) {
      const poll = async () => {
        try {
          const res = await api.get('/settings/line/detect-id');
          if (res.data?.detected && res.data?.data?.target_id) {
            const info = res.data.data;
            setForm(prev => ({ ...prev, target_group_id: info.target_id }));
            setDetectedInfo(info);
            setDetecting(false);
            setDetectCountdown(0);
            toast.success(`🎉 ตรวจพบ ${info.is_group ? 'Group ID' : 'User ID'} สำเร็จแล้ว!`);
            return;
          }
        } catch (err) {
          console.error('Detection poll error:', err);
        }

        setDetectCountdown(prev => {
          if (prev <= 1) {
            setDetecting(false);
            toast('หมดเวลารอตรวจจับ กรุณากดเริ่มตรวจจับใหม่อีกครั้ง', { icon: '⏱️' });
            return 0;
          }
          return prev - 2;
        });
      };

      // Poll every 2 seconds
      timer = setInterval(poll, 2000);
      poll(); // Immediate check
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [detecting]);

  const handleStartDetect = () => {
    setDetecting(true);
    setDetectCountdown(60); // Listen for 60 seconds
    setDetectedInfo(null);
    toast.success('เริ่มตรวจจับแล้ว! กรุณาส่งข้อความใดก็ได้หรือพิมพ์ "id" ในกลุ่ม LINE ของคุณ');
  };

  const handleCancelDetect = () => {
    setDetecting(false);
    setDetectCountdown(0);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Store Selector Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏬</span>
          <div>
            <h3 className="font-bold text-sm text-gray-800 dark:text-slate-100">เลือกสาขาที่ต้องการตั้งค่า LINE</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">แต่ละสาขาสามารถแยก Token, กลุ่ม LINE และเวลาส่งรายงานได้อย่างอิสระ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedStoreId}
            onChange={e => setSelectedStoreId(e.target.value)}
            className="input-field py-1.5 px-3 font-semibold text-xs min-w-[200px]"
          >
            {stores && stores.length > 0 ? (
              stores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.code ? `(${s.code})` : ''} {s.id === activeStoreId ? '★ ปัจจุบัน' : ''}
                </option>
              ))
            ) : (
              <option value="store-1">สาขาหลัก (store-1)</option>
            )}
          </select>
        </div>
      </div>

      {/* Top Banner */}
      <div className="bg-linear-to-r from-emerald-600 to-teal-700 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold mb-2">
              <span>💬</span> <span>LINE Official Account Integration</span>
            </div>
            <h2 className="text-2xl font-black">ระบบแจ้งเตือน & อนุมัติผ่าน LINE</h2>
            <p className="text-xs sm:text-sm text-emerald-100 mt-1 max-w-xl">
              ส่งรายงานสรุปยอดขายประจำวันเข้ากลุ่ม LINE อัตโนมัติตามเวลาที่คุณกำหนด พร้อมระบบอนุมัติการยกเลิกบิลและการรับของแบบโต้ตอบ (Interactive Flex Messages)
            </p>
          </div>
          <div className="shrink-0 flex flex-wrap sm:flex-col gap-2">
            <button
              type="button"
              onClick={handleTestMessage}
              disabled={testing || !canMaintain}
              className="px-4 py-2 bg-white text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all rounded-xl font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="ทดสอบส่งข้อความเชื่อมต่อไปยังกลุ่ม LINE"
            >
              {testing ? <span className="animate-spin">⏳</span> : <span>🔔</span>}
              <span>ทดสอบส่งข้อความ</span>
            </button>
            <button
              type="button"
              onClick={handleTestApproval}
              disabled={testingApproval || !canMaintain}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 active:scale-95 text-amber-950 transition-all rounded-xl font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="ส่งการ์ดจำลองการขอยกเลิกบิล เพื่อทดสอบปุ่ม อนุมัติ / ไม่อนุมัติ"
            >
              {testingApproval ? <span className="animate-spin">⏳</span> : <span>🧪</span>}
              <span>ทดสอบขออนุมัติ</span>
            </button>
            <button
              type="button"
              onClick={handleSendDailyReportNow}
              disabled={sendingReport || !canMaintain}
              className="px-4 py-2 bg-emerald-800/80 hover:bg-emerald-900 active:scale-95 text-white transition-all rounded-xl font-bold text-xs shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="ส่งสรุปยอดขายวันนี้เข้ากลุ่ม LINE ทันที"
            >
              {sendingReport ? <span className="animate-spin">⏳</span> : <span>📊</span>}
              <span>ส่งรายงานวันนี้ทันที</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-16">
          <span className="animate-spin text-4xl inline-block mb-3">⏳</span>
          <p className="text-sm text-gray-500">กำลังโหลดการตั้งค่า LINE ของสาขานี้...</p>
        </div>
      ) : (

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Credentials */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-slate-800">
            <span className="text-xl">🔑</span>
            <div>
              <h3 className="font-bold text-sm text-gray-800 dark:text-slate-100">ข้อมูลเชื่อมต่อ LINE Developers (API Credentials)</h3>
              <p className="text-xs text-gray-400">นำข้อมูลมาจาก LINE Developers Console &gt; Messaging API</p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            {/* Channel Access Token */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                Channel Access Token (Long-lived) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={form.channel_access_token}
                  onChange={e => setForm({ ...form, channel_access_token: e.target.value })}
                  disabled={!canMaintain}
                  placeholder="วาง Channel Access Token ที่ได้จาก LINE Developers"
                  className="input-field pr-24 font-mono text-xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 cursor-pointer font-medium"
                >
                  {showToken ? '🙈 ซ่อน' : '👁️ แสดง'}
                </button>
              </div>
            </div>

            {/* Channel Secret */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                Channel Secret <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.channel_secret}
                  onChange={e => setForm({ ...form, channel_secret: e.target.value })}
                  disabled={!canMaintain}
                  placeholder="วาง Channel Secret (ใช้สำหรับตรวจสอบลายเซ็น HMAC-SHA256)"
                  className="input-field pr-24 font-mono text-xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 cursor-pointer font-medium"
                >
                  {showSecret ? '🙈 ซ่อน' : '👁️ แสดง'}
                </button>
              </div>
            </div>

            {/* Target Group ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Target Group ID / User ID <span className="text-red-500">*</span>
                </label>
                {!detecting ? (
                  <button
                    type="button"
                    onClick={handleStartDetect}
                    disabled={!canMaintain}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                  >
                    <span>📡</span>
                    <span>ตรวจจับไอดีอัตโนมัติ (Click to Detect)</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                      กำลังรอข้อความจาก LINE... ({detectCountdown}s)
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelDetect}
                      className="px-2 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded text-xs hover:bg-gray-300 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={form.target_group_id}
                  onChange={e => setForm({ ...form, target_group_id: e.target.value })}
                  disabled={!canMaintain}
                  placeholder="เช่น Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx หรือ Uxxxxxxxx..."
                  className="input-field font-mono text-xs"
                  required
                />
              </div>

              {detecting && (
                <div className="mt-2 p-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2 animate-fadeIn">
                  <span className="text-base">💬</span>
                  <div className="space-y-0.5">
                    <p className="font-bold">ขั้นตอนการตรวจจับอัตโนมัติ:</p>
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                      เข้าไปในกลุ่ม LINE ของร้านคุณ แล้วส่งข้อความใดก็ได้ เช่น พิมพ์คำว่า <strong>"id"</strong> หรือส่งสติกเกอร์ <br/>
                      ระบบจะตรวจจับ Group ID และกรอกลงในช่องนี้ให้อัตโนมัติทันที
                    </p>
                  </div>
                </div>
              )}

              {detectedInfo && (
                <div className="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span>✅</span> ตรวจพบ {detectedInfo.is_group ? 'กลุ่ม (Group ID)' : 'ผู้ใช้ (User ID)'}: <code className="font-mono">{detectedInfo.target_id}</code>
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    เมื่อ {new Date(detectedInfo.created_at).toLocaleTimeString('th-TH')}
                  </span>
                </div>
              )}

              <p className="text-[11px] text-gray-400 mt-1">
                💡 ไอดีกลุ่มไลน์ (Group ID) ขึ้นต้นด้วยตัว <code className="bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded text-indigo-600">C</code> หรือ User ID ของผู้จัดการขึ้นต้นด้วย <code className="bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded text-indigo-600">U</code>
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Scheduled Report & Approvals Config */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-slate-800">
            <span className="text-xl">⚙️</span>
            <div>
              <h3 className="font-bold text-sm text-gray-800 dark:text-slate-100">การตั้งค่ารายงานและการแจ้งเตือน (Automation Rules)</h3>
              <p className="text-xs text-gray-400">กำหนดเวลาส่งรายงานยอดขายรายวัน และเปิดระบบอนุมัติผ่าน LINE</p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            {/* Daily Report Toggle & Time Picker */}
            <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <p className="font-bold text-sm text-gray-800 dark:text-slate-100">ส่งรายงานสรุปยอดขายประจำวันอัตโนมัติ</p>
                    <p className="text-xs text-gray-400">ส่งการ์ดสรุปยอดขาย รายการสินค้าขายดี และการชำระเงินเข้ากลุ่ม LINE</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enable_daily_report}
                    onChange={e => setForm({ ...form, enable_daily_report: e.target.checked })}
                    disabled={!canMaintain}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {form.enable_daily_report && (
                <div className="pt-2 border-t border-gray-200 dark:border-slate-700/60 flex items-center justify-between gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                      ⏰ เวลาส่งรายงานสรุปยอดขายรายวัน (Asia/Bangkok)
                    </label>
                    <p className="text-[11px] text-gray-400">ระบบ Cron จะส่งข้อความอัตโนมัติทุกวันเมื่อถึงเวลานี้</p>
                  </div>
                  <div className="w-40">
                    <input
                      type="time"
                      value={form.daily_report_time}
                      onChange={e => setForm({ ...form, daily_report_time: e.target.value })}
                      disabled={!canMaintain}
                      className="input-field text-center font-bold font-mono text-base py-1.5"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Approval Notifications Toggle */}
            <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🛡️</span>
                <div>
                  <p className="font-bold text-sm text-gray-800 dark:text-slate-100">แจ้งเตือนคำขออนุมัติรายการสำคัญ (Interactive Approvals)</p>
                  <p className="text-xs text-gray-400">ส่งการ์ดขออนุมัติยกเลิกบิล (Void Order) พร้อมปุ่มกด [อนุมัติ] / [ปฏิเสธ] ทันที</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enable_approval_notifications}
                  onChange={e => setForm({ ...form, enable_approval_notifications: e.target.checked })}
                  disabled={!canMaintain}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Section 3: Webhook URL & Setup Guide */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-slate-800">
            <span className="text-xl">🌐</span>
            <div>
              <h3 className="font-bold text-sm text-gray-800 dark:text-slate-100">Webhook URL สำหรับ LINE Developers Console</h3>
              <p className="text-xs text-gray-400">คัดลอก URL นี้ไปใส่ในช่อง Webhook URL ใน LINE Developers</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="input-field bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-mono text-xs select-all"
            />
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>{copiedWebhook ? '✅' : '📋'}</span>
              <span>{copiedWebhook ? 'คัดลอกแล้ว' : 'คัดลอก URL'}</span>
            </button>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/40 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <p className="font-bold">📌 คำแนะนำการตั้งค่าใน LINE Developers:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
              <li>ไปที่แท็บ <strong>Messaging API</strong> &gt; เลื่อนไปที่หัวข้อ <strong>Webhook settings</strong></li>
              <li>วาง URL ข้างต้นลงในช่อง <strong>Webhook URL</strong> แล้วคลิก <strong>Update</strong></li>
              <li>เปิดสวิตช์ <strong>Use webhook</strong> ให้เป็นสถานะ <span className="font-bold text-emerald-600">Enabled</span></li>
              <li>กดปุ่ม <strong>Verify</strong> เพื่อยืนยันว่าการเชื่อมต่อถูกต้อง (จะได้รับสถานะ Success)</li>
            </ol>
          </div>
        </div>

        {/* Save Button */}
        {canMaintain && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? <span className="animate-spin">⏳</span> : <span>💾</span>}
              <span>บันทึกการตั้งค่า LINE</span>
            </button>
          </div>
        )}
      </form>
      )}
    </div>
  );
}
