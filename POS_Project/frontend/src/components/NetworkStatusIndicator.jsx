import { useState, useRef, useEffect } from 'react';
import { useNetwork } from '../contexts/NetworkContext';

export default function NetworkStatusIndicator() {
  const { status, pendingCount, isChecking, lastChecked, checkNetworkStatus } = useNetwork();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef(null);

  // Close tooltip on click outside
  useEffect(() => {
    const handler = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const getStatusBadge = () => {
    if (status === 'online') {
      return (
        <button
          onClick={() => setShowTooltip(!showTooltip)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 transition-all text-xs font-bold cursor-pointer active:scale-95 shadow-sm"
          title="สถานะระบบ: ออนไลน์การเชื่อมต่อสมบูรณ์"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <span className="hidden sm:inline">ออนไลน์</span>
        </button>
      );
    }

    if (status === 'server_down') {
      return (
        <button
          onClick={() => setShowTooltip(!showTooltip)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/30 hover:bg-amber-500/40 border border-amber-400/50 text-amber-100 transition-all text-xs font-bold cursor-pointer active:scale-95 shadow-sm animate-pulse"
          title="มีเน็ตแต่ติดต่อเซิร์ฟเวอร์หลักไม่ได้"
        >
          <span className="h-2 w-2 rounded-full bg-amber-400"></span>
          <span>เซิร์ฟเวอร์ไม่ตอบสนอง {pendingCount > 0 ? `(${pendingCount} ค้าง)` : ''}</span>
        </button>
      );
    }

    // Completely offline
    return (
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 text-red-100 transition-all text-xs font-bold cursor-pointer active:scale-95 shadow-sm animate-pulse"
        title="ไม่มีสัญญาณอินเทอร์เน็ต - ระบบเข้าสู่โหมดออฟไลน์"
      >
        <span className="h-2 w-2 rounded-full bg-red-400"></span>
        <span>โหมดออฟไลน์ {pendingCount > 0 ? `(${pendingCount} ค้าง)` : ''}</span>
      </button>
    );
  };

  return (
    <div ref={tooltipRef} className="relative flex items-center">
      {getStatusBadge()}

      {/* Tooltip & Health Details Popup */}
      {showTooltip && (
        <>
          {/* Mobile Backdrop for outside tap */}
          <div
            className="fixed inset-0 bg-black/25 z-40 sm:hidden"
            onClick={() => setShowTooltip(false)}
          />

          <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[calc(56px+env(safe-area-inset-top,0px)+8px)] sm:top-full sm:mt-2 max-w-[340px] sm:w-72 mx-auto sm:mx-0 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 p-4 z-50 animate-scale-up text-gray-800 dark:text-slate-100 pwa-network-popup">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2 mb-3">
              <h4 className="font-bold text-xs flex items-center gap-1.5 text-gray-800 dark:text-slate-100 min-w-0">
                <span className="shrink-0">📡</span>
                <span className="truncate">สถานะเครือข่าย & ระบบ (System Health)</span>
              </h4>
              <button
                onClick={() => setShowTooltip(false)}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
                title="ปิด"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-slate-800/60">
                <span className="text-gray-500 dark:text-slate-400">สัญญาณอินเทอร์เน็ต:</span>
                <span className={`font-bold ${status !== 'offline' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {status !== 'offline' ? '🌐 เชื่อมต่อแล้ว' : '❌ ไม่มีสัญญาณ'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-slate-800/60">
                <span className="text-gray-500 dark:text-slate-400">เซิร์ฟเวอร์หลัก (API):</span>
                <span className={`font-bold ${status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                  {status === 'online' ? '✅ ตอบสนองปกติ' : '⚠️ ไม่สามารถติดต่อได้'}
                </span>
              </div>

              {pendingCount > 0 && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60">
                  <span className="text-amber-800 dark:text-amber-300 font-medium">ออเดอร์ค้างซิงค์:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/80 px-2 py-0.5 rounded-lg">
                    {pendingCount} รายการ
                  </span>
                </div>
              )}

              {lastChecked && (
                <p className="text-[10px] text-gray-400 text-right pt-1">
                  ตรวจสอบล่าสุด: {new Date(lastChecked).toLocaleTimeString('th-TH')}
                </p>
              )}

              <button
                onClick={async () => {
                  await checkNetworkStatus();
                }}
                disabled={isChecking}
                className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
              >
                <span>{isChecking ? '⏳' : '🔄'}</span>
                <span>{isChecking ? 'กำลังตรวจสอบ...' : 'ทดสอบการเชื่อมต่อใหม่'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function OfflineTopBanner() {
  const { status, pendingCount } = useNetwork();

  if (status === 'online') return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-1.5 text-xs font-bold flex items-center justify-center gap-2 shadow-inner z-30 animate-fade-in">
      <span>⚠️</span>
      <span>
        {status === 'offline'
          ? 'อุปกรณ์ขาดการเชื่อมต่ออินเทอร์เน็ต - ระบบเปิดโหมดขายออฟไลน์ (ออเดอร์จะบันทึกในเครื่องอัตโนมัติ)'
          : 'เซิร์ฟเวอร์หลักไม่ตอบสนอง - ออเดอร์จะถูกบันทึกชั่วคราวและซิงค์เมื่อระบบพร้อม'}
      </span>
      {pendingCount > 0 && (
        <span className="bg-black/20 px-2 py-0.5 rounded-full text-[11px]">
          ค้าง {pendingCount} ออเดอร์
        </span>
      )}
    </div>
  );
}
