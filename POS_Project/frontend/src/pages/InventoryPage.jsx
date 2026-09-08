import { useState, useEffect, useCallback, useRef } from "react";
import { formatCurrency } from "../utils/format";
import { compressImage, formatBytes } from "../utils/imageCompressor";
import api from "../services/api";
import toast from "react-hot-toast";
import BarcodeScanner from "../components/BarcodeScanner";
import ScanIcon from "../components/ScanIcon";
import BatchReceiveModal from "../components/BatchReceiveModal";

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
  const [showBatchReceive, setShowBatchReceive] = useState(false);
  const [form, setForm] = useState({ 
    quantity: "", 
    remark: "", 
    received_date: today(),
    payment_method: "cash",
    bank_name: "",
    new_cost_price: ""
  });

  // Single receive image states
  const [singleReceiptPreview, setSingleReceiptPreview] = useState(null);
  const [singleReceiptUrl, setSingleReceiptUrl] = useState("");
  const [singleCompressStats, setSingleCompressStats] = useState(null);
  const [uploadingSingleImage, setUploadingSingleImage] = useState(false);

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

  const [historyModal, setHistoryModal] = useState(null); // item object
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null); // URL for full screen image modal

  const isProcessingRef = useRef(false);

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
    setSingleReceiptPreview(null);
    setSingleReceiptUrl("");
    setSingleCompressStats(null);
    const nw = parseFloat(item.net_weight) || 1;
    const defaultPackPrice = item.cost_price ? Number((item.cost_price * nw).toFixed(2)) : "";
    setForm({
      quantity: "1",
      net_weight: String(nw),
      remark: "",
      received_date: today(),
      payment_method: "cash",
      bank_name: "",
      new_cost_price: defaultPackPrice ? String(defaultPackPrice) : ""
    });
  }, []);

  const closeModals = useCallback(() => {
    setReceiveModal(null);
    setShowProductForm(false);
    setShowScanner(false);
    setReorderModal(null);
    setNewReorderLevel("");
    setHistoryModal(null);
    setViewingReceiptUrl(null);
    setShowBatchReceive(false);
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 500);
  }, []);

  const openHistory = useCallback(async (item) => {
    isProcessingRef.current = true;
    setHistoryModal(item);
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res = await api.get(`/inventory/transactions/${item.id || item.product_id}`);
      setHistoryData(res.data.data);
    } catch {
      toast.error("โหลดประวัติสต๊อกไม่สำเร็จ");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Single receive image upload & compression
  const handleSingleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploadingSingleImage(true);
      toast.loading("กำลังบีบอัดรูปภาพ...", { id: "single-img" });

      const compressedResult = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.75 });
      setSingleCompressStats(compressedResult);

      const previewUrl = URL.createObjectURL(compressedResult.file);
      setSingleReceiptPreview(previewUrl);

      toast.loading("กำลังอัปโหลดไปยัง Cloudflare R2...", { id: "single-img" });
      const formData = new FormData();
      formData.append("receipt", compressedResult.file);

      const res = await api.post("/inventory/upload-receipt", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setSingleReceiptUrl(res.data.url);
      toast.success("อัปโหลดหลักฐานสำเร็จ", { id: "single-img" });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error?.message || "อัปโหลดรูปภาพไม่สำเร็จ", { id: "single-img" });
      setSingleReceiptPreview(null);
      setSingleReceiptUrl("");
      setSingleCompressStats(null);
    } finally {
      setUploadingSingleImage(false);
    }
  };

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
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setShowScanner(false);
    
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
    const packQty = parseInt(form.quantity);
    const netWeight = singleNetWeight;
    const totalBaseQty = packQty * netWeight;

    if (!packQty || packQty <= 0) { toast.error("กรุณากรอกจำนวนแพ็คที่รับเข้า"); return; }
    if (!netWeight || netWeight <= 0) { toast.error("กรุณากรอกปริมาณต่อแพ็ค"); return; }
    if (form.payment_method === "credit_card" && !form.bank_name) {
      toast.error("กรุณาเลือกธนาคาร"); return;
    }
    if (!singleReceiptUrl) {
      toast.error("⚠️ กรุณาอัปโหลดรูปภาพใบเสร็จ / หลักฐานการรับสินค้า"); return;
    }

    setSaving(true);
    try {
      const res = await api.post("/inventory/receive", {
        product_id: receiveModal.id,
        quantity: totalBaseQty,
        remark: form.remark || `รับเข้า ${packQty} แพ็ค (${netWeight} ${receiveModal.unit || 'ชิ้น'}/แพ็ค)`,
        received_date: form.received_date,
        payment_method: form.payment_method,
        bank_name: form.payment_method === "credit_card" ? form.bank_name : undefined,
        new_cost_price: hasNextReceiveCost ? nextReceiveCost : undefined,
        receipt_url: singleReceiptUrl
      });
      toast.success(res.data.message || `รับสินค้า "${receiveModal.name}" เข้า ${totalBaseQty} ${receiveModal.unit || 'ชิ้น'} สำเร็จ`);
      closeModals();
      loadInventory();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "เกิดข้อผิดพลาด");
    } finally { setSaving(false); }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/products', productForm);
      toast.success('เพิ่มสินค้าใหม่สำเร็จ');
      loadInventory();
      setReceiveModal({ ...res.data.data, quantity: 0, pending_cost_price: null });
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
  const currentReceiveCost = receiveModal ? Number(receiveModal.cost_price) || 0 : 0;
  const singleNetWeight = receiveModal ? (parseFloat(receiveModal.net_weight) || 1) : 1;
  const currentReceivePackCost = receiveModal ? Number((currentReceiveCost * singleNetWeight).toFixed(2)) : 0;
  
  const pendingReceiveCost = receiveModal && receiveModal.pending_cost_price !== null && receiveModal.pending_cost_price !== undefined && receiveModal.pending_cost_price !== ""
    ? Number(receiveModal.pending_cost_price)
    : null;
  const nextReceivePackCostInput = form.new_cost_price ?? "";
  const nextReceivePackCost = nextReceivePackCostInput === "" ? null : Number(nextReceivePackCostInput);
  const hasNextReceiveCost = nextReceivePackCost !== null && !Number.isNaN(nextReceivePackCost);
  const nextReceiveCost = hasNextReceiveCost ? Number((nextReceivePackCost / singleNetWeight).toFixed(4)) : null;
  const receiveCostWillChange = hasNextReceiveCost && nextReceiveCost !== currentReceiveCost;
  const previewReceivePackCost = hasNextReceiveCost ? nextReceivePackCost : currentReceivePackCost;

  return (
    <div className="p-4 md:p-6 overflow-y-auto h-[calc(100vh-56px)]">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            🏪 จัดการสต๊อก
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">จัดการสินค้า คงเหลือ จุดสั่งซื้อ และการรับสินค้าเข้าคลัง</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Multi-Product Batch Receive Button */}
          <button
            onClick={() => { setShowBatchReceive(true); isProcessingRef.current = true; }}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
            style={{ backgroundImage: GRAD }}
          >
            <span>📦</span>
            <span>+ รับเข้าสินค้าหลายรายการ</span>
          </button>

          {lowCount > 0 && (
            <span className="text-xs bg-red-100 text-red-600 font-semibold px-3 py-2 rounded-xl flex items-center gap-1">
              ⚠️ ใกล้หมด {lowCount} รายการ
            </span>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl">
            <div onClick={() => setShowLowStock(v => !v)}
              className={"w-9 h-5 rounded-full transition-all relative " + (showLowStock ? "bg-red-500" : "bg-gray-300")}>
              <div className={"absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all " + (showLowStock ? "left-4" : "left-0.5")} />
            </div>
            <span className="text-xs font-semibold text-gray-600">แสดงเฉพาะใกล้หมด</span>
          </label>
        </div>
      </div>

      {/* Search & Barcode Scanner */}
      <div className="flex gap-2 mb-4 max-w-md">
        <input type="text" placeholder="🔍 ค้นหาชื่อสินค้า / SKU / บาร์โค้ด"
          value={search} onChange={handleSearchChange}
          className="input-field flex-1" />
        <button onClick={() => setShowScanner(true)}
          className="flex-shrink-0 w-11 h-11 rounded-xl text-white flex items-center justify-center shadow hover:opacity-90 active:scale-95 transition-all"
          style={{ backgroundImage: GRAD }}
          title="สแกนบาร์โค้ด"
        >
          <ScanIcon size={22} color="white" strokeWidth={2} />
        </button>
      </div>

      {/* Inventory Table */}
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
                  className={"border-b border-gray-50 transition-colors " + (low ? "bg-red-50/70" : "hover:bg-purple-50/50")}>
                  <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">{item.sku}</td>
                  <td className="py-2.5 pr-3 font-medium text-gray-800">
                    <button 
                      type="button" 
                      onClick={() => openHistory(item)}
                      className="text-left font-medium text-gray-800 hover:text-purple-600 hover:underline transition-colors focus:outline-none"
                      title="คลิกเพื่อดูประวัติการทำรายการและใบเสร็จ PO"
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-400 text-xs hidden md:table-cell">{item.category_name}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-500 hidden md:table-cell">
                    <div className="flex flex-col items-end">
                      <span>{formatCurrency(item.cost_price)} / {item.unit || 'ชิ้น'}</span>
                      {item.pending_cost_price !== null && item.pending_cost_price !== undefined && item.quantity > 0 && (() => {
                        const oldRemain = item.quantity - (item.last_receive_qty || 0);
                        return (
                          <span className="text-[10px] text-amber-600 font-medium whitespace-nowrap">
                            คิวถัดไป: {formatCurrency(item.pending_cost_price)} {oldRemain > 0 ? `(เหลืออีก ${oldRemain} ${item.unit || 'ชิ้น'})` : '(มีผลรายการถัดไป)'}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <button 
                      type="button"
                      onClick={() => openHistory(item)}
                      className={"font-bold transition-all hover:scale-105 active:scale-95 hover:underline focus:outline-none " + (low ? "text-red-600" : "text-green-600")}
                      title="คลิกเพื่อดูประวัติสต๊อก"
                    >
                      {item.quantity}
                    </button>
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
                    {item.is_raw_material === 1 ? (
                      <button onClick={() => openReceive(item)}
                        className="text-xs px-3 py-1.5 rounded-xl text-white font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm"
                        style={{ backgroundImage: GRAD }}>
                        + รับเข้า
                      </button>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-lg font-medium text-slate-400 bg-slate-100/80 border border-slate-200/80 inline-block">
                        🛍️ สินค้าขาย (ปรุงจากสูตร)
                      </span>
                    )}
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

      {/* Single Item Receive Modal */}
      {receiveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 overflow-y-auto max-h-[92vh] animate-scale-up">
            <h3 className="text-lg font-bold text-gray-800 mb-1">📦 รับสินค้าเข้าสต๊อก</h3>
            <p className="text-sm text-gray-500 mb-4">
              {receiveModal.name}
              <span className="ml-2 text-xs text-gray-400 font-mono">({receiveModal.sku})</span>
              <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                คงเหลือ {receiveModal.quantity} {receiveModal.unit || 'ชิ้น'}
              </span>
            </p>

            <form onSubmit={handleReceive} className="space-y-4">
              {/* Quantity (Packs) & Net Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    จำนวนแพ็คที่รับเข้า <span className="text-red-500">*</span>
                  </label>
                  <input type="number" min="1" autoFocus required
                    value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="input-field text-lg font-bold text-center" placeholder="1" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center justify-between">
                    <span>ปริมาณ/แพ็ค ({receiveModal.unit || 'ชิ้น'})</span>
                    <span className="text-[10px] text-gray-400 font-normal">🔒 ล็อกตามสินค้า</span>
                  </label>
                  <input type="text" readOnly disabled
                    value={`${singleNetWeight} ${receiveModal.unit || 'ชิ้น'}`}
                    className="input-field text-lg font-bold text-center bg-gray-100/80 text-gray-600 cursor-not-allowed select-none border-gray-200" />
                </div>
              </div>
              {form.quantity > 0 && (
                <div className="text-xs text-purple-700 font-bold bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100 flex items-center justify-between">
                  <span>รวมรับเข้าสต๊อกทั้งสิ้น:</span>
                  <span>{(parseInt(form.quantity || 0) * singleNetWeight).toLocaleString()} {receiveModal.unit || 'ชิ้น'}</span>
                </div>
              )}

              {/* Received Date */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  วันที่รับสินค้า <span className="text-red-500">*</span>
                </label>
                <input type="date" required
                  value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })}
                  max={today()} className="input-field text-sm" />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">ชำระเงินด้วย</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: "cash" })}
                    className={`py-2 rounded-xl border-2 text-xs font-bold transition-all ${
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
                    className={`py-2 rounded-xl border-2 text-xs font-bold transition-all ${
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
                    className="input-field text-sm"
                  >
                    <option value="">-- เลือกธนาคาร --</option>
                    {THAI_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Compulsory Receipt Image Upload */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
                  <span>📷 แนบรูปใบเสร็จ / ใบส่งของ <span className="text-red-500">*</span></span>
                  <span className="text-[10px] font-normal text-gray-400">R2 Storage</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                    singleReceiptUrl
                      ? "border-green-400 bg-green-50/50"
                      : "border-purple-300 bg-purple-50/40 hover:bg-purple-50"
                  }`}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSingleImageChange}
                      className="hidden"
                      disabled={uploadingSingleImage}
                    />
                    <span className="text-xl">{uploadingSingleImage ? "⏳" : singleReceiptUrl ? "✅" : "📤"}</span>
                    <div className="text-left">
                      <p className="text-xs font-bold text-gray-700">
                        {uploadingSingleImage
                          ? "กำลังบีบอัดและอัปโหลด..."
                          : singleReceiptUrl
                          ? "อัปโหลดแล้ว (คลิกเปลี่ยน)"
                          : "เลือกรูปภาพใบเสร็จ"}
                      </p>
                      {singleCompressStats && (
                        <p className="text-[10px] text-green-600 font-mono">
                          {formatBytes(singleCompressStats.originalSize)} ➔ {formatBytes(singleCompressStats.compressedSize)}
                        </p>
                      )}
                    </div>
                  </label>

                  {singleReceiptPreview && (
                    <div className="relative w-14 h-14 rounded-xl border border-purple-200 overflow-hidden flex-shrink-0 bg-gray-100">
                      <img src={singleReceiptPreview} alt="Receipt Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              {/* New cost price */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center justify-between">
                  <span>ราคารวมยกแพ็ค (บาท)</span>
                  {singleNetWeight > 1 && (
                    <span className="text-xs font-normal text-indigo-600">
                      (ปัจจุบัน ฿{currentReceivePackCost.toFixed(2)} / แพ็ค {singleNetWeight} {receiveModal.unit || 'ชิ้น'})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.new_cost_price}
                  onChange={e => setForm({ ...form, new_cost_price: e.target.value })}
                  className="input-field text-sm font-bold"
                  placeholder={`${currentReceivePackCost.toFixed(2)}`}
                />
                {singleNetWeight > 1 && hasNextReceiveCost && (
                  <p className="text-xs mt-1 text-indigo-600 font-medium">
                    (คิดเป็นต้นทุนต่อหน่วย ฿{nextReceiveCost.toFixed(2)} / {receiveModal.unit || 'ชิ้น'})
                  </p>
                )}
                {pendingReceiveCost !== null && receiveModal.quantity > 0 && (
                  <p className="text-xs mt-1 text-sky-600">
                    ล็อกที่ {formatCurrency(currentReceiveCost)}. ต้นทุนใหม่รอดำเนินการ: {formatCurrency(pendingReceiveCost)} เมื่อสต๊อกเหลือ 0
                  </p>
                )}
                {receiveCostWillChange && (
                  <p className="text-xs mt-1 text-amber-600">
                    {receiveModal.quantity > 0
                      ? "⏳ ต้นทุนใหม่จะใช้เมื่อสินค้าเก่าหมด (stock = 0)"
                      : "✅ ต้นทุนใหม่จะใช้ทันที (stock ปัจจุบัน = 0)"}
                  </p>
                )}
              </div>

              {/* Cost preview */}
              {form.quantity > 0 && (
                <div className="bg-purple-50 rounded-2xl px-4 py-2.5 flex justify-between items-center text-xs">
                  <span className="text-gray-600">
                    ต้นทุนรวม ({form.quantity} × {formatCurrency(previewReceivePackCost)})
                  </span>
                  <span className="font-bold text-purple-700 text-sm">
                    {formatCurrency(parseInt(form.quantity || 0) * previewReceivePackCost)}
                  </span>
                </div>
              )}

              {/* Remark */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">หมายเหตุ</label>
                <input type="text" value={form.remark}
                  onChange={e => setForm({ ...form, remark: e.target.value })}
                  className="input-field text-sm" placeholder="รับเข้าสต๊อก / ซื้อจากซัพพลายเออร์..." />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModals} className="btn-ghost flex-1">ยกเลิก</button>
                <button type="submit" disabled={saving || uploadingSingleImage || !singleReceiptUrl}
                  className="flex-1 py-3 rounded-xl text-white font-bold shadow-md hover:opacity-90 disabled:opacity-40 transition-all text-sm"
                  style={{ backgroundImage: GRAD }}>
                  {saving ? "กำลังบันทึก..." : "📦 ยืนยันรับเข้า (สร้าง PO)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Receive Modal */}
      {showBatchReceive && (
        <BatchReceiveModal
          inventory={inventory}
          onClose={closeModals}
          onSuccess={() => {
            closeModals();
            loadInventory();
          }}
        />
      )}

      {/* Add New Product Modal */}
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

      {/* Stock History Modal */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] flex flex-col animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-1.5">📜 ประวัติรายการสต๊อก & PO</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{historyModal.sku}</p>
              </div>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            
            <div className="py-3 flex-shrink-0 bg-purple-50/50 rounded-2xl px-4 my-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-700">{historyModal.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">ราคาขาย: {formatCurrency(historyModal.selling_price)}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-400">สต๊อกคงเหลือ</span>
                <p className={`text-lg font-black ${historyModal.quantity <= historyModal.reorder_level ? 'text-red-600' : 'text-green-600'}`}>
                  {historyModal.quantity} ชิ้น
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 my-2 min-h-[250px]">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-200 border-t-purple-600 mb-2"></div>
                  <p className="text-xs text-gray-400">กำลังโหลดประวัติ...</p>
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-4xl mb-2">📦</p>
                  <p className="text-sm text-gray-500 font-medium">ยังไม่มีประวัติการทำรายการสำหรับสินค้านี้</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyData.map((tx) => {
                    const isCostChange = tx.type === 'adjust' && tx.quantity === 0 && tx.remark?.includes('ต้นทุน');
                    const typeLabel = isCostChange
                      ? { label: "🏷️ เปลี่ยนราคาต้นทุน", bg: "bg-indigo-50 text-indigo-700 border-indigo-100" }
                      : {
                          receive: { label: "📥 รับสินค้าเข้า", bg: "bg-green-50 text-green-700 border-green-100" },
                          issue: { label: "📤 เบิกสต๊อกออก", bg: "bg-red-50 text-red-700 border-red-100" },
                          adjust: { label: "🔧 ปรับปรุงยอด", bg: "bg-amber-50 text-amber-700 border-amber-100" },
                          sale: { label: "🛍️ ขายหน้าร้าน", bg: "bg-purple-50 text-purple-700 border-purple-100" },
                          return: { label: "🔄 ลูกค้าคืนของ", bg: "bg-blue-50 text-blue-700 border-blue-100" }
                        }[tx.type] || { label: tx.type, bg: "bg-gray-50 text-gray-600" };

                    const isPositive = tx.quantity > 0;
                    
                    let timeStr = tx.created_at || "";
                    if (timeStr && timeStr.includes("T")) {
                      const d = new Date(timeStr);
                      const day = String(d.getDate()).padStart(2, '0');
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const year = d.getFullYear();
                      const hrs = String(d.getHours()).padStart(2, '0');
                      const mins = String(d.getMinutes()).padStart(2, '0');
                      timeStr = `${day}/${month}/${year} ${hrs}:${mins}`;
                    }

                    return (
                      <div key={tx.id} className="p-3 border border-gray-100 rounded-2xl flex flex-col gap-2 hover:bg-gray-50/50 transition-colors">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${typeLabel.bg}`}>
                                {typeLabel.label}
                              </span>
                              {tx.po_number && (
                                <span className="text-[10px] bg-purple-100 text-purple-700 font-mono font-bold px-2 py-0.5 rounded-md">
                                  PO: {tx.po_number}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400">
                                โดย: {tx.user_name || "ระบบ"}
                              </span>
                            </div>
                            {tx.remark && (
                              <p className="text-xs text-gray-600 font-medium leading-relaxed">{tx.remark}</p>
                            )}
                            <p className="text-[10px] text-gray-400 font-mono">{timeStr}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {isCostChange ? (
                              <span className="font-semibold text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg select-none">
                                เปลี่ยนต้นทุน
                              </span>
                            ) : (
                              <>
                                <span className={`font-mono font-bold text-sm ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                                  {isPositive ? `+${tx.quantity}` : tx.quantity}
                                </span>
                                <span className="text-[10px] text-gray-400 ml-0.5">{historyModal?.unit || 'ชิ้น'}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Receipt Button if available */}
                        {tx.receipt_url && (
                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <span>🧾</span>
                              <span>มีหลักฐานการรับสินค้า</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setViewingReceiptUrl(tx.receipt_url)}
                              className="text-xs text-purple-600 font-bold hover:underline flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              <span>🖼️</span>
                              <span>ดูใบเสร็จ</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 flex-shrink-0">
              <button onClick={closeModals} className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full screen Receipt Viewer Modal */}
      {viewingReceiptUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-4 max-w-3xl w-full max-h-[90vh] flex flex-col animate-scale-up relative">
            <div className="flex items-center justify-between mb-3 pb-2 border-b">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span>🧾</span>
                <span>หลักฐานการรับสินค้า / ใบเสร็จ PO</span>
              </h3>
              <button
                onClick={() => setViewingReceiptUrl(null)}
                className="text-gray-400 hover:text-gray-700 text-xl font-bold"
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
                className="px-4 py-2 rounded-xl bg-purple-50 text-purple-700 font-bold text-xs hover:bg-purple-100 transition-colors"
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
