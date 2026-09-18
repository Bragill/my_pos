import { useState, useEffect, useCallback } from 'react';
import { securityAPI } from '../services/api';
import { formatDate } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import Pagination from './Pagination';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  NORMAL: { label: 'ปกติ', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800', icon: '🟢' },
  LOCKED_TEMP: { label: 'ล็อกชั่วคราว', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800', icon: '⏳' },
  LOCKED_PERMANENT: { label: 'ล็อกถาวร (รออนุมัติ)', color: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800', icon: '🚨' },
  WHITELISTED: { label: 'Whitelisted (อนุญาต)', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800', icon: '🛡️' },
  BLACKLISTED: { label: 'Blacklisted (แบนถาวร)', color: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: '⛔' },
};

export default function DeviceSecurityTab({ canMaintain = true }) {
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      // Ensure current device is touched/registered
      await securityAPI.pingDevice().catch(() => {});
      const res = await securityAPI.getDevices();
      if (res.data?.success) {
        setDevices(res.data.data || []);
      }
    } catch (err) {
      console.error('[DeviceSecurityTab] fetch error:', err);
      toast.error('ไม่สามารถโหลดข้อมูลอุปกรณ์ความปลอดภัยได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleWhitelist = async (device) => {
    if (!window.confirm(`ยืนยันการปลดล็อคและอนุญาต (Whitelist) อุปกรณ์ ${device.mac_address} หรือไม่?`)) return;
    setActionLoading(device.id);
    try {
      const res = await securityAPI.whitelistDevice(device.id);
      if (res.data?.success) {
        toast.success(res.data.message || 'ปลดล็อคอุปกรณ์สำเร็จ');
        fetchDevices();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการปลดล็อค');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlacklist = async (device) => {
    if (!window.confirm(`ยืนยันการระงับถาวร (Blacklist) อุปกรณ์ ${device.mac_address} หรือไม่? (อุปกรณ์นี้จะไม่สามารถใช้งานระบบได้อีก)`)) return;
    setActionLoading(device.id);
    try {
      const res = await securityAPI.blacklistDevice(device.id);
      if (res.data?.success) {
        toast.success(res.data.message || 'ระงับอุปกรณ์ถาวรสำเร็จ');
        fetchDevices();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการระงับ');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReset = async (device) => {
    if (!window.confirm(`ต้องการรีเซ็ตประวัติความผิดพลาดของอุปกรณ์ ${device.mac_address} กลับเป็นปกติหรือไม่?`)) return;
    setActionLoading(device.id);
    try {
      const res = await securityAPI.resetDevice(device.id);
      if (res.data?.success) {
        toast.success(res.data.message || 'รีเซ็ตสถานะอุปกรณ์สำเร็จ');
        fetchDevices();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการรีเซ็ต');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (device) => {
    if (!window.confirm(`ต้องการลบประวัติอุปกรณ์ ${device.mac_address} ออกจากระบบหรือไม่?`)) return;
    setActionLoading(device.id);
    try {
      const res = await securityAPI.deleteDevice(device.id);
      if (res.data?.success) {
        toast.success(res.data.message || 'ลบข้อมูลสำเร็จ');
        fetchDevices();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการลบ');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDevices = devices.filter((d) => {
    const matchSearch = 
      !search ||
      d.mac_address?.toLowerCase().includes(search.toLowerCase()) ||
      d.ip_address?.toLowerCase().includes(search.toLowerCase()) ||
      d.location?.toLowerCase().includes(search.toLowerCase()) ||
      d.locked_reason?.toLowerCase().includes(search.toLowerCase()) ||
      d.device_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.last_user_name?.toLowerCase().includes(search.toLowerCase());

    const matchStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'LOCKED' ? (d.status === 'LOCKED_TEMP' || d.status === 'LOCKED_PERMANENT') : d.status === filterStatus);

    return matchSearch && matchStatus;
  });

  const devicePaging = usePagination(filteredDevices, 10, search + '|' + filterStatus);

  const stats = {
    total: devices.length,
    whitelisted: devices.filter(d => d.status === 'WHITELISTED').length,
    locked: devices.filter(d => d.status === 'LOCKED_TEMP' || d.status === 'LOCKED_PERMANENT').length,
    blacklisted: devices.filter(d => d.status === 'BLACKLISTED').length,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Header Card */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-xl sm:text-2xl shadow-inner shrink-0">
              🔒
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                การจัดการความปลอดภัยและอุปกรณ์ (Device Security)
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                ตรวจสอบประวัติการล็อกอินผิดพลาด, บอท/สคริปต์, จัดการ Whitelist และระงับอุปกรณ์ (Admin Only)
              </p>
            </div>
          </div>

          <button
            onClick={fetchDevices}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 text-white w-full sm:w-auto"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            รีเฟรชข้อมูล
          </button>
        </div>

        {/* Clickable Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3.5 mt-4 sm:mt-6">
          {/* All */}
          <div 
            onClick={() => setFilterStatus('all')}
            className={`cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
              filterStatus === 'all'
                ? 'bg-white/15 border-white/40 shadow-md ring-2 ring-white/30'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-wider">อุปกรณ์ทั้งหมด</p>
            <p className="text-xl sm:text-2xl font-black mt-1 text-white">{stats.total}</p>
          </div>

          {/* Whitelisted */}
          <div 
            onClick={() => setFilterStatus(filterStatus === 'WHITELISTED' ? 'all' : 'WHITELISTED')}
            className={`cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
              filterStatus === 'WHITELISTED'
                ? 'bg-indigo-500/25 border-indigo-400/60 shadow-md ring-2 ring-indigo-400/40'
                : 'bg-indigo-500/10 border-indigo-400/20 hover:bg-indigo-500/20'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] text-indigo-300 font-bold uppercase tracking-wider">Whitelisted</p>
            <p className="text-xl sm:text-2xl font-black mt-1 text-indigo-400">{stats.whitelisted}</p>
          </div>

          {/* Locked */}
          <div 
            onClick={() => setFilterStatus(filterStatus === 'LOCKED' ? 'all' : 'LOCKED')}
            className={`cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
              filterStatus === 'LOCKED'
                ? 'bg-amber-500/25 border-amber-400/60 shadow-md ring-2 ring-amber-400/40'
                : 'bg-amber-500/10 border-amber-400/20 hover:bg-amber-500/20'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] text-amber-300 font-bold uppercase tracking-wider">ถูกล็อก / หน่วงเวลา</p>
            <p className="text-xl sm:text-2xl font-black mt-1 text-amber-400">{stats.locked}</p>
          </div>

          {/* Blacklisted */}
          <div 
            onClick={() => setFilterStatus(filterStatus === 'BLACKLISTED' ? 'all' : 'BLACKLISTED')}
            className={`cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
              filterStatus === 'BLACKLISTED'
                ? 'bg-rose-500/25 border-rose-400/60 shadow-md ring-2 ring-rose-400/40'
                : 'bg-rose-500/10 border-rose-400/20 hover:bg-rose-500/20'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] text-rose-300 font-bold uppercase tracking-wider">Blacklisted</p>
            <p className="text-xl sm:text-2xl font-black mt-1 text-rose-400">{stats.blacklisted}</p>
          </div>
        </div>
      </div>

      {/* 2. Filters & Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto scrollbar-none pb-0.5 sm:pb-0">
          {[
            { key: 'all', label: 'ทั้งหมด' },
            { key: 'WHITELISTED', label: '🛡️ Whitelisted' },
            { key: 'NORMAL', label: '🟢 ปกติ' },
            { key: 'LOCKED', label: '⏳ ถูกล็อก' },
            { key: 'BLACKLISTED', label: '⛔ Blacklisted' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 active:scale-95 ${
                filterStatus === tab.key
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา MAC, IP, พิกัด หรือสาเหตุ..."
            className="w-full pl-9 pr-3 py-2 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. Devices Container: Dual View */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        {/* Loading */}
        {loading && (
          <div className="py-12 text-center text-slate-400">
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl animate-spin">🔄</span>
              <span className="text-xs font-medium">กำลังโหลดรายการอุปกรณ์...</span>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && filteredDevices.length === 0 && (
          <div className="py-12 text-center text-slate-400">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">📭</span>
              <span className="text-xs sm:text-sm font-medium">ไม่พบข้อมูลอุปกรณ์ที่ตรงตามเงื่อนไข</span>
            </div>
          </div>
        )}

        {/* A. Mobile Cards View (block md:hidden) */}
        {!loading && filteredDevices.length > 0 && (
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {devicePaging.paged.map((d) => {
              const cfg = STATUS_CONFIG[d.status] || { label: d.status, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: '📄' };
              const isActioning = actionLoading === d.id;

              return (
                <div key={d.id} className="p-3.5 space-y-2.5 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  {/* Top: MAC + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm">🖥️</span>
                      <span className="font-mono font-bold text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-200 dark:border-purple-800 truncate">
                        {d.mac_address}
                      </span>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${cfg.color}`}>
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </span>
                  </div>

                  {/* Device / User info & Bot badge */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {d.device_name && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[11px] text-slate-700 dark:text-slate-300">
                        💻 {d.device_name}
                      </span>
                    )}
                    {d.last_user_name && (
                      <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px]">
                        👤 {d.last_user_name}
                      </span>
                    )}
                    {d.is_bot === 1 && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded font-bold border border-rose-200 dark:border-rose-800">
                        ⚠️ ตรวจพบ Bot/Script
                      </span>
                    )}
                  </div>

                  {/* IP & Location */}
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-200 font-semibold">
                      <span>🌐</span>
                      <span>{d.ip_address || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span>📍</span>
                      <span>{d.location || 'Bangkok, TH'}</span>
                    </div>
                  </div>

                  {/* Reason & Lock Time */}
                  {d.locked_reason && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-slate-400 dark:text-slate-500 mr-1">สาเหตุ:</span>
                      <span>{d.locked_reason}</span>
                    </div>
                  )}

                  {/* Failed Count & Lock Until & Timestamp */}
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        d.failed_attempts >= 7 
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300' 
                          : d.failed_attempts >= 5 
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' 
                          : d.failed_attempts > 0 
                          ? 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        ผิด {d.failed_attempts || 0} ครั้ง
                      </span>

                      {d.status === 'LOCKED_TEMP' && d.lock_until && (
                        <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px]">
                          ถึง {formatDate(d.lock_until).slice(11)}
                        </span>
                      )}
                    </div>

                    <span className="text-slate-400 text-[10px] font-mono">
                      🕒 {formatDate(d.updated_at || d.created_at)}
                    </span>
                  </div>

                  {/* Actions Bar */}
                  {canMaintain && (
                    <div className="flex items-center gap-1.5 pt-1">
                      {d.status !== 'WHITELISTED' && (
                        <button
                          onClick={() => handleWhitelist(d)}
                          disabled={isActioning}
                          className="flex-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold transition-all border border-indigo-200 dark:border-indigo-800 text-center active:scale-95 disabled:opacity-50"
                        >
                          🛡️ Whitelist
                        </button>
                      )}

                      {d.status !== 'BLACKLISTED' && (
                        <button
                          onClick={() => handleBlacklist(d)}
                          disabled={isActioning}
                          className="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold transition-all border border-rose-200 dark:border-rose-800 text-center active:scale-95 disabled:opacity-50"
                        >
                          ⛔ แบน
                        </button>
                      )}

                      <button
                        onClick={() => handleReset(d)}
                        disabled={isActioning}
                        className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                        title="รีเซ็ตจำนวนครั้งที่ผิด"
                      >
                        🔄 รีเซ็ต
                      </button>

                      <button
                        onClick={() => handleDelete(d)}
                        disabled={isActioning}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-xl transition-colors shrink-0"
                        title="ลบข้อมูล"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* B. Desktop Table View (hidden md:block) */}
        {!loading && filteredDevices.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">MAC Identifier</th>
                  <th className="py-3.5 px-4">IP & ตำแหน่งพิกัด</th>
                  <th className="py-3.5 px-3 text-center">ผิดพลาดสะสม</th>
                  <th className="py-3.5 px-4 text-center">สถานะ</th>
                  <th className="py-3.5 px-4">สาเหตุที่บันทึก</th>
                  <th className="py-3.5 px-4">อัปเดตล่าสุด</th>
                  {canMaintain && <th className="py-3.5 px-4 text-center">การจัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {devicePaging.paged.map((d) => {
                  const cfg = STATUS_CONFIG[d.status] || { label: d.status, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: '📄' };
                  const isActioning = actionLoading === d.id;

                  return (
                    <tr key={d.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      {/* MAC Address & Device Info */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>🖥️</span>
                          <span className="text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-100 dark:border-purple-800">
                            {d.mac_address}
                          </span>
                        </div>
                        {d.device_name && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans font-normal mt-1 flex items-center gap-1">
                            <span>💻</span> <span>{d.device_name}</span>
                          </div>
                        )}
                        {d.last_user_name && (
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-sans font-medium mt-0.5 flex items-center gap-1">
                            <span>👤</span> <span>{d.last_user_name}</span>
                          </div>
                        )}
                        {d.is_bot === 1 && (
                          <span className="inline-block mt-1 text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded font-semibold border border-rose-200 dark:border-rose-800">
                            ⚠️ ตรวจพบ Bot/Script
                          </span>
                        )}
                      </td>

                      {/* IP & Location */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-700 dark:text-slate-200 font-semibold">{d.ip_address || '-'}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <span>📍</span> {d.location || 'Bangkok, TH'}
                        </div>
                      </td>

                      {/* Failed attempts */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                          d.failed_attempts >= 7 
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300' 
                            : d.failed_attempts >= 5 
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' 
                            : d.failed_attempts > 0 
                            ? 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                          {d.failed_attempts || 0} ครั้ง
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold border ${cfg.color}`}>
                          <span>{cfg.icon}</span>
                          <span>{cfg.label}</span>
                        </span>
                        {d.status === 'LOCKED_TEMP' && d.lock_until && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-mono">
                            ล็อกถึง: {formatDate(d.lock_until)}
                          </div>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        <p className="text-slate-600 dark:text-slate-300 truncate" title={d.locked_reason}>
                          {d.locked_reason || '-'}
                        </p>
                      </td>

                      {/* Updated At */}
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap text-[11px] font-mono">
                        {formatDate(d.updated_at || d.created_at)}
                      </td>

                      {/* Actions */}
                      {canMaintain && (
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Whitelist */}
                            {d.status !== 'WHITELISTED' && (
                              <button
                                onClick={() => handleWhitelist(d)}
                                disabled={isActioning}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg font-bold transition-all border border-indigo-200 dark:border-indigo-800 text-xs"
                                title="อนุญาตและยกเว้นการตรวจสอบ (Whitelist)"
                              >
                                🛡️ Whitelist
                              </button>
                            )}

                            {/* Blacklist */}
                            {d.status !== 'BLACKLISTED' && (
                              <button
                                onClick={() => handleBlacklist(d)}
                                disabled={isActioning}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-lg font-bold transition-all border border-rose-200 dark:border-rose-800 text-xs"
                                title="แบนและระงับการเข้าถึงถาวร (Blacklist)"
                              >
                                ⛔ แบน
                              </button>
                            )}

                            {/* Reset to Normal */}
                            <button
                              onClick={() => handleReset(d)}
                              disabled={isActioning}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold transition-all text-xs"
                              title="รีเซ็ตจำนวนครั้งที่ผิดกลับเป็น 0"
                            >
                              🔄
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(d)}
                              disabled={isActioning}
                              className="p-1 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                              title="ลบข้อมูล"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {devicePaging.total > 0 && (
          <div className="px-4 py-1 border-t border-slate-100 dark:border-slate-800">
            <Pagination
              page={devicePaging.page}
              totalPages={devicePaging.totalPages}
              perPage={devicePaging.perPage}
              onPageChange={devicePaging.setPage}
              onPerPageChange={devicePaging.setPerPage}
              rangeStart={devicePaging.rangeStart}
              rangeEnd={devicePaging.rangeEnd}
              total={devicePaging.total}
              perPageOptions={[5, 10, 20, 50]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
