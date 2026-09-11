import { useState, useEffect, useCallback, useRef } from "react";
import { formatCurrency, formatQty } from "../utils/format";
import { compressImage, formatBytes } from "../utils/imageCompressor";
import api from "../services/api";
import { batchesAPI } from "../services/api";
import toast from "react-hot-toast";
import BarcodeScanner from "../components/BarcodeScanner";
import ScanIcon from "../components/ScanIcon";
import BatchReceiveModal from "../components/BatchReceiveModal";
import Pagination from "../components/Pagination";
import { usePagination } from "../hooks/usePagination";

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

const ADJUST_REASONS = [
  "ชำรุด/เสียหาย",
  "หมดอายุ",
  "สูญหาย",
  "ตรวจนับจริง (Recount)",
  "คืนสินค้า/แก้ไขบิล",
  "รับเพิ่มนอกระบบ PO",
  "อื่นๆ",
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

  // Stock Adjustment (maintain/update current stock with mandatory reason)
  const [adjustModal, setAdjustModal] = useState(null); // item object
  const [adjustForm, setAdjustForm] = useState({
    mode: "remove",
    quantity: "",
    new_quantity: "",
    reason_preset: "",
    reason_detail: "",
  });
  const [adjustConfirm, setAdjustConfirm] = useState(false);

  const [historyModal, setHistoryModal] = useState(null); // item object
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [batchesModal, setBatchesModal] = useState(null); // item object
  const [batchesData, setBatchesData] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [writingOffId, setWritingOffId] = useState(null);
  const [writeOffModal, setWriteOffModal] = useState(null); // batch object
  const [writeOffPreset, setWriteOffPreset] = useState("หมดอายุ");
  const [writeOffDetail, setWriteOffDetail] = useState("");
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null); // URL for full screen image modal

  // Global Goods Movement Modal state
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [movementsData, setMovementsData] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsSearch, setMovementsSearch] = useState('');
  const [movementsType, setMovementsType] = useState('all');

  const fetchMovements = useCallback(async (paramsObj = {}) => {
    setMovementsLoading(true);
    try {
      const searchVal = paramsObj.search !== undefined ? paramsObj.search : movementsSearch;
      const typeVal = paramsObj.type !== undefined ? paramsObj.type : movementsType;

      const res = await api.get('/inventory/movements', {
        params: {
          search: searchVal,
          type: typeVal
        }
      });
      setMovementsData(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch movements", err);
      toast.error("โหลดรายงานการเคลื่อนไหวสต๊อกไม่สำเร็จ");
    } finally {
      setMovementsLoading(false);
    }
  }, [movementsSearch, movementsType]);

  const handleOpenMovementsModal = () => {
    isProcessingRef.current = true;
    setShowMovementsModal(true);
    fetchMovements();
  };

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
    setBatchesModal(null);
    setAdjustModal(null);
    setAdjustConfirm(false);
    setWriteOffModal(null);
    setWriteOffDetail("");
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 500);
  }, []);

  const openAdjust = useCallback((item) => {
    isProcessingRef.current = true;
    setAdjustModal(item);
    setAdjustConfirm(false);
    setAdjustForm({
      mode: "remove",
      quantity: "",
      new_quantity: item.quantity !== undefined && item.quantity !== null ? String(item.quantity) : "",
      reason_preset: "",
      reason_detail: "",
    });
  }, []);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustModal) return;
    const detail = (adjustForm.reason_detail || "").trim();
    if (!adjustForm.reason_preset) { toast.error("กรุณาเลือกเหตุผลการปรับสต็อก"); return; }
    if (detail.length < 3) { toast.error("กรุณาระบุรายละเอียดเหตุผล (อย่างน้อย 3 ตัวอักษร)"); return; }

    const currentQty = parseFloat(adjustModal.quantity) || 0;
    let payload = { product_id: adjustModal.id || adjustModal.product_id };
    let targetQty = currentQty;
    if (adjustForm.mode === "add" || adjustForm.mode === "remove") {
      const qtyNum = parseFloat(adjustForm.quantity);
      if (!qtyNum || qtyNum <= 0) { toast.error("กรุณากรอกจำนวนที่ปรับให้ถูกต้อง"); return; }
      targetQty = adjustForm.mode === "add" ? currentQty + qtyNum : currentQty - qtyNum;
      payload = { ...payload, mode: adjustForm.mode, quantity: qtyNum };
    } else {
      const newQty = parseFloat(adjustForm.new_quantity);
      if (adjustForm.new_quantity === "" || Number.isNaN(newQty) || newQty < 0) { toast.error("กรุณากรอกยอดสต็อกใหม่ให้ถูกต้อง"); return; }
      targetQty = newQty;
      payload = { ...payload, mode: "set", new_quantity: newQty };
    }
    if (targetQty < 0) { toast.error(`สต็อกคงเหลือไม่เพียงพอ (คงเหลือ ${currentQty})`); return; }
    if (targetQty === currentQty) { toast.error("ยอดใหม่เท่ากับยอดเดิม ไม่มีการเปลี่ยนแปลง"); return; }
    // Extra confirmation for large decreases (>50% or >=20 units)
    const decrease = currentQty - targetQty;
    const isBigCut = decrease > 0 && (decrease >= 20 || (currentQty > 0 && decrease / currentQty >= 0.5));
    if (isBigCut && !adjustConfirm) { toast.error("การตัดสต็อกจำนวนมาก: กรุณาติ๊กยืนยันก่อนบันทึก"); return; }

    setSaving(true);
    try {
      const res = await api.post("/inventory/adjust", {
        ...payload,
        reason_preset: adjustForm.reason_preset,
        reason_detail: detail,
      });
      toast.success(res.data.message || "ปรับสต็อกสำเร็จ");
      closeModals();
      loadInventory();
    } catch (err) {
      const serverMsg = err.response?.data?.error?.message;
      const status = err.response?.status;
      console.error("[adjust] failed:", status, err.response?.data || err.message);
      toast.error(serverMsg ? `${serverMsg}${status === 500 ? " (เซิร์ฟเวอร์ขัดข้อง — ดู log ฝั่ง backend)" : ""}` : "ปรับสต็อกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

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

  const openBatches = useCallback(async (item) => {
    isProcessingRef.current = true;
    setBatchesModal(item);
    setBatchesLoading(true);
    setBatchesData([]);
    try {
      const res = await batchesAPI.getAll({ product_id: item.id || item.product_id });
      setBatchesData(res.data.data || []);
    } catch {
      toast.error("โหลดข้อมูลล็อต/วันหมดอายุไม่สำเร็จ");
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  const openWriteOffModal = (batch) => {
    isProcessingRef.current = true;
    setWriteOffModal(batch);
    setWriteOffPreset("หมดอายุ");
    setWriteOffDetail("");
  };

  const handleWriteOffSubmit = async (e) => {
    e.preventDefault();
    if (!writeOffModal) return;
    const detail = (writeOffDetail || "").trim();
    if (detail.length < 3) { toast.error("กรุณาระบุเหตุผลการตัดสต็อกล็อต (อย่างน้อย 3 ตัวอักษร)"); return; }
    const remark = `[${writeOffPreset}] ${detail}`;
    setWritingOffId(writeOffModal.id);
    try {
      const res = await batchesAPI.writeOff(writeOffModal.id, { remark });
      toast.success(res.data.message || "ตัดสต็อกสำเร็จ");
      setWriteOffModal(null);
      setWriteOffDetail("");
      if (batchesModal) openBatches(batchesModal);
      loadInventory();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "ตัดสต็อกไม่สำเร็จ");
    } finally {
      setWritingOffId(null);
      setTimeout(() => { if (!adjustModal) isProcessingRef.current = false; }, 300);
    }
  };

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

  // Main stock table pagination (page resets on new search / filter)
  const inventoryPaging = usePagination(filtered, 20, search + '|' + showLowStock);

  // Goods Movement pagination (page resets on new search / filter)
  const movementsPaging = usePagination(movementsData, 10, movementsSearch + '|' + movementsType);
  const { paged: pagedMovements } = movementsPaging;
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
          {/* Goods Movement Button */}
          <button
            type="button"
            onClick={handleOpenMovementsModal}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 text-indigo-700 bg-indigo-50 border-2 border-indigo-200 hover:bg-indigo-100"
          >
            <span>📋</span>
            <span>รายงานเคลื่อนไหวสต็อก (Goods Movement)</span>
          </button>

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
            {inventoryPaging.paged.map(item => {
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
                      {formatQty(item.quantity)}
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.is_raw_material === 1 ? (
                        <button onClick={() => openReceive(item)}
                          className="text-xs px-3 py-1.5 rounded-xl text-white font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm"
                          style={{ backgroundImage: GRAD }}>
                          + รับเข้า
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openBatches(item)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium text-amber-700 bg-amber-100/80 border border-amber-200/80 inline-flex items-center gap-1 hover:bg-amber-200/80 transition-all"
                          title="ดูล็อตการผลิต & วันหมดอายุ"
                        >
                          🗓️ ล็อต/วันหมดอายุ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openAdjust(item)}
                        className="text-xs px-2.5 py-1.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all shadow-sm border border-indigo-400/60"
                        title="ปรับปรุงยอดสต็อก (ต้องระบุเหตุผล)"
                      >
                        🔧 ปรับสต็อก
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-400 py-10">ไม่พบสินค้า</td></tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={inventoryPaging.page}
          totalPages={inventoryPaging.totalPages}
          perPage={inventoryPaging.perPage}
          onPageChange={inventoryPaging.setPage}
          onPerPageChange={inventoryPaging.setPerPage}
          rangeStart={inventoryPaging.rangeStart}
          rangeEnd={inventoryPaging.rangeEnd}
          total={inventoryPaging.total}
        />
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
                  {formatQty(historyModal.quantity)} ชิ้น
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
                    const isProduction = tx.type === 'receive' && (tx.gr_number || tx.remark?.includes('ผลิต') || tx.remark?.includes('WO-'));
                    const typeLabel = isCostChange
                      ? { label: "🏷️ เปลี่ยนราคาต้นทุน", bg: "bg-indigo-50 text-indigo-700 border-indigo-100" }
                      : isProduction
                      ? { label: "🏭 ผลิตสินค้าสำเร็จ", bg: "bg-emerald-50 text-emerald-700 border-emerald-100" }
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

                    const woMatch = tx.remark ? tx.remark.match(/WO-[0-9A-Z-]+/i)?.[0] : null;
                    const displayGr = tx.gr_number || (isProduction ? woMatch : null);
                    const displayGi = tx.gi_number || (tx.type === 'issue' ? woMatch : null);

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
                              {displayGr && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-mono font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                  GR: {displayGr}
                                </span>
                              )}
                              {displayGi && !displayGr && (
                                <span className="text-[10px] bg-rose-100 text-rose-700 font-mono font-bold px-2 py-0.5 rounded-md border border-rose-200">
                                  GI: {displayGi}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400">
                                โดย: {tx.user_name || "ระบบ"}
                              </span>
                            </div>
                            {tx.remark && (
                              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                {tx.remark.replace(/^\[(?:WO|PO|GR)-[0-9A-Z-]+\]\s*/i, '')}
                              </p>
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
                                  {isPositive ? `+${formatQty(tx.quantity)}` : formatQty(tx.quantity)}
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

      {/* Batches / Expiry Tracking Modal */}
      {batchesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[92vh] animate-scale-up">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-lg font-bold text-gray-800">🗓️ ล็อตการผลิต & วันหมดอายุ</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {batchesModal.name}
                  <span className="ml-2 text-xs text-gray-400 font-mono">({batchesModal.sku})</span>
                </p>
              </div>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="mt-4 space-y-2">
              {batchesLoading ? (
                <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
              ) : batchesData.length === 0 ? (
                <p className="text-center text-gray-400 py-8">ยังไม่มีล็อตการผลิตสำหรับสินค้านี้ (ผลิตผ่านหน้าสูตรอาหารเพื่อเริ่มติดตาม)</p>
              ) : (
                batchesData.map(batch => {
                  const isExpired = batch.status === 'expired';
                  const isDepleted = batch.status === 'depleted';
                  const nearExpiry = batch.status === 'active' && batch.days_until_expiry !== null && batch.days_until_expiry <= 3;
                  return (
                    <div key={batch.id}
                      className={"rounded-2xl border p-3.5 flex items-center justify-between gap-3 " +
                        (isExpired ? "bg-red-50 border-red-200" : nearExpiry ? "bg-amber-50 border-amber-200" : isDepleted ? "bg-gray-50 border-gray-200" : "bg-emerald-50 border-emerald-200")}
                    >
                      <div>
                        <p className="text-xs font-mono text-gray-500">{batch.wo_number || batch.id.slice(0, 8)}</p>
                        <p className="text-sm font-bold text-gray-800">
                          ผลิต: {new Date(batch.produced_at).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {batch.expiry_date
                            ? `หมดอายุ: ${new Date(batch.expiry_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                            : 'ไม่จำกัดวันหมดอายุ'}
                          {batch.status === 'active' && batch.days_until_expiry !== null && (
                            <span className={"ml-1.5 font-semibold " + (nearExpiry ? "text-amber-600" : "text-gray-500")}>
                              ({batch.days_until_expiry >= 0 ? `เหลืออีก ${batch.days_until_expiry} วัน` : `เกินกำหนด ${-batch.days_until_expiry} วัน`})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1.5">
                        <span className={"text-xs font-bold px-2 py-0.5 rounded-full " +
                          (isExpired ? "bg-red-200 text-red-700" : isDepleted ? "bg-gray-200 text-gray-600" : nearExpiry ? "bg-amber-200 text-amber-700" : "bg-emerald-200 text-emerald-700")}>
                          {isExpired ? "หมดอายุแล้ว" : isDepleted ? "ขายหมดแล้ว" : nearExpiry ? "ใกล้หมดอายุ" : "ปกติ"}
                        </span>
                        <span className="text-sm font-black text-gray-700">
                          คงเหลือ {batch.qty_remaining} / {batch.qty_produced} {batch.unit}
                        </span>
                        {batch.status === 'active' && parseFloat(batch.qty_remaining) > 0 && (
                          <button
                            type="button"
                            onClick={() => openWriteOffModal(batch)}
                            disabled={writingOffId === batch.id}
                            className="text-xs px-2.5 py-1 rounded-lg font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-all"
                          >
                            {writingOffId === batch.id ? "กำลังตัด..." : "✂️ ตัดสต็อก (หมดอายุ/เสียหาย)"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-5">
              <button onClick={closeModals} className="btn-ghost w-full">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustModal && (() => {
        const currentQty = parseFloat(adjustModal.quantity) || 0;
        const unit = adjustModal.unit || 'ชิ้น';
        const qtyNum = parseFloat(adjustForm.mode === "set" ? adjustForm.new_quantity : adjustForm.quantity);
        const targetQty = adjustForm.mode === "add" ? currentQty + (qtyNum || 0)
          : adjustForm.mode === "remove" ? currentQty - (qtyNum || 0)
          : (Number.isNaN(qtyNum) ? currentQty : qtyNum);
        const diff = Math.round((targetQty - currentQty) * 10000) / 10000;
        const invalidTarget = targetQty < 0 || Number.isNaN(targetQty);
        const decrease = currentQty - targetQty;
        const isBigCut = decrease > 0 && (decrease >= 20 || (currentQty > 0 && decrease / currentQty >= 0.5));
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-scale-up max-h-[92vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-gray-800">🔧 ปรับปรุงยอดสต็อก</h3>
              <p className="text-sm text-gray-500 mt-0.5 mb-4">
                {adjustModal.name}
                <span className="ml-2 text-xs text-gray-400 font-mono">({adjustModal.sku})</span>
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  คงเหลือ {currentQty} {unit}
                </span>
              </p>
              <form onSubmit={handleAdjustSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">ประเภทการปรับ <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "add", t: "➕ เพิ่ม" },
                      { v: "remove", t: "➖ ลด/ตัด" },
                      { v: "set", t: "📝 ตั้งยอด" },
                    ].map(o => (
                      <button key={o.v} type="button"
                        onClick={() => setAdjustForm({ ...adjustForm, mode: o.v })}
                        className={"py-2 rounded-xl border-2 text-xs font-bold transition-all " + (adjustForm.mode === o.v ? "border-purple-600 bg-purple-50 text-purple-700" : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200")}>
                        {o.t}
                      </button>
                    ))}
                  </div>
                </div>
                {adjustForm.mode === "set" ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">ยอดสต็อกใหม่ ({unit}) <span className="text-red-500">*</span></label>
                    <input type="number" min="0" step="any" autoFocus required
                      value={adjustForm.new_quantity}
                      onChange={e => setAdjustForm({ ...adjustForm, new_quantity: e.target.value })}
                      className="input-field text-xl font-bold text-center" placeholder="0" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      จำนวนที่{adjustForm.mode === "add" ? "เพิ่ม" : "ลด"} ({unit}) <span className="text-red-500">*</span>
                    </label>
                    <input type="number" min="0" step="any" autoFocus required
                      value={adjustForm.quantity}
                      onChange={e => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                      className="input-field text-xl font-bold text-center" placeholder="1" />
                  </div>
                )}
                <div className={"rounded-2xl px-4 py-2.5 flex justify-between items-center text-xs border " + (invalidTarget ? "bg-red-50 border-red-200 text-red-600" : diff === 0 ? "bg-gray-50 border-gray-200 text-gray-500" : diff > 0 ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700")}>
                  <span className="font-medium">ยอดหลังปรับ: {Number.isNaN(targetQty) ? "-" : targetQty.toLocaleString()} {unit}</span>
                  <span className="font-bold">{Number.isNaN(diff) ? "" : diff === 0 ? "(ไม่เปลี่ยนแปลง)" : `(${diff > 0 ? "+" : ""}${diff.toLocaleString()})`}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">เหตุผลการปรับ <span className="text-red-500">*</span></label>
                  <select required value={adjustForm.reason_preset}
                    onChange={e => setAdjustForm({ ...adjustForm, reason_preset: e.target.value })}
                    className="input-field text-sm">
                    <option value="">-- เลือกเหตุผล --</option>
                    {ADJUST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">รายละเอียดเหตุผล <span className="text-red-500">*</span> <span className="text-xs text-gray-400">(บังคับ อย่างน้อย 3 ตัวอักษร)</span></label>
                  <input type="text" required minLength={3} value={adjustForm.reason_detail}
                    onChange={e => setAdjustForm({ ...adjustForm, reason_detail: e.target.value })}
                    className="input-field text-sm" placeholder="เช่น นับจริงขาด 2 ถุง หนูกัดถุง..." />
                </div>
                {isBigCut && (
                  <label className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={adjustConfirm} onChange={e => setAdjustConfirm(e.target.checked)} className="mt-0.5" />
                    <span>ยืนยันการตัดสต็อกจำนวนมาก ({decrease.toLocaleString()} {unit} / {currentQty > 0 ? Math.round(decrease / currentQty * 100) : 0}% ของคงเหลือ) — ตรวจสอบเหตุผลแล้ว</span>
                  </label>
                )}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={closeModals} className="btn-ghost flex-1">ยกเลิก</button>
                  <button type="submit" disabled={saving || invalidTarget}
                    className="flex-1 py-3 rounded-xl text-white font-bold shadow-md hover:opacity-90 disabled:opacity-40 transition-all text-sm"
                    style={{ backgroundImage: GRAD }}>
                    {saving ? "กำลังบันทึก..." : "💾 บันทึกการปรับ"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Batch Write-off Reason Modal */}
      {writeOffModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-scale-up">
            <h3 className="text-lg font-bold text-gray-800">✂️ ตัดสต็อกล็อต</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-4">
              ล็อต {writeOffModal.wo_number || String(writeOffModal.id).slice(0, 8)} — คงเหลือ {writeOffModal.qty_remaining} {writeOffModal.unit}
            </p>
            <form onSubmit={handleWriteOffSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">เหตุผล <span className="text-red-500">*</span></label>
                <select value={writeOffPreset} onChange={e => setWriteOffPreset(e.target.value)} className="input-field text-sm">
                  {ADJUST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">รายละเอียด <span className="text-red-500">*</span> <span className="text-xs text-gray-400">(บังคับ)</span></label>
                <input type="text" autoFocus required minLength={3} value={writeOffDetail}
                  onChange={e => setWriteOffDetail(e.target.value)}
                  className="input-field text-sm" placeholder="เช่น หมดอายุ พบเชื้อรา..." />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setWriteOffModal(null); setWriteOffDetail(""); setTimeout(() => { isProcessingRef.current = false; }, 300); }} className="btn-ghost flex-1">ยกเลิก</button>
                <button type="submit" disabled={writingOffId === writeOffModal.id}
                  className="flex-1 py-3 rounded-xl text-white font-bold bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-all text-sm">
                  {writingOffId === writeOffModal.id ? "กำลังตัด..." : "✂️ ยืนยันตัดสต็อก"}
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

      {/* Global Goods Movement Log Modal */}
      {showMovementsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white text-gray-900 rounded-3xl border border-gray-200 shadow-2xl max-w-5xl w-full p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-gray-100 pb-4 flex-shrink-0">
              <div>
                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full font-mono">
                  📋 Goods Movement Log
                </span>
                <h3 className="text-xl font-extrabold text-gray-800 mt-1.5 flex items-center gap-2">
                  <span>รายงานการเคลื่อนไหวสต็อก (Stock Movement History)</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  ตรวจสอบประวัติการรับเข้า (PO), เบิกจ่ายออก (GI/WO), ขายหน้าร้าน และปรับปรุงสต็อกของสินค้าและวัตถุดิบทั้งหมด
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowMovementsModal(false); isProcessingRef.current = false; }}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Filter Controls Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-gray-50 p-3 rounded-2xl border border-gray-200 flex-shrink-0">
              <div className="relative sm:col-span-2">
                <input
                  type="text"
                  placeholder="🔍 ค้นหาชื่อสินค้า / SKU / PO / GI / หมายเหตุ..."
                  value={movementsSearch}
                  onChange={(e) => {
                    setMovementsSearch(e.target.value);
                    fetchMovements({ search: e.target.value });
                  }}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={movementsType}
                  onChange={(e) => {
                    setMovementsType(e.target.value);
                    fetchMovements({ type: e.target.value });
                  }}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">🌐 ประเภททั้งหมด</option>
                  <option value="receive">📥 รับสินค้าเข้า (PO/GR)</option>
                  <option value="issue">📤 เบิกสต๊อกออก (GI/WO)</option>
                  <option value="sale">🛍️ ขายหน้าร้าน (Sale)</option>
                  <option value="adjust">🔧 ปรับปรุงยอด (Adjust)</option>
                  <option value="return">🔄 คืนสินค้า (Return)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => fetchMovements()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <span>🔄</span>
                <span>รีเฟรชข้อมูล</span>
              </button>
            </div>

            {/* Statistics Banner */}
            <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 text-center flex-shrink-0">
              <div>
                <span className="text-[11px] text-gray-500 font-medium block">รายการเคลื่อนไหว</span>
                <span className="text-base font-extrabold text-amber-600 font-mono">{movementsData.length} รายการ</span>
              </div>
              <div>
                <span className="text-[11px] text-gray-500 font-medium block">รวมรับเข้าสต็อก</span>
                <span className="text-base font-extrabold text-emerald-600 font-mono">
                  +{movementsData.filter(m => m.quantity > 0).reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-gray-500 font-medium block">รวมเบิกออก/ตัดสต็อก</span>
                <span className="text-base font-extrabold text-rose-600 font-mono">
                  {movementsData.filter(m => m.quantity < 0).reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Movement Data Table */}
            <div className="flex-1 overflow-x-auto rounded-2xl border border-gray-200 overflow-y-auto max-h-[50vh]">
              <table className="w-full text-left text-xs bg-white">
                <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[11px] tracking-wider sticky top-0 border-b border-gray-200 z-10">
                  <tr>
                    <th className="p-3">วัน-เวลา</th>
                    <th className="p-3">สินค้า / วัตถุดิบ</th>
                    <th className="p-3 text-center">ประเภท</th>
                    <th className="p-3 text-center">เลขอ้างอิง</th>
                    <th className="p-3 text-right">จำนวน</th>
                    <th className="p-3 text-center">ผู้ดำเนินการ</th>
                    <th className="p-3">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movementsLoading ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-gray-400">กำลังโหลดข้อมูลการเคลื่อนไหวสต็อก...</td>
                    </tr>
                  ) : movementsData.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-gray-400">ไม่พบประวัติการเคลื่อนไหวสต็อกตามเงื่อนไขที่เลือก</td>
                    </tr>
                  ) : (
                    pagedMovements.map((m) => {
                      const isPositive = m.quantity > 0;
                      const isProduction = m.type === 'receive' && (m.gr_number || (m.remark && (m.remark.includes('ผลิต') || m.remark.includes('WO-'))));
                      
                      const woMatch = m.remark ? m.remark.match(/WO-[0-9A-Z-]+/i)?.[0] : null;
                      const displayGr = m.gr_number || (isProduction ? woMatch : null);
                      const displayGi = m.gi_number || (m.type === 'issue' ? woMatch : null);
                      
                      const cleanRemark = (m.remark || '').replace(/^\[(?:WO|PO|GR|GI)-[0-9A-Z-]+\]\s*/i, '');
                      
                      return (
                        <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-3 text-gray-400 font-mono text-[11px] whitespace-nowrap">
                            {new Date(m.created_at).toLocaleString('th-TH')}
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-gray-800 block">{m.product_name}</span>
                            {m.product_sku && <span className="text-[10px] text-gray-400 font-mono">{m.product_sku}</span>}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isProduction ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                              m.type === 'receive' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                              m.type === 'issue' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                              m.type === 'sale' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                              'bg-amber-100 text-amber-800 border-amber-200'
                            }`}>
                              {isProduction ? '🏭 ผลิตสินค้าสำเร็จ' :
                               m.type === 'receive' ? '📥 รับสินค้าเข้า' :
                               m.type === 'issue' ? '📤 เบิกสต๊อกออก' :
                               m.type === 'sale' ? '🛍️ ขายหน้าร้าน' :
                               m.type === 'adjust' ? '🔧 ปรับปรุงยอด' : m.type}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono text-[11px] whitespace-nowrap">
                            {m.po_number ? (
                              <span className="text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200 font-bold">
                                PO: {m.po_number}
                              </span>
                            ) : displayGr ? (
                              <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                                GR: {displayGr}
                              </span>
                            ) : displayGi ? (
                              <span className="text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-200 font-bold">
                                GI: {displayGi}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-sm whitespace-nowrap">
                            <span className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                              {isPositive ? `+${m.quantity}` : m.quantity} {m.unit}
                            </span>
                          </td>
                          <td className="p-3 text-center text-gray-600 text-xs font-semibold whitespace-nowrap">
                            {m.user_name || 'ระบบ'}
                          </td>
                          <td className="p-3 text-gray-600 text-xs max-w-xs truncate" title={cleanRemark}>
                            {cleanRemark || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer with pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-gray-100 flex-shrink-0">
              <Pagination
                page={movementsPaging.page}
                totalPages={movementsPaging.totalPages}
                perPage={movementsPaging.perPage}
                onPageChange={movementsPaging.setPage}
                onPerPageChange={movementsPaging.setPerPage}
                rangeStart={movementsPaging.rangeStart}
                rangeEnd={movementsPaging.rangeEnd}
                total={movementsPaging.total}
              />
              <button
                type="button"
                onClick={() => { setShowMovementsModal(false); isProcessingRef.current = false; }}
                className="px-5 py-1.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs transition-colors sm:ml-1"
              >
                ปิดหน้าต่าง
              </button>
            </div>
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
