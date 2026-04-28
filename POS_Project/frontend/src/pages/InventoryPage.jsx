import { useState, useEffect, useCallback, useRef } from "react";
import { formatCurrency } from "../utils/format";
import api from "../services/api";
import toast from "react-hot-toast";
import BarcodeScanner from "../components/BarcodeScanner";
import ScanIcon from "../components/ScanIcon";

const GRAD = "linear-gradient(to left,#3300FC,#95008A,#EB0000)";

const today = () => new Date().toISOString().slice(0, 10);

const THAI_BANKS = [
  "กสิกรไทย (KBank)",
  "ไทยพาณิชย์ (SCB)",
  "กรุงเทพ (BBL)",
  "กรุงไทย (KTB)",
  "กรุงศรีอยุธยา (BAY)",
  "ทหารไทยธนชาต (TTB)",
  "ออมสิน (GSB)",
];

function PackCalculator({ onApply, onUnlock }) {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState('');
  const [perPack, setPerPack] = useState('');
  const [packPrice, setPackPrice] = useState('');
  const [applied, setApplied] = useState(false);

  const numPacks   = parseFloat(packs)    || 0;
  const numPerPack = parseFloat(perPack)  || 0;
  const numPrice   = parseFloat(packPrice)|| 0;
  const totalItems = numPacks * numPerPack;
  const costPerItem = totalItems > 0 ? numPrice / numPerPack : 0;
  const totalCost  = numPacks * numPrice;

  const handleApply = () => {
    if (costPerItem <= 0) return;
    onApply(parseFloat(costPerItem.toFixed(4)));
    setApplied(true);
    setOpen(false);
  };

  const handleUnlock = () => {
    setApplied(false);
    setPacks(''); setPerPack(''); setPackPrice('');
    onUnlock();
  };

  return (
    <div className="col-span-2 mt-1">
      <button type="button"
        onClick={() => { if (!applied) setOpen(o => !o); }}
        className={"flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all " +
          (applied
            ? "border-green-300 text-green-700 bg-green-50 cursor-default"
            : "border-red-300 text-red-700 bg-red-50 hover:bg-red-100")}
      >
        <span>{applied ? '🔒' : '📦'}</span>
        {applied ? `ใช้ต้นทุนจากแพ็ค (฿${costPerItem.toFixed(2)}/ชิ้น)` : 'คำนวณจากแพ็ค'}
        {!applied && <span className="text-gray-400 ml-1">{open ? '▲' : '▼'}</span>}
      </button>
      {applied && (
        <button type="button" onClick={handleUnlock}
          className="ml-2 text-xs text-gray-400 hover:text-red-500 underline transition-colors">
          ยกเลิกล็อก
        </button>
      )}
      {open && !applied && (
        <div className="mt-2 rounded-2xl p-4 space-y-3"
          style={{ border: '2px solid #EB0000', background: 'rgba(235,0,0,0.03)' }}>
          <p className="text-sm font-bold" style={{ color: '#EB0000' }}>📦 คำนวณต้นทุนต่อชิ้นจากแพ็ค</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">จำนวนแพ็ค</label>
              <input type="number" min="1" value={packs}
                onChange={e => setPacks(e.target.value)}
                className="input-field !py-2 text-sm text-center" placeholder="5" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ชิ้น/แพ็ค</label>
              <input type="number" min="1" value={perPack}
                onChange={e => setPerPack(e.target.value)}
                className="input-field !py-2 text-sm text-center" placeholder="10" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ราคา/แพ็ค (฿)</label>
              <input type="number" min="0" step="0.01" value={packPrice}
                onChange={e => setPackPrice(e.target.value)}
                className="input-field !py-2 text-sm text-center" placeholder="50" />
            </div>
          </div>
          {totalItems > 0 && numPrice > 0 && (
            <div className="rounded-xl bg-white border border-red-100 divide-y divide-red-50 text-sm overflow-hidden">
              <div className="flex justify-between items-center px-3 py-2">
                <span className="text-gray-500">จำนวนทั้งหมด</span>
                <span className="font-semibold text-gray-700">{totalItems.toLocaleString()} ชิ้น</span>
              </div>
              <div className="flex justify-between items-center px-3 py-2">
                <span className="text-gray-500">ต้นทุนรวม</span>
                <span className="font-semibold text-gray-700">฿{totalCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center px-3 py-2 bg-red-50">
                <span className="font-bold" style={{ color: '#EB0000' }}>ต้นทุนต่อชิ้น</span>
                <span className="text-lg font-bold" style={{ color: '#EB0000' }}>฿{costPerItem.toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-all">
              ยกเลิก
            </button>
            <button type="button" onClick={handleApply}
              disabled={costPerItem <= 0}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold shadow disabled:opacity-40 hover:opacity-90 transition-all"
              style={{ backgroundImage: GRAD }}>
              ✅ ใช้ค่านี้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showLowStock, setShowLowStock] = useState(false);
  const [search, setSearch] = useState("");
  const [receiveModal, setReceiveModal] = useState(null); // item object
  const [form, setForm] = useState({ 
    quantity: "", 
    remark: "", 
    received_date: today(),
    payment_method: "cash",
    bank_name: "" 
  });
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [packLocked, setPackLocked] = useState(false);
  const [productForm, setProductForm] = useState({
    sku: '', barcode: '', name: '', description: '', category_id: '',
    cost_price: '', selling_price: '', image_url: '', is_featured: false, reorder_level: 5,
  });

  const [reorderModal, setReorderModal] = useState(null); // { id, name, level }
  const [newReorderLevel, setNewReorderLevel] = useState("");

  const isProcessingRef = useRef(false);
  const lastScanRef = useRef({ code: '', time: 0 });

  useEffect(() => { 
    loadInventory(); 
    loadCategories();
  }, [showLowStock]);

  const loadInventory = async () => {
    try {
      const res = await api.get("/inventory", { params: { low_stock: showLowStock } });
      setInventory(res.data.data);
    } catch { toast.error("โหลดสต๊อกไม่สำเร็จ"); }
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data.data);
    } catch {}
  };

  const generateSku = async () => {
    try {
      const res = await api.get('/products/generate-sku');
      return res.data.data.sku;
    } catch { return 'PRD' + Date.now().toString().slice(-6); }
  };

  const openReceive = useCallback((item) => {
    isProcessingRef.current = true; // Lock scanning
    setReceiveModal(item);
    setForm({ 
      quantity: "", 
      remark: "", 
      received_date: today(),
      payment_method: "cash",
      bank_name: "" 
    });
  }, []);

  const closeModals = useCallback(() => {
    setReceiveModal(null);
    setShowProductForm(false);
    setShowScanner(false);
    setReorderModal(null);
    setNewReorderLevel("");
    // Add a small buffer before allowing the next scan
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 500);
  }, []);

  const handleUpdateReorder = async (e) => {
    e.preventDefault();
    const level = parseInt(newReorderLevel);
    if (isNaN(level) || level < 0) { toast.error("กรุณากรอกตัวเลขที่ถูกต้อง"); return; }
    setSaving(true);
    try {
      await api.put("/inventory/reorder-level", {
        product_id: reorderModal.id,
        reorder_level: level
      });
      toast.success("อัปเดตจุดสั่งซื้อสำเร็จ");
      closeModals();
      loadInventory();
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const handleBarcodeDetected = useCallback(async (barcode) => {
    // Parent-level lock
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // 1. Immediately hide scanner UI
    setShowScanner(false);
    
    // 2. Logic check
    const found = inventory.find(i => i.barcode === barcode || i.sku === barcode);
    if (found) {
      openReceive(found);
    } else {
      toast.dismiss();
      toast.error(`ไม่พบสินค้า "${barcode}"`, { id: 'not-found', duration: 2000 });
      
      const newSku = await generateSku();
      setPackLocked(false);
      setProductForm({ 
        sku: newSku, 
        barcode: barcode, 
        name: '', 
        description: '', 
        category_id: '',
        cost_price: '', 
        selling_price: '', 
        image_url: '', 
        is_featured: false, 
        reorder_level: 5 
      });
      setShowProductForm(true);
    }
  }, [inventory, openReceive]);

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearch(val);
    
    if (!val || isProcessingRef.current) return;

    const found = inventory.find(i => i.name.toLowerCase() === val.toLowerCase() || i.barcode === val || i.sku === val);
    if (found) {
      isProcessingRef.current = true;
      openReceive(found);
      setSearch("");
    }
  }, [inventory, openReceive]);

  const handleReceive = async (e) => {
    e.preventDefault();
    const qty = parseInt(form.quantity);
    if (!qty || qty <= 0) { toast.error("กรุณากรอกจำนวน"); return; }
    if (form.payment_method === "credit_card" && !form.bank_name) {
      toast.error("กรุณาเลือกธนาคาร"); return;
    }
    setSaving(true);
    try {
      await api.post("/inventory/receive", {
        product_id: receiveModal.id,
        quantity: qty,
        remark: form.remark || "รับเข้าสต๊อก",
        received_date: form.received_date,
        payment_method: form.payment_method,
        bank_name: form.payment_method === "credit_card" ? form.bank_name : undefined
      });
      toast.success(`รับสินค้า "${receiveModal.name}" เข้า ${qty} ชิ้น สำเร็จ`);
      closeModals();
      loadInventory();
    } catch { toast.error("เกิดข้อผิดพลาด"); }
    finally { setSaving(false); }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/products', productForm);
      toast.success('เพิ่มสินค้าใหม่สำเร็จ');
      loadInventory();
      // Keep processing flag true and transition to receive modal
      setReceiveModal(res.data.data);
      setShowProductForm(false);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาด');
      setSaving(false);
    } finally { setSaving(false); }
  };

  const filtered = inventory.filter(item =>
    !search ||
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.sku.toLowerCase().includes(search.toLowerCase()) ||
    item.barcode?.includes(search)
  );

  const lowCount = inventory.filter(i => i.quantity <= i.reorder_level).length;

  return (
    <div className="p-4 md:p-6 overflow-y-auto h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-800">🏪 จัดการสต๊อก</h1>
        <div className="flex items-center gap-3">
          {lowCount > 0 && (
            <span className="text-xs bg-red-100 text-red-600 font-semibold px-3 py-1.5 rounded-xl">
              ⚠️ ใกล้หมด {lowCount} รายการ
            </span>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={() => setShowLowStock(v => !v)}
              className={"w-10 h-5 rounded-full transition-all relative " + (showLowStock ? "bg-red-50" : "bg-gray-300")}>
              <div className={"absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all " + (showLowStock ? "left-5" : "left-0.5")} />
            </div>
            <span className="text-sm font-medium text-gray-600">แสดงเฉพาะใกล้หมด</span>
          </label>
        </div>
      </div>

      {/* Search & Scanner */}
      <div className="flex gap-2 mb-4 max-w-md">
        <input type="text" placeholder="🔍 ค้นหาชื่อสินค้า / SKU / บาร์โค้ด"
          value={search} onChange={handleSearchChange}
          className="input-field flex-1" />
        <button onClick={() => setShowScanner(true)}
          className="flex-shrink-0 w-11 h-11 rounded-xl text-white flex items-center justify-center shadow hover:opacity-90 active:scale-95 transition-all"
          style={{ backgroundImage: GRAD }}>
          <ScanIcon size={22} color="white" strokeWidth={2} />
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="pb-3 pr-3 font-medium">SKU</th>
              <th className="pb-3 pr-3 font-medium">ชื่อสินค้า</th>
              <th className="pb-3 pr-3 font-medium hidden md:table-cell">หมวดหมู่</th>
              <th className="pb-3 pr-3 font-medium text-right hidden md:table-cell">ต้นทุน</th>
              <th className="pb-3 pr-3 font-medium text-right">คงเหลือ</th>
              <th className="pb-3 pr-3 font-medium text-right hidden md:table-cell">จุดสั่งซื้อ</th>
              <th className="pb-3 font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const low = item.quantity <= item.reorder_level;
              return (
                <tr key={item.id}
                  className={"border-b border-gray-50 transition-colors " + (low ? "bg-red-50" : "hover:bg-purple-50")}>
                  <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">{item.sku}</td>
                  <td className="py-2.5 pr-3 font-medium text-gray-800">{item.name}</td>
                  <td className="py-2.5 pr-3 text-gray-400 text-xs hidden md:table-cell">{item.category_name}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-500 hidden md:table-cell">{formatCurrency(item.cost_price)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className={"font-bold " + (low ? "text-red-600" : "text-green-600")}>
                      {item.quantity}
                    </span>
                    {low && <span className="ml-1 text-xs">⚠️</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-400 hidden md:table-cell">
                    <button 
                      onClick={() => { setReorderModal(item); setNewReorderLevel(item.reorder_level); isProcessingRef.current = true; }}
                      className="hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-all flex items-center justify-end gap-1 ml-auto"
                      title="แก้ไขจุดสั่งซื้อ"
                    >
                      {item.reorder_level}
                      <span className="text-[10px]">✏️</span>
                    </button>
                  </td>
                  <td className="py-2.5">
                    <button onClick={() => openReceive(item)}
                      className="text-xs px-3 py-1.5 rounded-xl text-white font-semibold hover:opacity-90 active:scale-95 transition-all"
                      style={{ backgroundImage: GRAD }}>
                      + รับเข้า
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-400 py-10">ไม่พบสินค้า</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Receive Modal */}
      {receiveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-bold text-gray-800 mb-1">📦 รับสินค้าเข้าสต๊อก</h3>
            <p className="text-sm text-gray-500 mb-5">
              {receiveModal.name}
              <span className="ml-2 text-xs text-gray-400">({receiveModal.sku})</span>
              <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                คงเหลือ {receiveModal.quantity} ชิ้น
              </span>
            </p>

            <form onSubmit={handleReceive} className="space-y-4">
              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  จำนวนที่รับเข้า <span className="text-red-500">*</span>
                </label>
                <input type="number" min="1" autoFocus required
                  value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="input-field text-xl font-bold text-center" placeholder="0" />
              </div>

              {/* Received Date */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  วันที่รับสินค้า <span className="text-red-500">*</span>
                </label>
                <input type="date" required
                  value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })}
                  max={today()} className="input-field" />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">ชำระเงินด้วย</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: "cash" })}
                    className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      form.payment_method === "cash"
                        ? "border-purple-600 bg-purple-50 text-purple-700"
                        : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"
                    }`}
                  >
                    💵 เงินสด
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: "credit_card" })}
                    className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      form.payment_method === "credit_card"
                        ? "border-purple-600 bg-purple-50 text-purple-700"
                        : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"
                    }`}
                  >
                    💳 บัตรเครดิต
                  </button>
                </div>
              </div>

              {/* Bank Selection (if Credit Card) */}
              {form.payment_method === "credit_card" && (
                <div className="animate-fade-in">
                  <label className="block text-sm font-medium text-gray-600 mb-1">เลือกธนาคาร <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={form.bank_name}
                    onChange={e => setForm({ ...form, bank_name: e.target.value })}
                    className="input-field"
                  >
                    <option value="">-- เลือกธนาคาร --</option>
                    {THAI_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cost preview */}
              {form.quantity > 0 && (
                <div className="bg-purple-50 rounded-2xl px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-gray-600">ต้นทุนรวม ({form.quantity} × {formatCurrency(receiveModal.cost_price)})</span>
                  <span className="font-bold text-purple-700">
                    {formatCurrency(parseInt(form.quantity || 0) * receiveModal.cost_price)}
                  </span>
                </div>
              )}

              {/* Remark */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">หมายเหตุ</label>
                <input type="text" value={form.remark}
                  onChange={e => setForm({ ...form, remark: e.target.value })}
                  className="input-field" placeholder="รับเข้าสต๊อก / ซื้อจากซัพพลายเออร์..." />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModals} className="btn-ghost flex-1">ยกเลิก</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl text-white font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                  style={{ backgroundImage: GRAD }}>
                  {saving ? "กำลังบันทึก..." : "📦 ยืนยันรับเข้า"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Product Modal (if barcode not found) */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto animate-scale-up">
            <h2 className="text-xl font-bold mb-4 text-gray-800">➕ เพิ่มสินค้าใหม่ (ไม่พบในระบบ)</h2>
            <form onSubmit={handleProductSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">รหัสสินค้า (SKU)</label>
                  <input value={productForm.sku} readOnly className="input-field bg-gray-50 text-gray-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">บาร์โค้ด</label>
                  <input 
                    value={productForm.barcode} 
                    onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                    readOnly={!!productForm.barcode}
                    className={"input-field " + (productForm.barcode ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "")} 
                    placeholder="กรอกบาร์โค้ด" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อสินค้า*</label>
                <input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">หมวดหมู่</label>
                <select value={productForm.category_id} onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                  className="input-field">
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">ราคาต้นทุน*</label>
                  <div className="relative">
                    <input type="number" step="0.01" value={productForm.cost_price}
                      onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })}
                      disabled={packLocked}
                      className={"input-field " + (packLocked ? "bg-gray-100 text-gray-500" : "")}
                      required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ราคาขาย*</label>
                  <input type="number" step="0.01" value={productForm.selling_price}
                    onChange={(e) => setProductForm({ ...productForm, selling_price: e.target.value })}
                    className="input-field" required />
                </div>
                <PackCalculator
                  onApply={(cost) => { setProductForm(f => ({ ...f, cost_price: cost })); setPackLocked(true); }}
                  onUnlock={() => { setPackLocked(false); setProductForm(f => ({ ...f, cost_price: '' })); }}
                />
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={closeModals} className="btn-ghost flex-1">ยกเลิก</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : '✅ เพิ่มสินค้าและรับเข้า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reorder Level Modal */}
      {reorderModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-scale-up">
            <h3 className="text-lg font-bold text-gray-800 mb-1">⚙️ แก้ไขจุดสั่งซื้อ</h3>
            <p className="text-sm text-gray-500 mb-5">
              {reorderModal.name} 
              <span className="ml-1 text-xs text-gray-400">({reorderModal.sku})</span>
            </p>

            <form onSubmit={handleUpdateReorder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  จำนวนขั้นต่ำ (จุดสั่งซื้อ) <span className="text-red-500">*</span>
                </label>
                <input type="number" min="0" autoFocus required
                  value={newReorderLevel} onChange={e => setNewReorderLevel(e.target.value)}
                  className="input-field text-xl font-bold text-center" placeholder="5" />
                <p className="text-xs text-gray-400 mt-2">
                  เมื่อสินค้าคงเหลือต่ำกว่าหรือเท่ากับค่านี้ ระบบจะแสดงสถานะ ⚠️ เตือน
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModals} className="btn-ghost flex-1">ยกเลิก</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl text-white font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                  style={{ backgroundImage: GRAD }}>
                  {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
