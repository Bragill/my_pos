import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { approvalsAPI } from '../services/api';
import { formatCurrency, formatDate, formatQty } from '../utils/format';
import { canMaintainModule } from '../utils/permissions';
import Pagination from '../components/Pagination';
import toast from 'react-hot-toast';

const getFirstDayOfMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DOC_TYPE_CONFIG = {
  sale_void: { label: 'ยกเลิกขาย (SO)', color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800', icon: '🧾' },
  po_cancel: { label: 'ยกเลิกสั่งซื้อ (PO)', color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800', icon: '📥' },
  goods_receipt: { label: 'ยกเลิกรับสินค้า (PO)', color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800', icon: '📥' },
  wo_cancel: { label: 'ยกเลิกสั่งผลิต (WO)', color: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800', icon: '🍳' },
  production_order: { label: 'ยกเลิกสั่งผลิต (WO)', color: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800', icon: '🍳' },
  stock_adjust: { label: 'ปรับยอดสต็อก', color: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800', icon: '⚖️' },
  device_unlock: { label: 'ปลดล็อกอุปกรณ์', color: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800', icon: '🔒' },
};

const STATUS_CONFIG = {
  PENDING: { label: 'รออนุมัติ', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800', dot: 'bg-amber-500 animate-ping' },
  APPROVED: { label: 'อนุมัติแล้ว', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800', dot: 'bg-emerald-500' },
  REJECTED: { label: 'ปฏิเสธ', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800', dot: 'bg-rose-500' },
};

export default function ApprovalsPage() {
  const { user } = useAuth();
  const canMaintain = canMaintainModule(user, 'approvals');

  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, pending_amount: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  // Filters (Default: 1st day of month to today)
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState(getFirstDayOfMonth);
  const [endDate, setEndDate] = useState(getTodayDate);
  const [search, setSearch] = useState('');

  // Selected item for Detail Modal
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Reject reason dialog state
  const [rejectDialog, setRejectDialog] = useState({ open: false, approvalId: null, reason: '' });

  const fetchApprovals = useCallback(async (page = 1, currentLimit = pagination.limit) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: currentLimit,
        status: statusFilter,
        type: typeFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search || undefined
      };
      const res = await approvalsAPI.getAll(params);
      if (res.data?.success) {
        setApprovals(res.data.data || []);
        if (res.data.summary) setSummary(res.data.summary);
        if (res.data.pagination) setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('[ApprovalsPage] fetch error:', err);
      toast.error('ไม่สามารถโหลดข้อมูลรายการอนุมัติได้');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, startDate, endDate, search, pagination.limit]);

  const handlePerPageChange = (newLimit) => {
    setPagination(prev => ({ ...prev, limit: newLimit, page: 1 }));
    fetchApprovals(1, newLimit);
  };

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(pagination.page * pagination.limit, pagination.total);

  useEffect(() => {
    fetchApprovals(1);
  }, [statusFilter, typeFilter, startDate, endDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchApprovals(1);
  };

  const handleApprove = async (approval) => {
    if (!window.confirm(`ยืนยันการอนุมัติคำขอ ${approval.document_id} หรือไม่?`)) return;
    setActionLoading(true);
    try {
      const res = await approvalsAPI.approve(approval.id);
      if (res.data?.success) {
        toast.success(res.data.message || 'อนุมัติคำขอเรียบร้อยแล้ว');
        setSelectedApproval(null);
        fetchApprovals(pagination.page);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการอนุมัติ');
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectDialog = (approval) => {
    setRejectDialog({ open: true, approvalId: approval.id, reason: '' });
  };

  const handleRejectConfirm = async () => {
    if (!rejectDialog.approvalId) return;
    setActionLoading(true);
    try {
      const res = await approvalsAPI.reject(rejectDialog.approvalId, { reason: rejectDialog.reason });
      if (res.data?.success) {
        toast.success(res.data.message || 'ปฏิเสธคำขอเรียบร้อยแล้ว');
        setRejectDialog({ open: false, approvalId: null, reason: '' });
        setSelectedApproval(null);
        fetchApprovals(pagination.page);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการปฏิเสธ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportExcel = async () => {
    const toastId = toast.loading('กำลังสร้างไฟล์รายงาน Excel...');
    try {
      // Fetch up to 200 items for export matching current filter
      const res = await approvalsAPI.getAll({
        page: 1,
        limit: 200,
        status: statusFilter,
        type: typeFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search || undefined
      });

      const list = res.data?.data || approvals;

      const excelRows = list.map((item, idx) => {
        const typeCfg = DOC_TYPE_CONFIG[item.document_type] || { label: item.document_type };
        const statusCfg = STATUS_CONFIG[item.status] || { label: item.status };
        const items = item.payload?.items || [];
        const itemsSummary = items.length > 0 
          ? items.map(i => `${i.product_name || i.name || 'สินค้า'} x${i.quantity || 1} ${i.unit || ''}`).join(', ')
          : '-';

        return {
          'ลำดับ': idx + 1,
          'วันที่ขอ': formatDate(item.created_at),
          'ประเภทเอกสาร': typeCfg.label,
          'เลขที่เอกสาร': item.document_id,
          'ผู้ขออนุมัติ': item.requester_name || '-',
          'เหตุผล': item.reason || '-',
          'ยอดเงิน / ผลกระทบ (บาท)': Number(item.amount) || 0,
          'สถานะ': statusCfg.label,
          'ผู้อนุมัติ': item.approver_name || '-',
          'วันที่ตอบกลับ': item.responded_at ? formatDate(item.responded_at) : '-',
          'รายการสินค้า': itemsSummary
        };
      });

      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Approval_Logs');

      // Auto-fit column widths
      const colWidths = [
        { wch: 6 },  // ลำดับ
        { wch: 22 }, // วันที่ขอ
        { wch: 18 }, // ประเภท
        { wch: 22 }, // เลขที่เอกสาร
        { wch: 16 }, // ผู้ขอ
        { wch: 30 }, // เหตุผล
        { wch: 18 }, // ยอดเงิน
        { wch: 14 }, // สถานะ
        { wch: 16 }, // ผู้อนุมัติ
        { wch: 22 }, // วันที่ตอบกลับ
        { wch: 40 }, // รายการสินค้า
      ];
      worksheet['!cols'] = colWidths;

      const filename = `approval_logs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, filename);
      toast.success('ดาวน์โหลดไฟล์ Excel สำเร็จ', { id: toastId });
    } catch (err) {
      console.error('Export Excel failed:', err);
      toast.error('ไม่สามารถส่งออกไฟล์ Excel ได้', { id: toastId });
    }
  };

  return (
    <div className="p-3 sm:p-6 pb-24 sm:pb-8 max-w-7xl mx-auto space-y-4 sm:space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 sm:gap-3.5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center text-xl sm:text-2xl shadow-md shadow-purple-200 dark:shadow-none shrink-0">
            🛡️
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight">ประวัติและรายการขออนุมัติ</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              ตรวจสอบรายการขอยกเลิกบิล SO / PO / WO / ปลดล็อกอุปกรณ์ และอนุมัติผ่านเว็บ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => fetchApprovals(pagination.page)}
            disabled={loading}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium text-xs sm:text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <span className={`text-sm sm:text-base ${loading ? 'animate-spin' : ''}`}>🔄</span>
            รีเฟรช
          </button>
          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm transition-all shadow-sm shadow-emerald-200 dark:shadow-none active:scale-95"
          >
            <span className="text-sm sm:text-base">📊</span>
            Export Excel
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Pending Card */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'all' : 'PENDING')}
          className={`cursor-pointer p-3 sm:p-4 rounded-2xl sm:rounded-3xl border transition-all duration-200 active:scale-[0.98] ${
            statusFilter === 'PENDING' 
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 shadow-md ring-2 ring-amber-400/40' 
              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-800 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">รอการอนุมัติ</span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs sm:text-sm font-bold">
              ⏳
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            {summary.pending} <span className="text-xs sm:text-sm font-normal text-slate-500 dark:text-slate-400">รายการ</span>
          </div>
          <div className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-400 font-semibold mt-1 truncate">
            ยอดรวม: {formatCurrency(summary.pending_amount)}
          </div>
        </div>

        {/* Approved Card */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'APPROVED' ? 'all' : 'APPROVED')}
          className={`cursor-pointer p-3 sm:p-4 rounded-2xl sm:rounded-3xl border transition-all duration-200 active:scale-[0.98] ${
            statusFilter === 'APPROVED' 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 shadow-md ring-2 ring-emerald-400/40' 
              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">อนุมัติแล้ว</span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs sm:text-sm font-bold">
              ✅
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            {summary.approved} <span className="text-xs sm:text-sm font-normal text-slate-500 dark:text-slate-400">รายการ</span>
          </div>
          <div className="text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-1 truncate">ดำเนินการเสร็จสิ้น</div>
        </div>

        {/* Rejected Card */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'REJECTED' ? 'all' : 'REJECTED')}
          className={`cursor-pointer p-3 sm:p-4 rounded-2xl sm:rounded-3xl border transition-all duration-200 active:scale-[0.98] ${
            statusFilter === 'REJECTED' 
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 shadow-md ring-2 ring-rose-400/40' 
              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-800 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">ปฏิเสธคำขอ</span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center justify-center text-xs sm:text-sm font-bold">
              ❌
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            {summary.rejected} <span className="text-xs sm:text-sm font-normal text-slate-500 dark:text-slate-400">รายการ</span>
          </div>
          <div className="text-[10px] sm:text-xs text-rose-700 dark:text-rose-400 font-medium mt-1 truncate">คืนสถานะเดิม</div>
        </div>

        {/* Total Card */}
        <div 
          onClick={() => setStatusFilter('all')}
          className={`cursor-pointer p-3 sm:p-4 rounded-2xl sm:rounded-3xl border transition-all duration-200 active:scale-[0.98] ${
            statusFilter === 'all' 
              ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-md ring-2 ring-indigo-400/40' 
              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">คำขอทั้งหมด</span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs sm:text-sm font-bold">
              📁
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            {summary.total} <span className="text-xs sm:text-sm font-normal text-slate-500 dark:text-slate-400">รายการ</span>
          </div>
          <div className="text-[10px] sm:text-xs text-indigo-700 dark:text-indigo-400 font-medium mt-1 truncate">ประวัติในระบบ</div>
        </div>
      </div>

      {/* 3. Toolbar & Filters */}
      <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-3 sm:space-y-4">
        {/* Row 1: Type Filter + Date Range */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          {/* Type Filter */}
          <div className="w-full sm:w-48">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              <option value="all">📂 ประเภทเอกสาร (ทั้งหมด)</option>
              <option value="sale_void">🧾 ยกเลิกขาย (SO)</option>
              <option value="po_cancel">📥 ยกเลิกสั่งซื้อ (PO)</option>
              <option value="wo_cancel">🍳 ยกเลิกสั่งผลิต (WO)</option>
              <option value="stock_adjust">⚖️ ปรับยอดสต็อก</option>
              <option value="device_unlock">🔒 ปลดล็อกอุปกรณ์</option>
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 w-full sm:w-auto">
            <span className="text-[11px] sm:text-xs">จาก</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 sm:flex-initial min-w-[120px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-400 focus:outline-none"
            />
            <span className="text-[11px] sm:text-xs">ถึง</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 sm:flex-initial min-w-[120px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-400 focus:outline-none"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline px-1 font-bold whitespace-nowrap"
                title="ดูประวัติทั้งหมดโดยไม่จำกัดช่วงเวลา"
              >
                ดูทั้งหมด
              </button>
            )}
            {(!startDate && !endDate) && (
              <button
                onClick={() => { setStartDate(getFirstDayOfMonth()); setEndDate(getTodayDate()); }}
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline px-1 font-bold whitespace-nowrap"
                title="เลือกวันที่ 1 ถึงปัจจุบันของเดือนนี้"
              >
                เดือนนี้
              </button>
            )}
          </div>
        </div>

        {/* Row 3: Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขที่เอกสาร, ผู้ขอ, ผู้อนุมัติ, เหตุผล..."
              className="w-full pl-9 pr-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold transition-all shrink-0 active:scale-95 shadow-sm"
          >
            ค้นหา
          </button>
        </form>
      </div>

      {/* 4. Approvals Content: Mobile Cards (block md:hidden) + Desktop Table (hidden md:block) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        {/* Loading State */}
        {loading && (
          <div className="py-12 text-center text-slate-400">
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl animate-spin">🔄</span>
              <span className="text-xs font-medium">กำลังโหลดรายการ...</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && approvals.length === 0 && (
          <div className="py-12 text-center text-slate-400">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">📭</span>
              <span className="text-xs sm:text-sm font-medium">ไม่พบข้อมูลคำขออนุมัติที่ตรงตามเงื่อนไข</span>
            </div>
          </div>
        )}

        {/* A. Mobile Cards View (block md:hidden) */}
        {!loading && approvals.length > 0 && (
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {approvals.map((app) => {
              const typeCfg = DOC_TYPE_CONFIG[app.document_type] || {
                label: app.document_type,
                color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                icon: '📄'
              };
              const statusCfg = STATUS_CONFIG[app.status] || {
                label: app.status,
                color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              };
              const isPending = app.status === 'PENDING';
              const itemCount = app.payload?.items?.length || 0;

              return (
                <div 
                  key={app.id} 
                  className={`p-3.5 space-y-2.5 transition-colors ${
                    isPending ? 'bg-amber-50/30 dark:bg-amber-950/10' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  {/* Top Bar: Doc Type + ID + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border ${typeCfg.color}`}>
                        <span>{typeCfg.icon}</span>
                        <span className="truncate">{typeCfg.label}</span>
                      </span>
                      <span className="font-mono font-bold text-xs text-purple-700 dark:text-purple-300 truncate">
                        #{app.document_id}
                      </span>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${statusCfg.color}`}>
                      {statusCfg.dot && <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />}
                      <span>{statusCfg.label}</span>
                    </span>
                  </div>

                  {/* Requester & Date */}
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                      <span>👤 ผู้ขอ:</span>
                      <span className="font-semibold">{app.requester_name || 'Staff'}</span>
                    </div>
                    <div className="font-mono text-[11px]">
                      🕒 {formatDate(app.created_at)}
                    </div>
                  </div>

                  {/* Reason (if available) */}
                  {app.reason && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-slate-400 dark:text-slate-500 mr-1">เหตุผล:</span>
                      <span>{app.reason}</span>
                    </div>
                  )}

                  {/* Amount / Impact & Items count */}
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <div>
                      {itemCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          📦 {itemCount} รายการสินค้า
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </div>
                    <div className="text-right">
                      {app.amount > 0 ? (
                        <span className="font-black text-sm text-purple-600 dark:text-purple-400 font-mono">
                          {formatCurrency(app.amount)}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </div>
                  </div>

                  {/* Approver Stamp (if responded) */}
                  {app.approver_name && (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <span>👮 ผู้อนุมัติ: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{app.approver_name}</strong></span>
                      {app.responded_at && <span>({formatDate(app.responded_at)})</span>}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setSelectedApproval(app)}
                      className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1 active:scale-95"
                    >
                      <span>👁️</span> ดูรายละเอียด
                    </button>

                    {isPending && canMaintain && (
                      <>
                        <button
                          onClick={() => openRejectDialog(app)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          ปฏิเสธ
                        </button>
                        <button
                          onClick={() => handleApprove(app)}
                          disabled={actionLoading}
                          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          อนุมัติ
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* B. Desktop Table View (hidden md:block) */}
        {!loading && approvals.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">วัน-เวลาที่ขอ</th>
                  <th className="py-3.5 px-3">ประเภทเอกสาร</th>
                  <th className="py-3.5 px-4">เลขที่เอกสาร</th>
                  <th className="py-3.5 px-4">ผู้ขออนุมัติ</th>
                  <th className="py-3.5 px-4 min-w-[220px]">เหตุผล</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">ยอดเงิน / ผลกระทบ</th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap">สถานะ</th>
                  <th className="py-3.5 px-4 min-w-[180px]">ผู้อนุมัติ</th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap min-w-[100px]">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {approvals.map((app) => {
                  const typeCfg = DOC_TYPE_CONFIG[app.document_type] || {
                    label: app.document_type,
                    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                    icon: '📄'
                  };
                  const statusCfg = STATUS_CONFIG[app.status] || {
                    label: app.status,
                    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  };
                  const isPending = app.status === 'PENDING';

                  return (
                    <tr 
                      key={app.id} 
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                        isPending ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Created At */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {formatDate(app.created_at)}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${typeCfg.color}`}>
                          <span>{typeCfg.icon}</span>
                          <span>{typeCfg.label}</span>
                        </span>
                      </td>

                      {/* Document ID */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-purple-700 dark:text-purple-300 text-xs">
                          {app.document_id}
                        </span>
                      </td>

                      {/* Requester */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{app.requester_name || 'Staff'}</div>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4 min-w-[220px] max-w-[320px]">
                        <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-relaxed" title={app.reason}>
                          {app.reason || '-'}
                        </p>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-bold text-slate-800 dark:text-slate-200 text-xs">
                        {app.amount > 0 ? formatCurrency(app.amount) : '-'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusCfg.color}`}>
                          {statusCfg.dot && <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />}
                          <span>{statusCfg.label}</span>
                        </span>
                      </td>

                      {/* Approver & Responded */}
                      <td className="py-3.5 px-4 min-w-[180px]">
                        {app.approver_name ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{app.approver_name}</div>
                            {app.responded_at && (
                              <div className="text-[11px] text-slate-400 dark:text-slate-400 whitespace-nowrap">{formatDate(app.responded_at)}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedApproval(app)}
                            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-xl transition-all"
                            title="ดูรายละเอียดสินค้า"
                          >
                            👁️
                          </button>

                          {isPending && canMaintain && (
                            <>
                              <button
                                onClick={() => handleApprove(app)}
                                disabled={actionLoading}
                                className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                title="อนุมัติทันที"
                              >
                                อนุมัติ
                              </button>
                              <button
                                onClick={() => openRejectDialog(app)}
                                disabled={actionLoading}
                                className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                title="ปฏิเสธคำขอ"
                              >
                                ปฏิเสธ
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.total > 0 && (
          <div className="px-4 sm:px-6 border-t border-slate-100 dark:border-slate-800">
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              perPage={pagination.limit}
              onPageChange={(p) => fetchApprovals(p)}
              onPerPageChange={handlePerPageChange}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              total={pagination.total}
              perPageOptions={[5, 10, 20, 50, 100]}
            />
          </div>
        )}
      </div>

      {/* 5. Detail Modal with Itemized Breakdown */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-100 dark:border-slate-800">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xl shrink-0">
                  {DOC_TYPE_CONFIG[selectedApproval.document_type]?.icon || '📄'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm sm:text-base flex items-center gap-2">
                    <span>{DOC_TYPE_CONFIG[selectedApproval.document_type]?.label || selectedApproval.document_type}</span>
                    <span className="font-mono text-purple-600 dark:text-purple-400">#{selectedApproval.document_id}</span>
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500">
                    ขอเมื่อ {formatDate(selectedApproval.created_at)} โดย {selectedApproval.requester_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedApproval(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-sm font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
              {/* Status and Reason Banner */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-500 dark:text-slate-400">สถานะคำขอ:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${STATUS_CONFIG[selectedApproval.status]?.color}`}>
                    {STATUS_CONFIG[selectedApproval.status]?.label || selectedApproval.status}
                  </span>
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-200">
                  <span className="font-bold text-slate-500 dark:text-slate-400">เหตุผลที่ขอ: </span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{selectedApproval.reason || 'ไม่ได้ระบุ'}</span>
                </div>
                {selectedApproval.approver_name && (
                  <div className="text-xs text-slate-700 dark:text-slate-300 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="font-bold text-slate-500 dark:text-slate-400">ดำเนินการโดย: </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedApproval.approver_name}</span>
                    {selectedApproval.responded_at && (
                      <span className="text-slate-400 dark:text-slate-500 ml-1">เมื่อ {formatDate(selectedApproval.responded_at)}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Itemized Table Breakdown */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span>📋</span> รายการสินค้า / วัตถุดิบในเอกสาร
                </h4>

                {selectedApproval.payload?.items && selectedApproval.payload.items.length > 0 ? (
                  <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-3">ลำดับ</th>
                          <th className="py-2.5 px-3">รายการ</th>
                          <th className="py-2.5 px-3 text-right">จำนวน</th>
                          <th className="py-2.5 px-3 text-right">ราคา/ต้นทุน</th>
                          <th className="py-2.5 px-3 text-right">รวม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-200">
                        {selectedApproval.payload.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-100">
                              {item.product_name || item.name || 'สินค้า'}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {formatQty(item.quantity || 1)} {item.unit || ''}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {formatCurrency(item.unit_price || item.cost_per_unit || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-800 dark:text-white">
                              {formatCurrency(item.line_total || item.total_cost || ((item.quantity || 1) * (item.unit_price || 0)))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                    ไม่มีรายละเอียดรายการสินค้าแนบมาในคำขอนี้
                  </div>
                )}
              </div>

              {/* Total Summary */}
              {selectedApproval.amount > 0 && (
                <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 text-sm">
                  <span className="font-bold text-purple-900 dark:text-purple-300">ยอดรวมผลกระทบทั้งสิ้น:</span>
                  <span className="font-black text-base sm:text-lg text-purple-700 dark:text-purple-400">
                    {formatCurrency(selectedApproval.amount)}
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-3.5 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 bg-slate-50/50 dark:bg-slate-800/40">
              <button
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all"
              >
                ปิดหน้าต่าง
              </button>

              {selectedApproval.status === 'PENDING' && canMaintain && (
                <>
                  <button
                    onClick={() => openRejectDialog(selectedApproval)}
                    disabled={actionLoading}
                    className="px-4 sm:px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md shadow-rose-200 dark:shadow-none disabled:opacity-50 active:scale-95"
                  >
                    ❌ ปฏิเสธคำขอ
                  </button>
                  <button
                    onClick={() => handleApprove(selectedApproval)}
                    disabled={actionLoading}
                    className="px-4 sm:px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-200 dark:shadow-none disabled:opacity-50 active:scale-95"
                  >
                    ✅ อนุมัติคำขอ
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Reject Reason Dialog */}
      {rejectDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-100 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span>⚠️</span> ระบุเหตุผลการปฏิเสธคำขอ
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              คำขอนี้จะถูกยกเลิก และสถานะเอกสารจะถูกคืนค่ากลับเป็นปกติ
            </p>
            <textarea
              rows="3"
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog({ ...rejectDialog, reason: e.target.value })}
              placeholder="กรอกเหตุผลที่ปฏิเสธ (ไม่บังคับ)..."
              className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRejectDialog({ open: false, approvalId: null, reason: '' })}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-200 dark:shadow-none active:scale-95 disabled:opacity-50"
              >
                {actionLoading ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
