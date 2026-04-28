import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import ocrService from '../services/ocrService';
import api from '../services/api';
import BarcodeScanner from '../components/BarcodeScanner';
import ScanIcon from '../components/ScanIcon';

export default function OcrPage() {
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingItems, setEditingItems] = useState([]);
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [showAddProductModal, setShowAddProductModal] = useState(false);
    const [itemToCreate, setItemToCreate] = useState(null);

    const fetchReceipts = async () => {
        setLoading(true);
        try {
            const res = await ocrService.listReceipts();
            setReceipts(res.data);
        } catch (err) {
            toast.error('ไม่สามารถโหลดข้อมูลใบเสร็จได้');
        } finally {
            setLoading(false);
        }
    };

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data.data);
        } catch (err) {
            console.error('Failed to fetch products');
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await api.get('/categories');
            setCategories(res.data.data);
        } catch (err) {}
    };

    useEffect(() => {
        fetchReceipts();
        fetchProducts();
        fetchCategories();
    }, []);

    // Polling for processing receipts
    useEffect(() => {
        const processingReceipts = receipts.filter(r => r.status === 'processing');
        if (processingReceipts.length > 0) {
            const timer = setTimeout(async () => {
                const oldReceipts = [...receipts];
                await fetchReceipts();
                
                // If the currently selected receipt was processing and now it's not, refresh its detail
                if (selectedReceipt && selectedReceipt.status === 'processing') {
                    const updated = (await ocrService.listReceipts()).data.find(r => r.id === selectedReceipt.id);
                    if (updated && updated.status !== 'processing') {
                        viewDetail(updated.id);
                    }
                }
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [receipts, selectedReceipt]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            await ocrService.uploadReceipt(file);
            toast.success('อัปโหลดใบเสร็จแล้ว ระบบกำลังประมวลผล...');
            fetchReceipts();
        } catch (err) {
            toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาดในการอัปโหลด');
        } finally {
            setUploading(false);
            e.target.value = null;
        }
    };

    const viewDetail = async (id) => {
        try {
            const res = await ocrService.getReceipt(id);
            setSelectedReceipt(res.data);
            setIsEditing(false);
        } catch (err) {
            toast.error('ไม่สามารถโหลดรายละเอียดได้');
        }
    };

    const handleEditStart = () => {
        setEditingItems(selectedReceipt.items.map(item => ({ ...item })));
        setIsEditing(true);
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...editingItems];
        newItems[index][field] = value;
        
        if (field === 'product_id') {
            const prod = products.find(p => p.id === value);
            newItems[index].matched_name = prod ? prod.name : null;
        }
        
        setEditingItems(newItems);
    };

    const handleRemoveItem = (index) => {
        const newItems = editingItems.filter((_, i) => i !== index);
        setEditingItems(newItems);
    };

    const handleSaveEdits = async () => {
        setLoading(true);
        try {
            const payload = {
                items: editingItems,
                payment_method: selectedReceipt.payment_method,
                transaction_id: selectedReceipt.transaction_id,
                vendor_name: selectedReceipt.vendor_name,
                total_amount: selectedReceipt.total_amount
            };
            const res = await api.put(`/ocr/${selectedReceipt.id}`, payload);
            toast.success('บันทึกการแก้ไขแล้ว');
            setSelectedReceipt(res.data.data);
            setIsEditing(false);
            fetchReceipts();
        } catch (err) {
            toast.error('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('คุณต้องการลบข้อมูลใบเสร็จนี้และรูปภาพใน R2 ใช่หรือไม่?')) return;
        
        try {
            setLoading(true);
            await ocrService.deleteReceipt(id);
            toast.success('ลบข้อมูลใบเสร็จสำเร็จ');
            setSelectedReceipt(null);
            fetchReceipts();
        } catch (err) {
            console.error('Delete error:', err);
            const msg = err.response?.data?.error?.message || err.response?.data?.message || 'ไม่สามารถลบข้อมูลได้';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToStock = async () => {
        if (!selectedReceipt) return;
        
        // Check if already fully updated
        const allUpdated = selectedReceipt.items.every(item => item.is_stock_updated === 1);
        if (allUpdated && selectedReceipt.items.length > 0) {
            toast.success('สต็อกถูกอัปเดตไปแล้ว');
            return;
        }

        // 1. Check for unmatched items
        const unmatched = selectedReceipt.items.find(item => !item.product_id);
        if (unmatched) {
            setItemToCreate(unmatched);
            setShowAddProductModal(true);
            return;
        }

        // 2. All matched, confirm stock
        try {
            setLoading(true);
            const res = await api.post(`/ocr/${selectedReceipt.id}/confirm-stock`);
            toast.success('เพิ่มสินค้าเข้าสต็อกสำเร็จ');
            setSelectedReceipt(res.data.data);
            fetchReceipts();
            fetchProducts();
        } catch (err) {
            toast.error('เกิดข้อผิดพลาดในการเพิ่มสต็อก');
        } finally {
            setLoading(false);
        }
    };

    const AddProductModal = ({ item, onClose, onSuccess }) => {
        const [sku, setSku] = useState('');
        const [showScanner, setShowScanner] = useState(false);
        
        // Auto-detect pack size from name (e.g., "Item X10" -> 10)
        const detectPackSize = (name) => {
            const match = name.match(/[Xx](\d+)/);
            return match ? parseInt(match[1]) : 1;
        };

        const [unitsPerPack, setUnitsPerPack] = useState(() => detectPackSize(item.raw_name));
        const [form, setForm] = useState({
            name: item.raw_name,
            cost_price: item.unit_price,
            selling_price: Math.round(item.unit_price * 1.3), // 30% markup default
            category_id: '',
            barcode: '',
            description: '',
            is_featured: false,
            reorder_level: 5
        });

        useEffect(() => {
            const generateSku = async () => {
                try {
                    const res = await api.get('/products/generate-sku');
                    setSku(res.data.data.sku);
                } catch { setSku('PRD' + Date.now().toString().slice(-6)); }
            };
            generateSku();
        }, []);

        // Recalculate prices when unitsPerPack changes
        useEffect(() => {
            const unitCost = item.unit_price / unitsPerPack;
            setForm(f => ({
                ...f,
                cost_price: parseFloat(unitCost.toFixed(4)),
                selling_price: Math.round(unitCost * 1.3)
            }));
            
            // Try to clean name if pack detected
            if (unitsPerPack > 1) {
                const cleanedName = item.raw_name.replace(/X\d+|x\d+/g, '').trim();
                setForm(f => ({ ...f, name: cleanedName }));
            } else {
                setForm(f => ({ ...f, name: item.raw_name }));
            }
        }, [unitsPerPack, item.unit_price, item.raw_name]);

        // Physical barcode scanner listener (match POS page)
        useEffect(() => {
            let barcode = '';
            const handleKeyDown = (e) => {
                // If scanner modal is open or add product modal is open
                if (e.key === 'Enter') {
                    if (barcode.length > 3) {
                        handleScan(barcode);
                    }
                    barcode = '';
                } else {
                    if (e.key.length === 1) barcode += e.key;
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, []);

        const handleScan = (code) => {
            if (!showAddProductModal) return; // Guard
            setForm(f => ({ ...f, barcode: code }));
            setShowScanner(false);
            toast.success(`สแกนสำเร็จ: ${code}`, { duration: 1500, position: 'top-center' });
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            try {
                // 1. Create Product
                const res = await api.post('/products', { ...form, sku });
                const newProduct = res.data.data;
                
                // 2. Link this item to the new product and scale quantity
                const updatedItems = selectedReceipt.items.map(i => {
                    if (i.id === item.id) {
                        return { 
                            ...i, 
                            product_id: newProduct.id, 
                            matched_name: newProduct.name,
                            quantity: i.quantity * unitsPerPack,
                            unit_price: i.unit_price / unitsPerPack
                        };
                    }
                    return i;
                });
                
                await api.put(`/ocr/${selectedReceipt.id}`, { items: updatedItems });
                
                toast.success(`สร้างสินค้า "${newProduct.name}" และเชื่อมโยงแล้ว`);
                onSuccess();
            } catch (err) {
                toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาด');
            }
        };

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 overflow-y-auto max-h-[90vh] animate-scale-up border border-white/20">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-black text-gray-800 tracking-tight">✨ เพิ่มสินค้าใหม่</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    
                    <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 mb-4">
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">ตรวจพบจากใบเสร็จ</p>
                        <p className="font-bold text-purple-800 leading-tight">{item.raw_name}</p>
                    </div>

                    <div className="flex items-center gap-3 mb-6 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <div className="flex-1">
                            <label className="block text-[10px] font-black text-blue-400 uppercase mb-1">แยกเป็นชิ้นปลีก?</label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-blue-800">1 แพ็ค =</span>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={unitsPerPack} 
                                    onChange={e => setUnitsPerPack(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-16 p-1.5 text-center bg-white border border-blue-200 rounded-xl text-sm font-black text-blue-700 outline-none focus:border-blue-400 transition-all"
                                />
                                <span className="text-sm font-bold text-blue-800">ชิ้น</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">ทุนต่อชิ้น</p>
                            <p className="text-lg font-black text-blue-700">฿{(item.unit_price / unitsPerPack).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">ชื่อสินค้าที่ต้องการใช้</label>
                            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field !py-3 !rounded-xl" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">SKU</label>
                                <input value={sku} readOnly className="input-field !py-3 !rounded-xl bg-gray-50 text-gray-500 font-mono" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">บาร์โค้ด</label>
                                <div className="flex gap-2">
                                    <input 
                                        value={form.barcode} 
                                        onChange={e => setForm({...form, barcode: e.target.value})} 
                                        className="input-field !py-3 !rounded-xl flex-1" 
                                        placeholder="สแกนหรือพิมพ์" 
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowScanner(true)}
                                        className="flex-shrink-0 w-12 h-12 rounded-xl text-white flex items-center justify-center shadow hover:opacity-90 active:scale-95 transition-all"
                                        style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}
                                    >
                                        <ScanIcon size={24} color="white" strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {showScanner && (
                            <BarcodeScanner 
                                onDetected={handleScan} 
                                onClose={() => setShowScanner(false)}
                                isContinuous={true}
                            />
                        )}

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">หมวดหมู่</label>
                            <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="input-field !py-3 !rounded-xl" required>
                                <option value="">-- เลือกหมวดหมู่ --</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-red-400 uppercase mb-1 ml-1">ราคาทุน (ต่อหน่วย)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-300 font-bold">฿</span>
                                    <input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})} className="input-field !py-3 !pl-7 !rounded-xl border-red-50 focus:border-red-200" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-green-500 uppercase mb-1 ml-1">
                                    ราคาขาย 
                                    <span className="ml-1 text-[10px] text-blue-500 lowercase">
                                        (กำไร {(parseFloat(form.selling_price || 0) - parseFloat(form.cost_price || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})} บาท)
                                    </span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-300 font-bold">฿</span>
                                    <input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} className="input-field !py-3 !pl-7 !rounded-xl border-green-50 focus:border-green-200" required />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-6">
                            <button type="button" onClick={onClose} className="btn-ghost flex-1 !rounded-2xl">ยกเลิก</button>
                            <button type="submit" className="btn-primary flex-1 !rounded-2xl !bg-purple-600 shadow-lg shadow-purple-100">สร้างสินค้า</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 tracking-tight">🧾 เพิ่มสต๊อกด้วย OCR</h1>
                    <p className="text-gray-500 text-sm">ถ่ายรูปหรืออัปโหลดใบเสร็จเพื่อเพิ่มสต๊อกอัตโนมัติ</p>
                </div>
                
                <div className="flex gap-2">
                    {/* Camera Capture (Mobile Optimized) */}
                    <label className={`
                        flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold transition-all cursor-pointer shadow-lg
                        ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:scale-105 active:scale-95'}
                    `}>
                        {uploading ? '⏳...' : '📸 ถ่ายรูป'}
                        <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} disabled={uploading} />
                    </label>

                    {/* File Upload */}
                    <label className={`
                        flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold transition-all cursor-pointer shadow-lg
                        ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:scale-105 active:scale-95'}
                    `}>
                        {uploading ? '⏳...' : '📁 เลือกไฟล์'}
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* List of Receipts */}
                <div className="lg:col-span-1 space-y-4 overflow-y-auto max-h-[calc(100vh-250px)] pr-2">
                    <h2 className="font-bold text-gray-700 px-1">ประวัติการอัปโหลด</h2>
                    {loading && receipts.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>
                    ) : receipts.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-3xl border-2 border-dashed border-gray-100 text-gray-400">
                            ไม่มีประวัติการอัปโหลด
                        </div>
                    ) : (
                        receipts.map(r => (
                            <button
                                key={r.id}
                                onClick={() => viewDetail(r.id)}
                                className={`
                                    w-full p-4 rounded-3xl text-left transition-all border-2
                                    ${selectedReceipt?.id === r.id ? 'bg-purple-50 border-purple-200 shadow-md scale-[1.02]' : 'bg-white border-transparent hover:border-gray-100 shadow-sm'}
                                `}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                        r.status === 'completed' ? 'bg-green-100 text-green-600' :
                                        r.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600 animate-pulse'
                                    }`}>
                                        {r.status}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                        {new Date(r.created_at).toLocaleString('th-TH')}
                                    </span>
                                </div>
                                <div className="font-bold text-gray-800 truncate">{r.vendor_name || 'กำลังประมวลผล...'}</div>
                                <div className="text-lg font-black text-purple-700">
                                    {r.total_amount ? `฿${r.total_amount.toLocaleString()}` : '-'}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Receipt Details */}
                <div className="lg:col-span-2 space-y-4">
                    {selectedReceipt ? (
                        <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden flex flex-col h-full max-h-[calc(100vh-250px)] animate-scale-up">
                            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                                <div>
                                    <h3 className="text-xl font-black text-gray-800">{selectedReceipt.vendor_name || 'กำลังประมวลผล'}</h3>
                                    <p className="text-xs text-gray-500">{selectedReceipt.id}</p>
                                </div>
                                <div className="flex gap-2">
                                    {!isEditing && selectedReceipt.status !== 'processing' && (
                                        <button onClick={() => handleDelete(selectedReceipt.id)} className="btn-ghost text-red-600 border-red-100 hover:bg-red-50 text-sm py-1">🗑️ ลบ</button>
                                    )}
                                    {!isEditing && selectedReceipt.status === 'completed' && (
                                        <button onClick={handleEditStart} className="btn-ghost text-sm py-1">✏️ แก้ไข</button>
                                    )}
                                    <button onClick={() => setSelectedReceipt(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* Status Alert */}
                                {selectedReceipt.status === 'failed' && (
                                    <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold border border-red-100">
                                        ❌ ข้อผิดพลาด: {selectedReceipt.error_message}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Image Preview */}
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">รูปภาพใบเสร็จ</p>
                                        <div 
                                            onClick={() => setIsImageModalOpen(true)}
                                            className="cursor-zoom-in rounded-3xl overflow-hidden border border-gray-100 hover:opacity-90 transition-all shadow-sm group relative"
                                        >
                                            <img src={selectedReceipt.signed_url || selectedReceipt.image_url} alt="Receipt" className="w-full object-contain max-h-96" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-all">
                                                <span className="text-white opacity-0 group-hover:opacity-100 text-3xl">🔍</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Items List */}
                                    <div className="space-y-4">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                            {isEditing ? 'แก้ไขรายการสินค้า' : 'รายการที่ตรวจพบ'}
                                        </p>
                                        <div className="space-y-2">
                                            {(isEditing ? editingItems : selectedReceipt.items)?.map((item, idx) => (
                                                <div key={idx} className={`p-3 rounded-2xl border transition-all relative ${isEditing ? 'bg-white border-purple-200 shadow-sm' : 'bg-gray-50 border-gray-100'}`}>
                                                    {isEditing ? (
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between items-start pr-8">
                                                                <input 
                                                                    className="w-full text-sm font-bold p-1 border-b border-gray-100 focus:border-purple-500 outline-none"
                                                                    value={item.raw_name}
                                                                    onChange={(e) => handleItemChange(idx, 'raw_name', e.target.value)}
                                                                />
                                                                <button 
                                                                    onClick={() => handleRemoveItem(idx)}
                                                                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                                                                    title="ลบรายการนี้"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                            <div className="flex gap-2 items-center">
                                                                <input 
                                                                    type="number" 
                                                                    className="w-16 text-xs p-1 bg-gray-50 rounded"
                                                                    value={item.quantity}
                                                                    onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value))}
                                                                />
                                                                <span className="text-[10px] text-gray-400">x</span>
                                                                <div className="flex items-center gap-0.5 bg-gray-50 rounded px-1 border border-transparent focus-within:border-purple-200 transition-all">
                                                                    <span className="text-[10px] text-purple-400 font-bold">฿</span>
                                                                    <input 
                                                                        type="number" 
                                                                        className="w-20 text-xs p-1 bg-transparent outline-none"
                                                                        value={item.unit_price}
                                                                        onChange={(e) => handleItemChange(idx, 'unit_price', parseFloat(e.target.value))}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <select 
                                                                className="w-full text-[11px] p-1 bg-purple-50 text-purple-700 rounded font-bold outline-none"
                                                                value={item.product_id || ''}
                                                                onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                                                            >
                                                                <option value="">-- เชื่อมโยงสินค้าในระบบ --</option>
                                                                {products.map(p => (
                                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex justify-between gap-2">
                                                                <span className="font-bold text-gray-700 text-sm leading-tight">{item.raw_name}</span>
                                                                <span className="font-black text-purple-700 whitespace-nowrap">฿{item.total_price?.toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[11px]">
                                                                <span className="text-gray-500">
                                                                    {item.quantity} x ฿{item.unit_price?.toLocaleString()}
                                                                </span>
                                                                {item.matched_name ? (
                                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                                                        ✓ ตรงกับ: {item.matched_name}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-amber-500 font-bold">⚠ ไม่พบสินค้าในระบบ</span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                            {(!selectedReceipt.items || selectedReceipt.items.length === 0) && (
                                                <p className="text-center py-10 text-gray-400 text-sm">ไม่พบรายการ</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-gray-50 bg-gray-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                                {isEditing ? (
                                    <div className="flex gap-2 w-full">
                                        <button onClick={() => setIsEditing(false)} className="btn-ghost flex-1">ยกเลิก</button>
                                        <button onClick={handleSaveEdits} className="btn-primary flex-1">💾 บันทึกการแก้ไข</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center gap-6">
                                            <div className="text-sm">
                                                <span className="text-gray-400 font-medium">วันที่:</span>
                                                <span className="ml-2 font-bold text-gray-700">{selectedReceipt.receipt_date || '-'}</span>
                                            </div>
                                            
                                            {/* Payment Info in Footer */}
                                            <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
                                                <div className="text-sm">
                                                    <span className="text-gray-400 font-medium">ชำระด้วย:</span>
                                                    <span className="ml-2 px-2 py-0.5 bg-white border border-gray-100 rounded-lg text-purple-700 font-bold text-xs uppercase shadow-sm">
                                                        {selectedReceipt.payment_method || 'Unknown'}
                                                    </span>
                                                </div>
                                                <div className="text-sm">
                                                    <span className="text-gray-400 font-medium">Ref:</span>
                                                    <span className="ml-2 font-mono text-gray-600 text-xs">
                                                        {selectedReceipt.transaction_id || '-'}
                                                    </span>
                                                </div>
                                            </div>

                                            {selectedReceipt.status === 'completed' && (
                                                <button 
                                                    onClick={handleAddToStock}
                                                    disabled={loading}
                                                    className={`
                                                        px-6 py-2.5 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center gap-2
                                                        ${selectedReceipt.items.every(i => i.is_stock_updated === 1) 
                                                            ? 'bg-gray-100 text-gray-400 cursor-default shadow-none' 
                                                            : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 active:scale-95'}
                                                    `}
                                                >
                                                    {selectedReceipt.items.every(i => i.is_stock_updated === 1) ? '✅ เพิ่มเข้าสต็อกแล้ว' : '📥 เพิ่มสินค้าเข้าสต็อก'}
                                                </button>
                                            )}
                                        </div>

                                        <div className="text-right">
                                            <p className="text-xs text-gray-400 font-bold uppercase">ยอดรวมสุทธิ</p>
                                            <p className="text-2xl font-black text-gray-800">฿{selectedReceipt.total_amount?.toLocaleString()}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                                (Total VAT: ฿{((selectedReceipt.total_amount || 0) * 7 / 107).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white rounded-[2rem] border-2 border-dashed border-gray-100 text-gray-300">
                            <span className="text-6xl mb-4">🔍</span>
                            <p className="font-bold">เลือกใบเสร็จเพื่อดูรายละเอียด</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Image Modal Popup */}
            {isImageModalOpen && selectedReceipt && createPortal(
                <div 
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in p-4 md:p-10"
                    onClick={() => setIsImageModalOpen(false)}
                >
                    <div className="relative w-full h-full flex items-center justify-center pt-16 pb-12">
                        <button 
                            className="fixed top-6 right-6 w-14 h-14 bg-white/10 hover:bg-white/30 text-white rounded-full flex items-center justify-center text-3xl transition-all z-[10000] backdrop-blur-md border border-white/20 shadow-xl"
                            onClick={() => setIsImageModalOpen(false)}
                        >
                            ✕
                        </button>
                        <img 
                            src={selectedReceipt.signed_url || selectedReceipt.image_url} 
                            alt="Full Receipt" 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-scale-up border border-white/5"
                            onClick={(e) => e.stopPropagation()} 
                        />
                    </div>
                </div>,
                document.body
            )}

            {/* Add New Product Modal */}
            {showAddProductModal && itemToCreate && createPortal(
                <AddProductModal 
                    item={itemToCreate} 
                    onClose={() => setShowAddProductModal(false)}
                    onSuccess={() => {
                        setShowAddProductModal(false);
                        viewDetail(selectedReceipt.id);
                        fetchProducts();
                    }}
                />,
                document.body
            )}
        </div>
    );
}
