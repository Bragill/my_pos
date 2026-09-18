import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { formatCurrency, formatDate, exportToExcel, EXCEL_COLUMNS } from '../utils/format';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { canMaintainModule } from '../utils/permissions';
import Pagination from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';

export default function SalesHistoryPage() {
    const { user } = useAuth();
    const canMaintain = canMaintainModule(user, 'sales');
    const [activeTab, setActiveTab] = useState('so'); // 'so' | 'po'
    
    // SO state
    const [sales, setSales] = useState([]);
    const [loadingSales, setLoadingSales] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showDetailModal, setShowOrderModal] = useState(false);
    const [showVoidModal, setShowVoidModal] = useState(false);
    const [voidReason, setVoidReason] = useState("");
    const [voiding, setVoiding] = useState(false);

    // PO state
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [loadingPO, setLoadingPO] = useState(false);
    const [selectedPO, setSelectedPO] = useState(null);
    const [showPODetailModal, setShowPODetailModal] = useState(false);
    const [loadingPODetail, setLoadingPODetail] = useState(false);
    const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null);

    // Helper to get first day of current month and today's date in local time
    const getInitialDateRange = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return {
            startDate: `${year}-${month}-01`,
            endDate: `${year}-${month}-${day}`
        };
    };

    const initialDates = getInitialDateRange();

    // Filters
    const [filters, setFilters] = useState({
        startDate: initialDates.startDate,
        endDate: initialDates.endDate,
        status: "",
        paymentMethod: "",
        search: ""
    });

    // Table pagination (page resets on new tab / filter result)
    const filterKey = [activeTab, filters.startDate, filters.endDate, filters.status, filters.paymentMethod, filters.search].join('|');
    const salesPaging = usePagination(sales, 20, filterKey);
    const poPaging = usePagination(purchaseOrders, 20, filterKey);

    const hasPendingSales = useMemo(() => sales.some(s => s.status === 'รออนุมัติ'), [sales]);
    const hasPendingPO = useMemo(() => purchaseOrders.some(p => p.status === 'รออนุมัติ'), [purchaseOrders]);

    useEffect(() => {
        if (activeTab === 'so' && hasPendingSales) {
            const interval = setInterval(() => {
                fetchSales();
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [activeTab, hasPendingSales]);

    useEffect(() => {
        if (activeTab === 'po' && hasPendingPO) {
            const interval = setInterval(() => {
                fetchPurchaseOrders();
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [activeTab, hasPendingPO]);

    useEffect(() => {
        if (activeTab === 'so') {
            fetchSales();
        } else {
            fetchPurchaseOrders();
        }
    }, [activeTab, filters.startDate, filters.endDate, filters.status, filters.paymentMethod]);

    const fetchSales = async () => {
        setLoadingSales(true);
        try {
            const res = await api.get('/sales/history', { params: filters });
            setSales(res.data.data || []);
        } catch (err) {
            toast.error("โหลดข้อมูลรายการขายไม่สำเร็จ");
        } finally {
            setLoadingSales(false);
        }
    };

    const fetchPurchaseOrders = async () => {
        setLoadingPO(true);
        try {
            const res = await api.get('/inventory/purchase-orders', { params: filters });
            setPurchaseOrders(res.data.data || []);
        } catch (err) {
            toast.error("โหลดข้อมูลรายการสั่งซื้อ/รับเข้า (PO) ไม่สำเร็จ");
        } finally {
            setLoadingPO(false);
        }
    };

    const [exportingExcel, setExportingExcel] = useState(false);

    const handleExportExcel = async (exportType = activeTab) => {
        setExportingExcel(true);
        const toastId = toast.loading(`กำลังดึงข้อมูลและสร้างไฟล์ Excel (${exportType.toUpperCase()} Items)...`);
        try {
            const params = {
                type: exportType,
                startDate: filters.startDate,
                endDate: filters.endDate,
                status: filters.status
            };
            const res = await api.get('/reports/export-items', { params });
            const data = res.data?.data || {};

            const sheets = [];
            const dateSuffix = `${filters.startDate || 'all'}_to_${filters.endDate || 'all'}`;

            if ((exportType === 'so' || exportType === 'all') && data.so) {
                sheets.push({
                    sheetName: 'รายการขาย (SO Items)',
                    data: data.so,
                    columns: EXCEL_COLUMNS.SO_ITEMS
                });
            }
            if ((exportType === 'po' || exportType === 'all') && data.po) {
                sheets.push({
                    sheetName: 'รายการรับเข้า (PO Items)',
                    data: data.po,
                    columns: EXCEL_COLUMNS.PO_ITEMS
                });
            }

            if (sheets.length === 0) {
                toast.error("ไม่พบข้อมูลที่จะส่งออกในช่วงเวลาที่เลือก", { id: toastId });
                return;
            }

            const filename = exportType === 'all' 
                ? `POS_Sales_and_Purchases_${dateSuffix}.xlsx`
                : `${exportType.toUpperCase()}_Items_${dateSuffix}.xlsx`;

            await exportToExcel({ filename, sheets });
            toast.success(`ดาวน์โหลดไฟล์ Excel (${filename}) สำเร็จ! 🎉`, { id: toastId });
        } catch (err) {
            console.error("Export excel error:", err);
            toast.error(err.response?.data?.message || err.message || "เกิดข้อผิดพลาดในการส่งออก Excel", { id: toastId });
        } finally {
            setExportingExcel(false);
        }
    };

    const handleSearch = (e) => {
        if (e.key === 'Enter') {
            if (activeTab === 'so') fetchSales();
            else fetchPurchaseOrders();
        }
    };

    const triggerSearch = () => {
        if (activeTab === 'so') fetchSales();
        else fetchPurchaseOrders();
    };

    const viewSODetail = async (id) => {
        try {
            const res = await api.get(`/sales/${id}`);
            setSelectedOrder(res.data.data);
            setShowOrderModal(true);
        } catch (err) {
            toast.error("โหลดรายละเอียดออเดอร์ไม่สำเร็จ");
        }
    };

    const viewPODetail = async (id) => {
        setLoadingPODetail(true);
        try {
            const res = await api.get(`/inventory/purchase-orders/${id}`);
            setSelectedPO(res.data.data);
            setShowPODetailModal(true);
        } catch (err) {
            toast.error("โหลดรายละเอียดใบสั่งซื้อ (PO) ไม่สำเร็จ");
        } finally {
            setLoadingPODetail(false);
        }
    };

    const [requestingLineApproval, setRequestingLineApproval] = useState(false);
    const [lineApprovalStatus, setLineApprovalStatus] = useState(null); // 'PENDING' | 'APPROVED' | 'REJECTED'
    const [cancelingPO, setCancelingPO] = useState(false);
    const [showCancelPOModal, setShowCancelPOModal] = useState(false);
    const [poCancelReason, setPoCancelReason] = useState('');
    const [lineStoreRequired, setLineStoreRequired] = useState(false);

    // Check if store requires LINE approval
    useEffect(() => {
        const checkRequirement = async () => {
            try {
                const res = await api.get('/approvals/check-store-requirement');
                setLineStoreRequired(Boolean(res.data?.required));
            } catch (_) {
                setLineStoreRequired(false);
            }
        };
        checkRequirement();
    }, []);

    const pollApproval = (approvalId, onSuccess, onReject) => {
        const pollInterval = setInterval(async () => {
            try {
                const checkRes = await api.get(`/approvals/${approvalId}`);
                const status = checkRes.data?.data?.status;
                if (status === 'APPROVED') {
                    clearInterval(pollInterval);
                    setLineApprovalStatus('APPROVED');
                    if (onSuccess) onSuccess();
                } else if (status === 'REJECTED') {
                    clearInterval(pollInterval);
                    setLineApprovalStatus('REJECTED');
                    if (onReject) onReject();
                }
            } catch (pollErr) {
                console.warn('Polling approval status error:', pollErr);
            }
        }, 2500);
        return pollInterval;
    };

    const handleVoid = async () => {
        if (!canMaintain) return toast.error("คุณไม่มีสิทธิ์ยกเลิกรายการขาย");
        if (!voidReason.trim()) return toast.error("กรุณาระบุเหตุผลในการยกเลิก");
        setVoiding(true);
        try {
            const res = await api.post(`/sales/${selectedOrder.id}/void`, { reason: voidReason });
            
            if (res.data?.requires_approval) {
                // Store has LINE configured: wait for manager approval
                setRequestingLineApproval(true);
                setLineApprovalStatus('PENDING');
                setSelectedOrder(prev => prev ? ({ ...prev, status: 'รออนุมัติ' }) : null);
                toast.success("ส่งคำขออนุมัติไปยัง LINE แล้ว กำลังรอผู้จัดการอนุมัติ 💬 (หน้าต่างจะปิดใน 3 วินาที)", { duration: 4000 });

                // Automatic close modal in 3s and update table to 'รออนุมัติ'
                setTimeout(() => {
                    setShowVoidModal(false);
                    setShowOrderModal(false);
                    setRequestingLineApproval(false);
                    setLineApprovalStatus(null);
                    setVoiding(false);
                    fetchSales();
                }, 3000);

                const approvalId = res.data?.data?.id;
                if (approvalId) {
                    pollApproval(
                        approvalId,
                        () => {
                            toast.success(`ผู้จัดการอนุมัติการยกเลิกบิล #${selectedOrder.order_no} แล้ว! 🎉`);
                            fetchSales();
                        },
                        () => {
                            toast.error(`คำขอยกเลิกบิล #${selectedOrder.order_no} ถูกปฏิเสธ ❌`);
                            fetchSales();
                        }
                    );
                }
            } else {
                // Direct cancel (No LINE configured)
                toast.success("ยกเลิกรายการขายและคืนสต๊อกสำเร็จ 🎉");
                setShowVoidModal(false);
                setShowOrderModal(false);
                fetchSales();
                setVoiding(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || err.response?.data?.error?.message || "เกิดข้อผิดพลาด");
            setVoiding(false);
            setRequestingLineApproval(false);
            setLineApprovalStatus(null);
        }
    };

    const handleCancelPO = async () => {
        if (!canMaintain) return toast.error("คุณไม่มีสิทธิ์ยกเลิกใบรับสินค้า");
        if (!poCancelReason.trim()) return toast.error("กรุณาระบุเหตุผลในการยกเลิกใบรับสินค้า");
        setCancelingPO(true);
        try {
            const res = await api.post(`/inventory/purchase-orders/${selectedPO.id}/cancel`, { reason: poCancelReason });

            if (res.data?.requires_approval) {
                setRequestingLineApproval(true);
                setLineApprovalStatus('PENDING');
                setSelectedPO(prev => prev ? ({ ...prev, status: 'รออนุมัติ' }) : null);
                toast.success("ส่งคำขออนุมัติยกเลิก PO ไปยัง LINE แล้ว กำลังรอผู้จัดการอนุมัติ 💬 (หน้าต่างจะปิดใน 3 วินาที)", { duration: 4000 });

                // Automatic close modal in 3s and update table to 'รออนุมัติ'
                setTimeout(() => {
                    setShowCancelPOModal(false);
                    setShowPODetailModal(false);
                    setRequestingLineApproval(false);
                    setLineApprovalStatus(null);
                    setCancelingPO(false);
                    fetchPurchaseOrders();
                }, 3000);

                const approvalId = res.data?.data?.id;
                if (approvalId) {
                    pollApproval(
                        approvalId,
                        () => {
                            toast.success(`ผู้จัดการอนุมัติการยกเลิกใบรับสินค้า #${selectedPO.po_number} แล้ว! 🎉`);
                            fetchPurchaseOrders();
                        },
                        () => {
                            toast.error(`คำขอยกเลิกใบรับสินค้า #${selectedPO.po_number} ถูกปฏิเสธ ❌`);
                            fetchPurchaseOrders();
                        }
                    );
                }
            } else {
                toast.success("ยกเลิกใบรับสินค้าและหักคืนสต็อกสำเร็จ 🎉");
                setShowCancelPOModal(false);
                setShowPODetailModal(false);
                fetchPurchaseOrders();
                setCancelingPO(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || err.response?.data?.error?.message || "ยกเลิกใบรับสินค้าไม่สำเร็จ");
            setCancelingPO(false);
            setRequestingLineApproval(false);
            setLineApprovalStatus(null);
        }
    };

    const StatusBadge = ({ status }) => {
        const colors = {
            'completed': 'bg-green-100 text-green-700 border-green-200',
            'สำเร็จ': 'bg-green-100 text-green-700 border-green-200',
            'pending': 'bg-amber-100 text-amber-700 border-amber-200',
            'รออนุมัติ': 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse font-bold',
            'pending_approval': 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse font-bold',
            'ยกเลิกแล้ว': 'bg-red-100 text-red-700 border-red-200',
            'cancelled': 'bg-red-100 text-red-700 border-red-200',
            'outstanding': 'bg-amber-100 text-amber-700 border-amber-200',
            'รอชำระพร้อมเพย์': 'bg-blue-100 text-blue-700 border-blue-200'
        };
        const labels = {
            'completed': 'สำเร็จ',
            'สำเร็จ': 'สำเร็จ',
            'pending': 'รอดำเนินการ',
            'รออนุมัติ': '⏳ รออนุมัติ',
            'pending_approval': '⏳ รออนุมัติ',
            'ยกเลิกแล้ว': 'ยกเลิกแล้ว',
            'cancelled': 'ยกเลิกแล้ว',
            'outstanding': 'ค้างชำระ',
            'รอชำระพร้อมเพย์': 'รอชำระพร้อมเพย์'
        };
        return <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${colors[status] || 'bg-gray-100 text-gray-700'}`}>{labels[status] || status}</span>;
    };

    const getPaymentMethodLabel = (method) => {
        const methods = {
            'cash': '💵 เงินสด',
            'credit_card': '💳 บัตรเครดิต',
            'qr_promptpay': '📱 PromptPay',
            'outstanding': '⏳ ค้างชำระ'
        };
        return methods[method] || method || 'เงินสด';
    };

    return (
        <div className="p-3 sm:p-5 md:p-8 max-w-7xl mx-auto space-y-3.5 sm:space-y-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg sm:text-2xl font-black text-gray-800 dark:text-slate-100 flex items-center gap-2">
                        <span>📜 ประวัติการซื้อ/ขาย</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-full font-mono">
                            SO & PO
                        </span>
                    </h1>
                    <p className="text-gray-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
                        ตรวจสอบ ค้นหา และติดตามรายการขายสินค้า (SO) และรายการสั่งซื้อ/รับเข้าวัตถุดิบ (PO)
                    </p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-72">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                        <input 
                            type="text" 
                            placeholder={activeTab === 'so' ? "เลขที่ใบเสร็จ / ชื่อลูกค้า..." : "เลขที่ PO / หมายเหตุ / ผู้รับ..."} 
                            className="input-field !pl-9 text-xs sm:text-sm w-full !py-2 sm:!py-2.5"
                            value={filters.search}
                            onChange={e => setFilters({...filters, search: e.target.value})}
                            onKeyDown={handleSearch}
                        />
                        {filters.search && (
                            <button
                                onClick={() => { setFilters({...filters, search: ""}); triggerSearch(); }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <button onClick={triggerSearch} className="btn-primary flex items-center gap-1 text-xs sm:text-sm !px-4 shrink-0">
                        <span>ค้นหา</span>
                    </button>
                </div>
            </header>

            {/* Tab Switcher - Responsive Segmented Pills */}
            <div className="grid grid-cols-2 p-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl gap-1 border border-purple-100/60 dark:border-slate-700 shadow-xs">
                <button
                    onClick={() => setActiveTab('so')}
                    className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                        activeTab === 'so'
                            ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                            : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100/60 dark:hover:bg-slate-700/60'
                    }`}
                >
                    <span>🛍️</span>
                    <span className="truncate">ขายหน้าร้าน (SO)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'so' ? 'bg-purple-800 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'}`}>
                        {sales.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('po')}
                    className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                        activeTab === 'po'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                            : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100/60 dark:hover:bg-slate-700/60'
                    }`}
                >
                    <span>📦</span>
                    <span className="truncate">รับเข้า (PO)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'po' ? 'bg-emerald-800 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'}`}>
                        {purchaseOrders.length}
                    </span>
                </button>
            </div>

            {/* Filters Row - Responsive 2x2 grid on mobile, 4 columns on desktop */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-3 sm:p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-slate-800">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider ml-1">ตั้งแต่วันที่</label>
                        <input type="date" className="input-field !py-1.5 sm:!py-2 text-xs" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider ml-1">ถึงวันที่</label>
                        <input type="date" className="input-field !py-1.5 sm:!py-2 text-xs" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
                    </div>
                    {activeTab === 'so' && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider ml-1">สถานะ</label>
                            <select className="input-field !py-1.5 sm:!py-2 text-xs" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                                <option value="">ทั้งหมด</option>
                                <option value="completed">สำเร็จ</option>
                                <option value="รออนุมัติ">⏳ รออนุมัติ</option>
                                <option value="ยกเลิกแล้ว">ยกเลิกแล้ว</option>
                                <option value="รอชำระพร้อมเพย์">รอชำระพร้อมเพย์</option>
                            </select>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider ml-1">ช่องทางชำระ</label>
                        <select className="input-field !py-1.5 sm:!py-2 text-xs" value={filters.paymentMethod} onChange={e => setFilters({...filters, paymentMethod: e.target.value})}>
                            <option value="">ทั้งหมด</option>
                            <option value="cash">เงินสด</option>
                            <option value="credit_card">บัตรเครดิต</option>
                            <option value="qr_promptpay">PromptPay</option>
                            <option value="outstanding">ค้างชำระ</option>
                        </select>
                    </div>
                </div>

                {/* Excel Download Bar */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                        <span>📊 ส่งออกข้อมูลระดับรายการสินค้า (Item Details) ตามช่วงวันที่เลือก:</span>
                        <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{filters.startDate} ~ {filters.endDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={exportingExcel}
                            onClick={() => handleExportExcel(activeTab)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                                activeTab === 'so'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                            } ${exportingExcel ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={`ดาวน์โหลด Excel รายการ ${activeTab.toUpperCase()} Items`}
                        >
                            <span>📥</span>
                            <span>{exportingExcel ? 'กำลังส่งออก...' : `ดาวน์โหลด Excel (${activeTab === 'so' ? 'SO Items' : 'PO Items'})`}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content for Active Tab */}
            {activeTab === 'so' ? (
                /* Sales Orders (SO) */
                <div className="bg-white dark:bg-slate-800/80 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
                    {/* Mobile Card List (< md) */}
                    <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700/60">
                        {loadingSales ? (
                            <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลดรายการขาย...</div>
                        ) : sales.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                <span className="text-3xl block mb-2">🛍️</span>
                                ไม่พบรายการขายตามเงื่อนไขที่ระบุ
                            </div>
                        ) : (
                            salesPaging.paged.map(s => (
                                <div
                                    key={s.id}
                                    onClick={() => viewSODetail(s.id)}
                                    className="p-3.5 hover:bg-purple-50/20 active:bg-purple-50/40 transition-colors cursor-pointer flex flex-col gap-2"
                                >
                                    {/* Top: Order No & Status */}
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono font-bold text-xs text-purple-700 dark:text-purple-300">
                                            {s.order_no}
                                        </span>
                                        <div className="text-right">
                                            <StatusBadge status={s.status} />
                                            {s.approver_name && (
                                                <p className="text-[10px] text-gray-400 mt-0.5">ผู้อนุมัติ: {s.approver_name}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Middle: Customer / Cashier & Total */}
                                    <div className="flex items-end justify-between">
                                        <div className="space-y-0.5 text-xs text-gray-500 dark:text-slate-400 min-w-0">
                                            <p className="font-medium text-gray-700 dark:text-slate-200 truncate max-w-[200px]">
                                                👤 {s.customer_name || s.debtor_name || 'ลูกค้าทั่วไป'}
                                            </p>
                                            <p className="text-[11px] text-gray-400">
                                                แคชเชียร์: {s.cashier_name || '-'}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <span className="text-base font-black text-purple-600 dark:text-purple-400 font-mono">
                                                {formatCurrency(s.total_amount)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Bottom: Date/Time + Payment & View prompt */}
                                    <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-slate-400 pt-1 border-t border-gray-50 dark:border-slate-700/40">
                                        <span className="font-mono">🕒 {formatDate(s.created_at)}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
                                                {getPaymentMethodLabel(s.payment_method)}
                                            </span>
                                            <span className="text-purple-600 dark:text-purple-400 font-bold">
                                                ดูบิล →
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop Table View (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-100 dark:border-slate-800">
                                <tr>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">วัน-เวลา</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">เลขที่ออเดอร์ (SO)</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">ลูกค้า</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">แคชเชียร์</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">ยอดรวม</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">ช่องทาง</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">สถานะ</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                                {loadingSales ? (
                                    <tr><td colSpan="8" className="p-8 text-center text-gray-400">กำลังโหลดรายการขาย...</td></tr>
                                ) : sales.length === 0 ? (
                                    <tr><td colSpan="8" className="p-8 text-center text-gray-400">ไม่พบรายการขายตามเงื่อนไขที่ระบุ</td></tr>
                                ) : salesPaging.paged.map(s => (
                                    <tr key={s.id} className="hover:bg-purple-50/30 dark:hover:bg-purple-900/20 transition-colors">
                                        <td className="p-4 text-xs font-mono text-gray-500 dark:text-slate-400">{formatDate(s.created_at)}</td>
                                        <td className="p-4 text-sm font-bold text-purple-700 dark:text-purple-300 font-mono">{s.order_no}</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-slate-300 font-medium">{s.customer_name || s.debtor_name || '-'}</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-slate-300">{s.cashier_name}</td>
                                        <td className="p-4 text-sm font-black text-purple-600 dark:text-purple-400 text-right">{formatCurrency(s.total_amount)}</td>
                                        <td className="p-4 text-xs font-medium text-gray-600 dark:text-slate-300">{getPaymentMethodLabel(s.payment_method)}</td>
                                        <td className="p-4">
                                            <StatusBadge status={s.status} />
                                            {s.approver_name && (
                                                <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                                                    ผู้อนุมัติ: {s.approver_name}
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => viewSODetail(s.id)} className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 rounded-xl font-bold text-xs transition-colors">
                                                🔍 ดูรายละเอียด
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 border-t border-gray-100 dark:border-slate-800">
                        <Pagination
                            page={salesPaging.page}
                            totalPages={salesPaging.totalPages}
                            perPage={salesPaging.perPage}
                            onPageChange={salesPaging.setPage}
                            onPerPageChange={salesPaging.setPerPage}
                            rangeStart={salesPaging.rangeStart}
                            rangeEnd={salesPaging.rangeEnd}
                            total={salesPaging.total}
                        />
                    </div>
                </div>
            ) : (
                /* Purchase Orders (PO) */
                <div className="bg-white dark:bg-slate-800/80 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
                    {/* Mobile Card List (< md) */}
                    <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700/60">
                        {loadingPO ? (
                            <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลดรายการสั่งซื้อ/รับเข้า (PO)...</div>
                        ) : purchaseOrders.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                <span className="text-3xl block mb-2">📦</span>
                                ไม่พบรายการสั่งซื้อ/รับเข้าสินค้า (PO) ตามเงื่อนไขที่ระบุ
                            </div>
                        ) : (
                            poPaging.paged.map(po => (
                                <div
                                    key={po.id}
                                    className="p-3.5 hover:bg-emerald-50/20 active:bg-emerald-50/40 transition-colors flex flex-col gap-2"
                                >
                                    {/* Top: PO Number, Status & Date */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs font-mono font-bold">
                                                PO: {po.po_number}
                                            </span>
                                            <StatusBadge status={po.status || (po.remark?.includes('[ยกเลิกเมื่อ') ? 'cancelled' : 'completed')} />
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[11px] font-mono text-gray-400 dark:text-slate-400">
                                                {po.received_date || formatDate(po.created_at)}
                                            </span>
                                            {po.approver_name && (
                                                <p className="text-[10px] text-gray-400">ผู้อนุมัติ: {po.approver_name}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Middle: User & Total */}
                                    <div className="flex items-end justify-between">
                                        <div className="space-y-0.5 text-xs text-gray-500 dark:text-slate-400 min-w-0">
                                            <p className="font-medium text-gray-700 dark:text-slate-200 truncate max-w-[200px]">
                                                ผู้รับ: {po.user_name || 'ระบบ'}
                                            </p>
                                            <p className="text-[11px] text-gray-400">
                                                {getPaymentMethodLabel(po.payment_method)} {po.bank_name ? `(${po.bank_name})` : ''}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                                {formatCurrency(po.total_amount)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Bottom: Action Buttons */}
                                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-50 dark:border-slate-700/40">
                                        {po.receipt_image_url && (
                                            <button
                                                onClick={() => setViewingReceiptUrl(po.receipt_image_url)}
                                                className="px-2.5 py-1 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 rounded-lg text-xs font-bold flex items-center gap-1 border border-green-200 dark:border-green-800"
                                            >
                                                <span>🧾 ใบเสร็จ</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => viewPODetail(po.id)}
                                            className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-xl font-bold text-xs flex items-center gap-1 border border-emerald-200 dark:border-emerald-800"
                                        >
                                            <span>ดูสินค้า →</span>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop Table View (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-100 dark:border-slate-800">
                                <tr>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">วันที่รับเข้า</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">เลขที่ PO</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">ผู้บันทึก/รับสินค้า</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">ยอดเงินรวม</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">ชำระโดย</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">สถานะ</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">หลักฐานใบเสร็จ</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                                {loadingPO ? (
                                    <tr><td colSpan="8" className="p-8 text-center text-gray-400">กำลังโหลดรายการสั่งซื้อ/รับเข้า (PO)...</td></tr>
                                ) : purchaseOrders.length === 0 ? (
                                    <tr><td colSpan="8" className="p-8 text-center text-gray-400">ไม่พบรายการสั่งซื้อ/รับเข้าสินค้า (PO) ตามเงื่อนไขที่ระบุ</td></tr>
                                ) : poPaging.paged.map(po => (
                                    <tr key={po.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/20 transition-colors">
                                        <td className="p-4 text-xs font-mono text-gray-500 dark:text-slate-400">
                                            {po.received_date || formatDate(po.created_at)}
                                        </td>
                                        <td className="p-4 text-sm font-bold font-mono text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-md border border-emerald-200 dark:border-emerald-800 text-xs">
                                                PO: {po.po_number}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-slate-300 font-medium">{po.user_name || 'ระบบ'}</td>
                                        <td className="p-4 text-sm font-black text-emerald-600 dark:text-emerald-400 text-right">{formatCurrency(po.total_amount)}</td>
                                        <td className="p-4 text-xs font-medium text-gray-600 dark:text-slate-300">
                                            {getPaymentMethodLabel(po.payment_method)}
                                            {po.bank_name && <span className="ml-1 text-[10px] text-gray-400">({po.bank_name})</span>}
                                        </td>
                                        <td className="p-4 text-center">
                                            <StatusBadge status={po.status || (po.remark?.includes('[ยกเลิกเมื่อ') ? 'cancelled' : 'completed')} />
                                            {po.approver_name && (
                                                <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                                                    ผู้อนุมัติ: {po.approver_name}
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {po.receipt_image_url ? (
                                                <button
                                                    onClick={() => setViewingReceiptUrl(po.receipt_image_url)}
                                                    className="px-2.5 py-1 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1 mx-auto border border-green-200 dark:border-green-800"
                                                >
                                                    <span>🧾 ดูรูปใบเสร็จ</span>
                                                </button>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => viewPODetail(po.id)} 
                                                className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-xl font-bold text-xs transition-colors"
                                            >
                                                📦 ดูรายการสินค้า
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 border-t border-gray-100 dark:border-slate-800">
                        <Pagination
                            page={poPaging.page}
                            totalPages={poPaging.totalPages}
                            perPage={poPaging.perPage}
                            onPageChange={poPaging.setPage}
                            onPerPageChange={poPaging.setPerPage}
                            rangeStart={poPaging.rangeStart}
                            rangeEnd={poPaging.rangeEnd}
                            total={poPaging.total}
                        />
                    </div>
                </div>
            )}

            {/* Order Detail Modal (SO) */}
            {showDetailModal && selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-[32px] w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up pb-[env(safe-area-inset-bottom,0px)]">
                        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-gray-800 dark:text-slate-100">รายละเอียดออเดอร์ (SO)</h3>
                                <p className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase tracking-widest mt-0.5">{selectedOrder.order_no}</p>
                            </div>
                            <button onClick={() => setShowOrderModal(false)} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors font-bold text-gray-500">✕</button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                            {/* Cancellation & Approver Info Card */}
                            {selectedOrder.status === 'ยกเลิกแล้ว' && (
                                <div className="bg-red-50 dark:bg-red-950/30 p-3.5 sm:p-4 rounded-2xl border border-red-200 dark:border-red-900/50 text-xs space-y-2.5 animate-fade-in">
                                    <div className="flex justify-between items-center font-bold text-red-700 dark:text-red-400 pb-2 border-b border-red-200/60 dark:border-red-900/40">
                                        <span className="flex items-center gap-1.5 text-sm font-black">
                                            <span>❌</span>
                                            <span>รายการนี้ถูกยกเลิกแล้ว (Voided)</span>
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800">
                                            ยกเลิกแล้ว
                                        </span>
                                    </div>

                                    {/* Grid for Request Time & Approve Time */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/60 dark:bg-slate-900/50 p-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 flex items-center gap-1">
                                                <span>⏱️</span>
                                                <span>เวลาที่ส่งคำขอยกเลิก:</span>
                                            </p>
                                            <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 font-mono">
                                                {selectedOrder.cancel_requested_at ? formatDate(selectedOrder.cancel_requested_at) : (selectedOrder.created_at ? formatDate(selectedOrder.created_at) : '-')}
                                            </p>
                                            {selectedOrder.cancel_requester_name && (
                                                <p className="text-[10px] text-gray-500 dark:text-slate-400">
                                                    ผู้ส่งคำขอ: <span className="font-medium text-gray-700 dark:text-slate-300">{selectedOrder.cancel_requester_name}</span>
                                                </p>
                                            )}
                                        </div>

                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                                                <span>🛡️</span>
                                                <span>เวลาที่อนุมัติยกเลิก:</span>
                                            </p>
                                            <p className="text-xs font-semibold text-red-700 dark:text-red-300 font-mono">
                                                {selectedOrder.approved_at ? formatDate(selectedOrder.approved_at) : (selectedOrder.updated_at ? formatDate(selectedOrder.updated_at) : '-')}
                                            </p>
                                            {selectedOrder.approver_name && (
                                                <p className="text-[10px] text-gray-500 dark:text-slate-400">
                                                    ผู้อนุมัติ: <span className="font-bold text-red-600 dark:text-red-400">{selectedOrder.approver_name}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {selectedOrder.remark && (
                                        <p className="text-gray-600 dark:text-slate-400 pt-0.5">
                                            <b>หมายเหตุ/เหตุผล:</b> {selectedOrder.remark}
                                        </p>
                                    )}
                                </div>
                            )}
                            {(selectedOrder.status === 'รออนุมัติ' || selectedOrder.status === 'pending_approval') && (
                                <div className="bg-amber-50 dark:bg-amber-950/30 p-3.5 sm:p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 text-xs space-y-2 animate-pulse">
                                    <div className="flex justify-between items-center font-bold text-amber-800 dark:text-amber-400 pb-1.5 border-b border-amber-200/60 dark:border-amber-900/40">
                                        <span className="flex items-center gap-1.5 text-sm font-black">
                                            <span>⏳</span>
                                            <span>อยู่ระหว่างรอผู้จัดการอนุมัติการยกเลิกผ่าน LINE</span>
                                        </span>
                                        <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-mono font-bold">
                                            PENDING
                                        </span>
                                    </div>
                                    <div className="bg-white/60 dark:bg-slate-900/50 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30 space-y-1">
                                        <p className="text-gray-700 dark:text-slate-300">
                                            <b>เวลาที่ส่งคำขอ:</b> <span className="font-mono">{selectedOrder.cancel_requested_at ? formatDate(selectedOrder.cancel_requested_at) : (selectedOrder.updated_at ? formatDate(selectedOrder.updated_at) : '-')}</span>
                                            {selectedOrder.cancel_requester_name && <span className="ml-2 text-gray-500">(โดย {selectedOrder.cancel_requester_name})</span>}
                                        </p>
                                        {selectedOrder.remark && (
                                            <p className="text-amber-800 dark:text-amber-300">
                                                <b>เหตุผล:</b> {selectedOrder.remark}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Summary Info */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                                <div className="bg-purple-50/60 dark:bg-purple-950/30 p-3.5 sm:p-4 rounded-2xl border border-purple-100 dark:border-purple-900/40">
                                    <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">ข้อมูลการขาย</p>
                                    <p className="text-xs sm:text-sm"><b>แคชเชียร์:</b> {selectedOrder.cashier_name}</p>
                                    <p className="text-xs sm:text-sm"><b>เวลา:</b> {formatDate(selectedOrder.created_at)}</p>
                                    <p className="text-xs sm:text-sm mt-1"><b>สถานะ:</b> <StatusBadge status={selectedOrder.status} /></p>
                                </div>
                                <div className="bg-gray-50 dark:bg-slate-800/60 p-3.5 sm:p-4 rounded-2xl border border-gray-100 dark:border-slate-700">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">ลูกค้า</p>
                                    <p className="text-sm"><b>ชื่อ:</b> {selectedOrder.customer_name || selectedOrder.debtor_name || 'ลูกค้าทั่วไป'}</p>
                                    <p className="text-sm"><b>เบอร์โทร:</b> {selectedOrder.customer_phone || '-'}</p>
                                    <p className="text-sm"><b>ชำระโดย:</b> {getPaymentMethodLabel(selectedOrder.payment_method)}</p>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase">
                                        <tr>
                                            <th className="p-3">รายการสินค้า</th>
                                            <th className="p-3 text-center">จำนวน</th>
                                            <th className="p-3 text-right">ราคาต่อหน่วย</th>
                                            <th className="p-3 text-right">รวม</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {selectedOrder.items.map((item, idx) => (
                                            <tr key={idx} className="text-sm">
                                                <td className="p-3 font-medium">{item.product_name} <br/><span className="text-[10px] text-gray-400 font-mono">{item.sku}</span></td>
                                                <td className="p-3 text-center font-bold">{item.quantity}</td>
                                                <td className="p-3 text-right">{formatCurrency(item.unit_price)}</td>
                                                <td className="p-3 text-right font-bold text-purple-700">{formatCurrency(item.total_price)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-purple-50/30">
                                        <tr>
                                            <td colSpan="3" className="p-3 text-right text-gray-600 font-bold">ยอดรวมสุทธิ</td>
                                            <td className="p-3 text-right text-lg font-black text-purple-600">{formatCurrency(selectedOrder.total_amount)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Audit Logs */}
                            {selectedOrder.logs && selectedOrder.logs.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">ประวัติการแก้ไข/ยกเลิก</p>
                                    <div className="space-y-2">
                                        {selectedOrder.logs.map(log => (
                                            <div key={log.id} className="bg-red-50 p-3 rounded-xl border border-red-100 text-xs">
                                                <div className="flex justify-between font-bold text-red-700 mb-1">
                                                    <span>ยกเลิก (Void)</span>
                                                    <span>{formatDate(log.created_at)}</span>
                                                </div>
                                                <p className="text-red-600"><b>โดย:</b> {log.user_name}</p>
                                                <p className="text-red-600"><b>เหตุผล:</b> {log.reason}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 flex gap-3">
                            <button onClick={() => setShowOrderModal(false)} className="btn-ghost flex-1">ปิดหน้าต่าง</button>
                            {selectedOrder.status === 'รออนุมัติ' || selectedOrder.status === 'pending_approval' ? (
                                <div className="flex-1 py-2.5 px-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 animate-pulse">
                                    <span>⏳</span>
                                    <span>รอผู้จัดการอนุมัติผ่าน LINE</span>
                                </div>
                            ) : canMaintain && selectedOrder.status !== 'ยกเลิกแล้ว' ? (
                                <button onClick={() => setShowVoidModal(true)} className="btn-danger flex-1">ยกเลิกรายการนี้</button>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* PO Detail Modal */}
            {showPODetailModal && selectedPO && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-[32px] w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up pb-[env(safe-area-inset-bottom,0px)]">
                        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-emerald-50/50 dark:bg-slate-800/50">
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-gray-800 dark:text-slate-100 flex items-center gap-2">
                                    <span>📦 รายละเอียดใบสั่งซื้อ/รับสินค้า (PO)</span>
                                </h3>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-widest font-mono mt-0.5">
                                    PO Number: {selectedPO.po_number}
                                </p>
                            </div>
                            <button onClick={() => setShowPODetailModal(false)} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors font-bold text-gray-500">✕</button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                            {/* Cancellation & Approver Info Card */}
                            {(selectedPO.status === 'cancelled' || selectedPO.remark?.includes('[ยกเลิกเมื่อ')) && (
                                <div className="bg-red-50 dark:bg-red-950/30 p-3.5 sm:p-4 rounded-2xl border border-red-200 dark:border-red-900/50 text-xs space-y-2.5 animate-fade-in">
                                    <div className="flex justify-between items-center font-bold text-red-700 dark:text-red-400 pb-2 border-b border-red-200/60 dark:border-red-900/40">
                                        <span className="flex items-center gap-1.5 text-sm font-black">
                                            <span>❌</span>
                                            <span>ใบรับสินค้านี้ถูกยกเลิกแล้ว (Cancelled)</span>
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800">
                                            ยกเลิกแล้ว
                                        </span>
                                    </div>

                                    {/* Grid for Request Time & Approve Time */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/60 dark:bg-slate-900/50 p-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 flex items-center gap-1">
                                                <span>⏱️</span>
                                                <span>เวลาที่ส่งคำขอยกเลิก:</span>
                                            </p>
                                            <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 font-mono">
                                                {selectedPO.cancel_requested_at ? formatDate(selectedPO.cancel_requested_at) : (selectedPO.created_at ? formatDate(selectedPO.created_at) : '-')}
                                            </p>
                                            {selectedPO.cancel_requester_name && (
                                                <p className="text-[10px] text-gray-500 dark:text-slate-400">
                                                    ผู้ส่งคำขอ: <span className="font-medium text-gray-700 dark:text-slate-300">{selectedPO.cancel_requester_name}</span>
                                                </p>
                                            )}
                                        </div>

                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                                                <span>🛡️</span>
                                                <span>เวลาที่อนุมัติยกเลิก:</span>
                                            </p>
                                            <p className="text-xs font-semibold text-red-700 dark:text-red-300 font-mono">
                                                {selectedPO.approved_at ? formatDate(selectedPO.approved_at) : (selectedPO.created_at ? formatDate(selectedPO.created_at) : '-')}
                                            </p>
                                            {selectedPO.approver_name && (
                                                <p className="text-[10px] text-gray-500 dark:text-slate-400">
                                                    ผู้อนุมัติ: <span className="font-bold text-red-600 dark:text-red-400">{selectedPO.approver_name}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {selectedPO.remark && (
                                        <p className="text-gray-600 dark:text-slate-400 pt-0.5">
                                            <b>หมายเหตุ/เหตุผล:</b> {selectedPO.remark}
                                        </p>
                                    )}
                                </div>
                            )}
                            {(selectedPO.status === 'รออนุมัติ' || selectedPO.status === 'pending_approval') && (
                                <div className="bg-amber-50 dark:bg-amber-950/30 p-3.5 sm:p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 text-xs space-y-2 animate-pulse">
                                    <div className="flex justify-between items-center font-bold text-amber-800 dark:text-amber-400 pb-1.5 border-b border-amber-200/60 dark:border-amber-900/40">
                                        <span className="flex items-center gap-1.5 text-sm font-black">
                                            <span>⏳</span>
                                            <span>อยู่ระหว่างรอผู้จัดการอนุมัติการยกเลิกผ่าน LINE</span>
                                        </span>
                                        <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-mono font-bold">
                                            PENDING
                                        </span>
                                    </div>
                                    <div className="bg-white/60 dark:bg-slate-900/50 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30 space-y-1">
                                        <p className="text-gray-700 dark:text-slate-300">
                                            <b>เวลาที่ส่งคำขอ:</b> <span className="font-mono">{selectedPO.cancel_requested_at ? formatDate(selectedPO.cancel_requested_at) : '-'}</span>
                                            {selectedPO.cancel_requester_name && <span className="ml-2 text-gray-500">(โดย {selectedPO.cancel_requester_name})</span>}
                                        </p>
                                        {selectedPO.remark && (
                                            <p className="text-amber-800 dark:text-amber-300">
                                                <b>เหตุผล:</b> {selectedPO.remark}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                                <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 sm:p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">ข้อมูลการรับเข้า</p>
                                    <p className="text-xs sm:text-sm"><b>ผู้รับเข้า:</b> {selectedPO.user_name}</p>
                                    <p className="text-xs sm:text-sm"><b>วันที่รับสินค้า:</b> {selectedPO.received_date || formatDate(selectedPO.created_at)}</p>
                                    <p className="text-xs sm:text-sm"><b>ชำระเงิน:</b> {getPaymentMethodLabel(selectedPO.payment_method)}</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-slate-800/60 p-3.5 sm:p-4 rounded-2xl border border-gray-100 dark:border-slate-700">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">หมายเหตุ & เอกสาร</p>
                                    <p className="text-sm text-gray-700 font-medium">{selectedPO.remark || 'รับเข้าสินค้า'}</p>
                                    {selectedPO.receipt_image_url && (
                                        <button
                                            onClick={() => setViewingReceiptUrl(selectedPO.receipt_image_url)}
                                            className="mt-2 text-xs text-emerald-700 font-bold hover:underline flex items-center gap-1 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200"
                                        >
                                            <span>🧾 ดูรูปภาพใบเสร็จ / หลักฐาน</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase">
                                        <tr>
                                            <th className="p-3">สินค้า / วัตถุดิบ</th>
                                            <th className="p-3 text-center">จำนวนรับเข้า</th>
                                            <th className="p-3 text-right">ต้นทุนต่อหน่วย</th>
                                            <th className="p-3 text-right">ราคารวม</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {selectedPO.items && selectedPO.items.length > 0 ? (
                                            selectedPO.items.map((item, idx) => (
                                                <tr key={idx} className="text-sm">
                                                    <td className="p-3 font-medium text-gray-800">
                                                        {item.product_name}
                                                        {item.sku && <><br/><span className="text-[10px] text-gray-400 font-mono">{item.sku}</span></>}
                                                    </td>
                                                    <td className="p-3 text-center font-bold text-emerald-700">
                                                        +{item.quantity} {item.unit}
                                                    </td>
                                                    <td className="p-3 text-right text-gray-600">
                                                        {formatCurrency(item.unit_cost_price)}
                                                    </td>
                                                    <td className="p-3 text-right font-black text-emerald-600">
                                                        {formatCurrency(item.total_price)}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="p-4 text-center text-gray-400 text-xs">ไม่มีรายละเอียดสินค้า</td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot className="bg-emerald-50/40 border-t border-emerald-100">
                                        <tr>
                                            <td colSpan="3" className="p-3 text-right text-gray-700 font-bold">ยอดเงินรับเข้ารวมทั้งสิ้น</td>
                                            <td className="p-3 text-right text-lg font-black text-emerald-700">{formatCurrency(selectedPO.total_amount)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex justify-between items-center">
                            {selectedPO.status === 'รออนุมัติ' || selectedPO.status === 'pending_approval' ? (
                                <div className="py-2.5 px-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                                    <span>⏳</span>
                                    <span>รอผู้จัดการอนุมัติผ่าน LINE</span>
                                </div>
                            ) : canMaintain && selectedPO.status !== 'cancelled' && !selectedPO.remark?.includes('[ยกเลิกเมื่อ') ? (
                                <button
                                    onClick={() => {
                                        setPoCancelReason('');
                                        setShowCancelPOModal(true);
                                    }}
                                    className="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <span>🗑️</span>
                                    <span>ยกเลิกใบรับสินค้านี้ (PO)</span>
                                </button>
                            ) : <div />}
                            <button onClick={() => setShowPODetailModal(false)} className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-all cursor-pointer">
                                ✕ ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receipt Proof Image Modal */}
            {viewingReceiptUrl && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[70] p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl p-4 max-w-3xl w-full max-h-[90vh] flex flex-col animate-scale-up relative shadow-2xl">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span>🧾</span>
                                <span>หลักฐานการรับสินค้า / ใบเสร็จ PO</span>
                            </h3>
                            <button
                                onClick={() => setViewingReceiptUrl(null)}
                                className="text-gray-400 hover:text-gray-700 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center bg-gray-100"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-900 rounded-2xl p-2">
                            <img
                                src={viewingReceiptUrl}
                                alt="Receipt Full View"
                                className="max-h-[75vh] object-contain rounded-lg shadow-lg"
                            />
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                            <a
                                href={viewingReceiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-colors"
                            >
                                🔗 เปิดในหน้าต่างใหม่
                            </a>
                            <button
                                onClick={() => setViewingReceiptUrl(null)}
                                className="px-4 py-2 rounded-xl bg-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-300 transition-colors"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Void Confirmation Modal (SO) */}
            {showVoidModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-scale-up">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
                            <h3 className="text-lg font-black text-gray-800">ยืนยันการยกเลิกรายการ?</h3>
                            <p className="text-sm text-gray-500 mt-1">การยกเลิกจะทำการคืนสต๊อกสินค้าเข้าคลัง และไม่สามารถย้อนกลับได้</p>
                        </div>
                        
                        <div className="space-y-4 text-left">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2 ml-1">เลือกเหตุผลด่วน</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {['คีย์รายการผิด', 'ลูกค้าเปลี่ยนใจ', 'ยกเลิกออเดอร์', 'สินค้าหมด'].map(r => (
                                        <button 
                                            key={r}
                                            onClick={() => setVoidReason(r)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                                voidReason === r 
                                                ? 'bg-red-500 text-white border-red-500 shadow-sm' 
                                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'
                                            }`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">หรือระบุเหตุผลอื่น</label>
                                <textarea 
                                    className="input-field min-h-[80px]" 
                                    placeholder="ระบุเหตุผลในการยกเลิก..."
                                    value={voidReason}
                                    onChange={e => setVoidReason(e.target.value)}
                                ></textarea>
                            </div>

                            {/* LINE Approval Status Alert */}
                            {lineApprovalStatus === 'PENDING' && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800 animate-pulse font-medium">
                                    <span className="animate-spin text-base">⏳</span>
                                    <span>ส่งคำขอแล้ว! กำลังรอผู้จัดการอนุมัติผ่าน LINE...</span>
                                </div>
                            )}
                            {lineApprovalStatus === 'APPROVED' && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-bold">
                                    <span className="text-base">✅</span>
                                    <span>ได้รับการอนุมัติแล้ว! กำลังปรับปรุงระบบ...</span>
                                </div>
                            )}

                            {lineApprovalStatus === 'REJECTED' && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800 font-bold">
                                    <span className="text-base">❌</span>
                                    <span>คำขอถูกปฏิเสธโดยผู้จัดการ</span>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setShowVoidModal(false);
                                        setRequestingLineApproval(false);
                                        setLineApprovalStatus(null);
                                    }} 
                                    className="btn-ghost flex-1 text-xs"
                                >
                                    ปิด
                                </button>
                                <button 
                                    type="button"
                                    onClick={handleVoid} 
                                    disabled={voiding || requestingLineApproval || !voidReason.trim()}
                                    className={`flex-1 text-xs py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all text-white shadow-sm cursor-pointer disabled:opacity-50 ${
                                        lineStoreRequired
                                            ? 'bg-[#06C755] hover:bg-[#05b04c]'
                                            : 'btn-danger'
                                    }`}
                                >
                                    {voiding ? (
                                        "กำลังดำเนินการ..."
                                    ) : requestingLineApproval ? (
                                        "กำลังรอ LINE อนุมัติ..."
                                    ) : lineStoreRequired ? (
                                        "💬 ขออนุมัติผ่าน LINE"
                                    ) : (
                                        "ยืนยันยกเลิกรายการ"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel PO Modal */}
            {showCancelPOModal && selectedPO && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-scale-up">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">📦</div>
                            <h3 className="text-lg font-black text-gray-800">ยกเลิกใบรับสินค้า (PO)?</h3>
                            <p className="text-xs text-gray-500 mt-1 font-mono">#{selectedPO.po_number}</p>
                            <p className="text-xs text-gray-400 mt-1">
                                ระบบจะทำการหักลดสต็อกสินค้า/วัตถุดิบคืนออกจากคลัง และไม่สามารถย้อนกลับได้
                            </p>
                        </div>
                        
                        <div className="space-y-4 text-left">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2 ml-1">เลือกเหตุผลด่วน</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {['คีย์จำนวนผิด', 'สินค้าชำรุด/ส่งคืนผู้ขาย', 'ยกเลิกคำสั่งซื้อ', 'เอกสารซ้ำซ้อน'].map(r => (
                                        <button 
                                            key={r}
                                            type="button"
                                            onClick={() => setPoCancelReason(r)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                                poCancelReason === r 
                                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm' 
                                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'
                                            }`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">หรือระบุเหตุผลอื่น</label>
                                <textarea 
                                    className="input-field min-h-[80px]" 
                                    placeholder="ระบุเหตุผลในการยกเลิกใบรับสินค้านี้..."
                                    value={poCancelReason}
                                    onChange={e => setPoCancelReason(e.target.value)}
                                ></textarea>
                            </div>

                            {/* LINE Approval Status Alert */}
                            {lineApprovalStatus === 'PENDING' && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800 animate-pulse font-medium">
                                    <span className="animate-spin text-base">⏳</span>
                                    <span>ส่งคำขอแล้ว! กำลังรอผู้จัดการอนุมัติผ่าน LINE...</span>
                                </div>
                            )}
                            {lineApprovalStatus === 'APPROVED' && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-bold">
                                    <span className="text-base">✅</span>
                                    <span>ได้รับการอนุมัติแล้ว! กำลังปรับปรุงระบบ...</span>
                                </div>
                            )}
                            {lineApprovalStatus === 'REJECTED' && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800 font-bold">
                                    <span className="text-base">❌</span>
                                    <span>คำขอถูกปฏิเสธโดยผู้จัดการ</span>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setShowCancelPOModal(false);
                                        setRequestingLineApproval(false);
                                        setLineApprovalStatus(null);
                                    }} 
                                    className="btn-ghost flex-1 text-xs"
                                >
                                    ปิด
                                </button>
                                <button 
                                    type="button"
                                    onClick={handleCancelPO} 
                                    disabled={cancelingPO || requestingLineApproval || !poCancelReason.trim()}
                                    className={`flex-1 text-xs py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all text-white shadow-sm cursor-pointer disabled:opacity-50 ${
                                        lineStoreRequired
                                            ? 'bg-[#06C755] hover:bg-[#05b04c]'
                                            : 'btn-danger'
                                    }`}
                                >
                                    {cancelingPO ? (
                                        "กำลังดำเนินการ..."
                                    ) : requestingLineApproval ? (
                                        "กำลังรอ LINE อนุมัติ..."
                                    ) : lineStoreRequired ? (
                                        "💬 ขออนุมัติผ่าน LINE"
                                    ) : (
                                        "ยืนยันยกเลิกใบรับสินค้า"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
