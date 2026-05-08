import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function SalesHistoryPage() {
    const { user } = useAuth();
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showDetailModal, setShowOrderModal] = useState(false);
    const [showVoidModal, setShowVoidModal] = useState(false);
    const [voidReason, setVoidReason] = useState("");
    const [voiding, setVoiding] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        status: "",
        paymentMethod: "",
        search: ""
    });

    useEffect(() => {
        fetchSales();
    }, [filters.startDate, filters.endDate, filters.status, filters.paymentMethod]);

    const fetchSales = async () => {
        setLoading(true);
        try {
            const res = await api.get('/sales/history', { params: filters });
            setSales(res.data.data);
        } catch (err) {
            toast.error("โหลดข้อมูลไม่สำเร็จ");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        if (e.key === 'Enter') fetchSales();
    };

    const viewDetail = async (id) => {
        try {
            const res = await api.get(`/sales/${id}`);
            setSelectedOrder(res.data.data);
            setShowOrderModal(true);
        } catch (err) {
            toast.error("โหลดรายละเอียดไม่สำเร็จ");
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
            'completed': 'bg-green-100 text-green-700',
            'pending': 'bg-amber-100 text-amber-700',
            'ยกเลิกแล้ว': 'bg-red-100 text-red-700',
            'outstanding': 'bg-amber-100 text-amber-700',
            'รอชำระพร้อมเพย์': 'bg-blue-100 text-blue-700'
        };
        const labels = {
            'completed': 'สำเร็จ',
            'pending': 'รอดำเนินการ',
            'ยกเลิกแล้ว': 'ยกเลิกแล้ว',
            'outstanding': 'ค้างชำระ',
            'รอชำระพร้อมเพย์': 'รอชำระพร้อมเพย์'
        };
        return <span className={`px-2 py-1 rounded-full text-xs font-bold ${colors[status] || 'bg-gray-100 text-gray-700'}`}>{labels[status] || status}</span>;
    };

    const getPaymentMethodLabel = (method) => {
        const methods = {
            'cash': 'เงินสด',
            'qr_promptpay': 'PromptPay',
            'outstanding': 'ค้างชำระ'
        };
        return methods[method] || method;
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-800">ประวัติการขาย</h1>
                    <p className="text-gray-500 text-sm">ตรวจสอบ แก้ไข และยกเลิกรายการขาย</p>
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="เลขที่ใบเสร็จ / ชื่อลูกค้า" 
                        className="input-field max-w-xs"
                        value={filters.search}
                        onChange={e => setFilters({...filters, search: e.target.value})}
                        onKeyDown={handleSearch}
                    />
                    <button onClick={fetchSales} className="btn-primary">ค้นหา</button>
                </div>
            </header>

            {/* Filters Row */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ตั้งแต่วันที่</label>
                    <input type="date" className="input-field !py-1.5" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ถึงวันที่</label>
                    <input type="date" className="input-field !py-1.5" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">สถานะ</label>
                    <select className="input-field !py-1.5" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                        <option value="">ทั้งหมด</option>
                        <option value="completed">สำเร็จ</option>
                        <option value="voided">ยกเลิกแล้ว</option>
                        <option value="รอชำระพร้อมเพย์">รอชำระพร้อมเพย์</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ช่องทางชำระ</label>
                    <select className="input-field !py-1.5" value={filters.paymentMethod} onChange={e => setFilters({...filters, paymentMethod: e.target.value})}>
                        <option value="">ทั้งหมด</option>
                        <option value="cash">เงินสด</option>
                        <option value="qr_promptpay">PromptPay</option>
                        <option value="outstanding">ค้างชำระ</option>
                    </select>
                </div>
            </div>

            {/* Sales Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">วันที่/เวลา</th>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">เลขที่ออเดอร์</th>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">ลูกค้า</th>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">แคชเชียร์</th>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">ยอดรวม</th>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">ช่องทาง</th>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">สถานะ</th>
                                <th className="p-4 text-xs font-bold text-gray-400 uppercase">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="8" className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
                            ) : sales.length === 0 ? (
                                <tr><td colSpan="8" className="p-8 text-center text-gray-400">ไม่พบรายการขาย</td></tr>
                            ) : sales.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="p-4 text-sm">{formatDate(s.created_at)}</td>
                                    <td className="p-4 text-sm font-bold">{s.order_no}</td>
                                    <td className="p-4 text-sm text-gray-600">{s.customer_name || s.debtor_name || '-'}</td>
                                    <td className="p-4 text-sm text-gray-600">{s.cashier_name}</td>
                                    <td className="p-4 text-sm font-black text-primary-600">{formatCurrency(s.total_amount)}</td>
                                    <td className="p-4 text-sm">{getPaymentMethodLabel(s.payment_method)}</td>
                                    <td className="p-4"><StatusBadge status={s.status} /></td>
                                    <td className="p-4">
                                        <button onClick={() => viewDetail(s.id)} className="text-blue-500 hover:text-blue-700 font-bold text-sm">ดูรายละเอียด</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Order Detail Modal */}
            {showDetailModal && selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-bounce-in">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-black text-gray-800">รายละเอียดออเดอร์</h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{selectedOrder.order_no}</p>
                            </div>
                            <button onClick={() => setShowOrderModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">✕</button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Summary Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-primary-50/50 p-4 rounded-2xl">
                                    <p className="text-[10px] font-bold text-primary-400 uppercase mb-1">ข้อมูลการขาย</p>
                                    <p className="text-sm"><b>แคชเชียร์:</b> {selectedOrder.cashier_name}</p>
                                    <p className="text-sm"><b>เวลา:</b> {formatDate(selectedOrder.created_at)}</p>
                                    <p className="text-sm"><b>สถานะ:</b> <StatusBadge status={selectedOrder.status} /></p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-2xl">
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
                                            <th className="p-3">รายการ</th>
                                            <th className="p-3 text-center">จำนวน</th>
                                            <th className="p-3 text-right">ราคา</th>
                                            <th className="p-3 text-right">รวม</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {selectedOrder.items.map((item, idx) => (
                                            <tr key={idx} className="text-sm">
                                                <td className="p-3 font-medium">{item.product_name} <br/><span className="text-[10px] text-gray-400">{item.sku}</span></td>
                                                <td className="p-3 text-center">{item.quantity}</td>
                                                <td className="p-3 text-right">{formatCurrency(item.unit_price)}</td>
                                                <td className="p-3 text-right font-bold">{formatCurrency(item.total_price)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50/50">
                                        <tr>
                                            <td colSpan="3" className="p-3 text-right text-gray-500 font-bold">ยอดรวมสุทธิ</td>
                                            <td className="p-3 text-right text-lg font-black text-primary-600">{formatCurrency(selectedOrder.total_amount)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Audit Logs */}
                            {selectedOrder.logs.length > 0 && (
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
                            <button onClick={() => setShowOrderModal(false)} className="btn-ghost flex-1">ปิด</button>
                            {(user.role === 'admin' || user.role === 'manager') && selectedOrder.status !== 'ยกเลิกแล้ว' && (
                                <button onClick={() => setShowVoidModal(true)} className="btn-danger flex-1">ยกเลิกรายการนี้</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Void Confirmation Modal */}
            {showVoidModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-slide-up">
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
