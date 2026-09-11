import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';

export default function SalesHistoryPage() {
    const { user } = useAuth();
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

    const handleVoid = async () => {
        if (!voidReason.trim()) return toast.error("กรุณาระบุเหตุผล");
        setVoiding(true);
        try {
            await api.post(`/sales/${selectedOrder.id}/void`, { reason: voidReason });
            toast.success("ยกเลิกรายการสำเร็จ");
            setShowVoidModal(false);
            setShowOrderModal(false);
            fetchSales();
        } catch (err) {
            toast.error(err.response?.data?.message || "เกิดข้อผิดพลาด");
        } finally {
            setVoiding(false);
        }
    };

    const StatusBadge = ({ status }) => {
        const colors = {
            'completed': 'bg-green-100 text-green-700 border-green-200',
            'pending': 'bg-amber-100 text-amber-700 border-amber-200',
            'ยกเลิกแล้ว': 'bg-red-100 text-red-700 border-red-200',
            'outstanding': 'bg-amber-100 text-amber-700 border-amber-200',
            'รอชำระพร้อมเพย์': 'bg-blue-100 text-blue-700 border-blue-200'
        };
        const labels = {
            'completed': 'สำเร็จ',
            'pending': 'รอดำเนินการ',
            'ยกเลิกแล้ว': 'ยกเลิกแล้ว',
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
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <span>📜 ประวัติการซื้อ/ขาย (SO & PO History)</span>
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        ตรวจสอบ ค้นหา และติดตามรายการขายสินค้า (SO) และรายการสั่งซื้อ/รับเข้าวัตถุดิบ (PO)
                    </p>
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder={activeTab === 'so' ? "เลขที่ใบเสร็จ / ชื่อลูกค้า..." : "เลขที่ PO / หมายเหตุ / ผู้รับ..."} 
                        className="input-field max-w-xs text-xs sm:text-sm"
                        value={filters.search}
                        onChange={e => setFilters({...filters, search: e.target.value})}
                        onKeyDown={handleSearch}
                    />
                    <button onClick={triggerSearch} className="btn-primary flex items-center gap-1">
                        <span>🔍</span>
                        <span>ค้นหา</span>
                    </button>
                </div>
            </header>

            {/* Tab Switcher */}
            <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                <button
                    onClick={() => setActiveTab('so')}
                    className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border ${
                        activeTab === 'so'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-md scale-102'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    <span>🛍️</span>
                    <span>ประวัติการขาย (SO / Sales Orders)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'so' ? 'bg-purple-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {sales.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('po')}
                    className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border ${
                        activeTab === 'po'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-102'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    <span>📦</span>
                    <span>ประวัติการสั่งซื้อ/รับเข้า (PO / Purchase Orders)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'po' ? 'bg-emerald-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {purchaseOrders.length}
                    </span>
                </button>
            </div>

            {/* Filters Row */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ตั้งแต่วันที่</label>
                    <input type="date" className="input-field !py-1.5 text-xs" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ถึงวันที่</label>
                    <input type="date" className="input-field !py-1.5 text-xs" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
                </div>
                {activeTab === 'so' && (
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">สถานะ</label>
                        <select className="input-field !py-1.5 text-xs" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                            <option value="">ทั้งหมด</option>
                            <option value="completed">สำเร็จ</option>
                            <option value="ยกเลิกแล้ว">ยกเลิกแล้ว</option>
                            <option value="รอชำระพร้อมเพย์">รอชำระพร้อมเพย์</option>
                        </select>
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ช่องทางชำระ</label>
                    <select className="input-field !py-1.5 text-xs" value={filters.paymentMethod} onChange={e => setFilters({...filters, paymentMethod: e.target.value})}>
                        <option value="">ทั้งหมด</option>
                        <option value="cash">เงินสด</option>
                        <option value="credit_card">บัตรเครดิต</option>
                        <option value="qr_promptpay">PromptPay</option>
                        <option value="outstanding">ค้างชำระ</option>
                    </select>
                </div>
            </div>

            {/* Content Table for Active Tab */}
            {activeTab === 'so' ? (
                /* Sales Orders Table (SO) */
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 border-b border-gray-100">
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
                            <tbody className="divide-y divide-gray-50">
                                {loadingSales ? (
                                    <tr><td colSpan="8" className="p-8 text-center text-gray-400">กำลังโหลดรายการขาย...</td></tr>
                                ) : sales.length === 0 ? (
                                    <tr><td colSpan="8" className="p-8 text-center text-gray-400">ไม่พบรายการขายตามเงื่อนไขที่ระบุ</td></tr>
                                ) : salesPaging.paged.map(s => (
                                    <tr key={s.id} className="hover:bg-purple-50/30 transition-colors">
                                        <td className="p-4 text-xs font-mono text-gray-500">{formatDate(s.created_at)}</td>
                                        <td className="p-4 text-sm font-bold text-purple-700 font-mono">{s.order_no}</td>
                                        <td className="p-4 text-sm text-gray-600 font-medium">{s.customer_name || s.debtor_name || '-'}</td>
                                        <td className="p-4 text-sm text-gray-600">{s.cashier_name}</td>
                                        <td className="p-4 text-sm font-black text-purple-600 text-right">{formatCurrency(s.total_amount)}</td>
                                        <td className="p-4 text-xs font-medium text-gray-600">{getPaymentMethodLabel(s.payment_method)}</td>
                                        <td className="p-4"><StatusBadge status={s.status} /></td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => viewSODetail(s.id)} className="px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl font-bold text-xs transition-colors">
                                                🔍 ดูรายละเอียด
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 border-t border-gray-100">
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
                /* Purchase Orders Table (PO) */
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">วันที่รับเข้า</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">เลขที่ PO</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">ผู้บันทึก/รับสินค้า</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">ยอดเงินรวม</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">ชำระโดย</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">หลักฐานใบเสร็จ</th>
                                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loadingPO ? (
                                    <tr><td colSpan="7" className="p-8 text-center text-gray-400">กำลังโหลดรายการสั่งซื้อ/รับเข้า (PO)...</td></tr>
                                ) : purchaseOrders.length === 0 ? (
                                    <tr><td colSpan="7" className="p-8 text-center text-gray-400">ไม่พบรายการสั่งซื้อ/รับเข้าสินค้า (PO) ตามเงื่อนไขที่ระบุ</td></tr>
                                ) : poPaging.paged.map(po => (
                                    <tr key={po.id} className="hover:bg-emerald-50/30 transition-colors">
                                        <td className="p-4 text-xs font-mono text-gray-500">
                                            {po.received_date || formatDate(po.created_at)}
                                        </td>
                                        <td className="p-4 text-sm font-bold font-mono text-emerald-700 flex items-center gap-1.5">
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200 text-xs">
                                                PO: {po.po_number}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 font-medium">{po.user_name || 'ระบบ'}</td>
                                        <td className="p-4 text-sm font-black text-emerald-600 text-right">{formatCurrency(po.total_amount)}</td>
                                        <td className="p-4 text-xs font-medium text-gray-600">
                                            {getPaymentMethodLabel(po.payment_method)}
                                            {po.bank_name && <span className="ml-1 text-[10px] text-gray-400">({po.bank_name})</span>}
                                        </td>
                                        <td className="p-4 text-center">
                                            {po.receipt_image_url ? (
                                                <button
                                                    onClick={() => setViewingReceiptUrl(po.receipt_image_url)}
                                                    className="px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1 mx-auto border border-green-200"
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
                                                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-xs transition-colors"
                                            >
                                                📦 ดูรายการสินค้า
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 border-t border-gray-100">
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-black text-gray-800">รายละเอียดออเดอร์ (SO)</h3>
                                <p className="text-xs text-purple-600 font-bold uppercase tracking-widest mt-0.5">{selectedOrder.order_no}</p>
                            </div>
                            <button onClick={() => setShowOrderModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">✕</button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Summary Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-100">
                                    <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">ข้อมูลการขาย</p>
                                    <p className="text-sm"><b>แคชเชียร์:</b> {selectedOrder.cashier_name}</p>
                                    <p className="text-sm"><b>เวลา:</b> {formatDate(selectedOrder.created_at)}</p>
                                    <p className="text-sm"><b>สถานะ:</b> <StatusBadge status={selectedOrder.status} /></p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
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
                            {(user?.role === 'admin' || user?.role === 'manager') && selectedOrder.status !== 'ยกเลิกแล้ว' && (
                                <button onClick={() => setShowVoidModal(true)} className="btn-danger flex-1">ยกเลิกรายการนี้</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* PO Detail Modal */}
            {showPODetailModal && selectedPO && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-emerald-50/50">
                            <div>
                                <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                    <span>📦 รายละเอียดใบสั่งซื้อ/รับสินค้า (PO)</span>
                                </h3>
                                <p className="text-xs text-emerald-700 font-bold uppercase tracking-widest font-mono mt-0.5">
                                    PO Number: {selectedPO.po_number}
                                </p>
                            </div>
                            <button onClick={() => setShowPODetailModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">✕</button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">ข้อมูลการรับเข้า</p>
                                    <p className="text-sm"><b>ผู้รับเข้า:</b> {selectedPO.user_name}</p>
                                    <p className="text-sm"><b>วันที่รับสินค้า:</b> {selectedPO.received_date || formatDate(selectedPO.created_at)}</p>
                                    <p className="text-sm"><b>ชำระเงิน:</b> {getPaymentMethodLabel(selectedPO.payment_method)}</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
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

                        <div className="p-6 border-t border-gray-100 flex justify-end">
                            <button onClick={() => setShowPODetailModal(false)} className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-all">
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
                            <div className="flex gap-3">
                                <button onClick={() => setShowVoidModal(false)} className="btn-ghost flex-1">ไม่ยกเลิก</button>
                                <button 
                                    onClick={handleVoid} 
                                    disabled={voiding || !voidReason.trim()}
                                    className="btn-danger flex-1 disabled:opacity-50"
                                >
                                    {voiding ? "กำลังบันทึก..." : "ยืนยันการยกเลิก"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
