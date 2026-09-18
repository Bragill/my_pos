import { useState } from "react";
import { formatCurrency } from "../utils/format";
import { compressImage, formatBytes } from "../utils/imageCompressor";
import api from "../services/api";
import toast from "react-hot-toast";

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

export default function BatchReceiveModal({ inventory = [], onClose, onSuccess }) {
  const [receivedDate, setReceivedDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [bankName, setBankName] = useState("");
  const [poRemark, setPoRemark] = useState("");

  // Receipt image state
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [compressionStats, setCompressionStats] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Helper to map inventory item to batch row
  const mapInventoryItem = (p) => {
    const netWeight = parseFloat(p.net_weight) || 1;
    const defaultPackPrice = p.cost_price ? Number((p.cost_price * netWeight).toFixed(2)) : 0;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit || 'ชิ้น',
      net_weight: netWeight,
      current_quantity: p.quantity,
      cost_price: p.cost_price || 0,
      pack_price: defaultPackPrice > 0 ? String(defaultPackPrice) : '',
      quantity: 1,
      remark: ''
    };
  };

  // Start batch receiving table empty by default (users can search or click + เลือกสินค้าทั้งหมดเข้าตาราง)
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Handle receipt image selection & compression
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      toast.loading("กำลังบีบอัดรูปภาพ...", { id: "img-compress" });

      const compressedResult = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.75 });
      setReceiptFile(compressedResult.file);
      setCompressionStats(compressedResult);

      const previewUrl = URL.createObjectURL(compressedResult.file);
      setReceiptPreview(previewUrl);

      // Upload to backend / R2
      toast.loading("กำลังอัปโหลดไปยัง Cloudflare R2...", { id: "img-compress" });
      const formData = new FormData();
      formData.append("receipt", compressedResult.file);

      const res = await api.post("/inventory/upload-receipt", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setReceiptUrl(res.data.url);
      toast.success("อัปโหลดหลักฐานสำเร็จ", { id: "img-compress" });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error?.message || "อัปโหลดรูปภาพไม่สำเร็จ", { id: "img-compress" });
      setReceiptFile(null);
      setReceiptPreview(null);
      setReceiptUrl("");
      setCompressionStats(null);
    } finally {
      setUploadingImage(false);
    }
  };

  // Add product to batch list
  const handleAddProduct = (product) => {
    if (product.pending_adjust_id) {
      toast.error(`"${product.name}" อยู่ระหว่างรออนุมัติปรับสต็อกใน LINE ไม่สามารถรับสินค้าได้`);
      return;
    }
    if (selectedItems.some(i => i.id === product.id)) {
      toast.error(`"${product.name}" อยู่ในรายการแล้ว`);
      return;
    }
    setSelectedItems(prev => [...prev, mapInventoryItem(product)]);
    setSearchQuery("");
  };

  // Update item field in table
  const handleUpdateItem = (id, field, value) => {
    setSelectedItems(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Remove item from table
  const handleRemoveItem = (id) => {
    setSelectedItems(prev => prev.filter(i => i.id !== id));
  };

  // Calculate totals
  const totalPacks = selectedItems.reduce((sum, i) => sum + (parseInt(i.quantity) || 0), 0);
  const totalBaseUnits = selectedItems.reduce((sum, i) => {
    const packQty = parseInt(i.quantity) || 0;
    const nw = parseFloat(i.net_weight) || 1;
    return sum + (packQty * nw);
  }, 0);
  const grandTotal = selectedItems.reduce((sum, i) => {
    const qty = parseInt(i.quantity) || 0;
    const netWeight = parseFloat(i.net_weight) || 1;
    const packPrice = i.pack_price !== "" ? parseFloat(i.pack_price) || 0 : (i.cost_price * netWeight);
    return sum + (qty * packPrice);
  }, 0);

  // Submit batch receive
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!receiptUrl) {
      toast.error("⚠️ กรุณาอัปโหลดรูปภาพใบเสร็จ / หลักฐานการรับสินค้า");
      return;
    }

    if (selectedItems.length === 0) {
      toast.error("⚠️ กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    if (paymentMethod === "credit_card" && !bankName) {
      toast.error("⚠️ กรุณาเลือกธนาคารสำหรับการชำระด้วยบัตรเครดิต");
      return;
    }

    const itemsToSubmit = selectedItems
      .filter(i => parseInt(i.quantity) > 0)
      .map(i => {
        const packQty = parseInt(i.quantity);
        const netWeight = parseFloat(i.net_weight) || 1;
        const totalBaseQty = packQty * netWeight;
        const packPriceNum = i.pack_price !== "" ? parseFloat(i.pack_price) : (i.cost_price * netWeight);
        const unitCostNum = netWeight > 0 ? (packPriceNum / netWeight) : packPriceNum;

        return {
          product_id: i.id,
          quantity: totalBaseQty,
          new_cost_price: Number(unitCostNum.toFixed(4)),
          remark: i.remark || `รับเข้า ${packQty} แพ็ค (${netWeight} ${i.unit}/แพ็ค)`
        };
      });

    if (itemsToSubmit.length === 0) {
      toast.error("⚠️ กรุณากรอกจำนวนรับอย่างน้อย 1 แพ็ค สำหรับอย่างน้อย 1 รายการ");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        received_date: receivedDate,
        payment_method: paymentMethod,
        bank_name: paymentMethod === "credit_card" ? bankName : undefined,
        receipt_url: receiptUrl,
        remark: poRemark || "รับเข้าสินค้าหลายรายการ",
        items: itemsToSubmit
      };

      const res = await api.post("/inventory/receive-batch", payload);
      toast.success(`🎉 ${res.data.message}`);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error?.message || "เกิดข้อผิดพลาดในการรับสินค้า");
    } finally {
      setSaving(false);
    }
  };

  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Filter raw materials only for batch stock receiving (finished goods are produced from recipes)
  const rawMaterialInventory = inventory.filter(i => i.is_raw_material === 1);

  // Filtered search list (shows matches or top raw materials on focus)
  const searchResults = searchQuery.trim()
    ? rawMaterialInventory.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.barcode && i.barcode.includes(searchQuery))
      ).slice(0, 10)
    : (isSearchFocused ? rawMaterialInventory.slice(0, 10) : []);

  const handleAddAllProducts = () => {
    if (rawMaterialInventory.length === 0) return;
    const existingIds = new Set(selectedItems.map(i => i.id));
    const newItems = rawMaterialInventory
      .filter(p => !existingIds.has(p.id) && !p.pending_adjust_id)
      .map(mapInventoryItem);
    if (newItems.length === 0) {
      toast.error("วัตถุดิบทั้งหมดถูกเพิ่มในรายการแล้ว (หรืออยู่ระหว่างรออนุมัติปรับสต็อก)");
      return;
    }
    setSelectedItems(prev => [...prev, ...newItems]);
    toast.success(`เพิ่มวัตถุดิบ ${newItems.length} รายการเข้าตารางแล้ว`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col animate-scale-up overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between text-white flex-shrink-0" style={{ backgroundImage: GRAD }}>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              📦 รับเข้าสินค้าหลายรายการ (Batch Receive)
            </h2>
            <p className="text-xs text-white/80 mt-0.5">
              สร้างใบสั่งซื้อ PO ใหม่ และรับสินค้าเข้าสต๊อกพร้อมกันหลายรายการ
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold leading-none">
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Document & Payment Header Card */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Received Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                วันที่รับสินค้า <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={receivedDate}
                onChange={e => setReceivedDate(e.target.value)}
                max={today()}
                className="input-field bg-white !py-2 text-sm"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                วิธีชำระเงิน <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    paymentMethod === "cash"
                      ? "border-purple-600 bg-purple-50 text-purple-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  💵 เงินสด
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("qr_promptpay")}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    paymentMethod === "qr_promptpay"
                      ? "border-purple-600 bg-purple-50 text-purple-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  📱 สแกนจ่าย
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("credit_card")}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    paymentMethod === "credit_card"
                      ? "border-purple-600 bg-purple-50 text-purple-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  💳 บัตรเครดิต
                </button>
              </div>
            </div>

            {/* Bank Selection if Credit Card */}
            {paymentMethod === "credit_card" ? (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  เลือกธนาคาร <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  className="input-field bg-white !py-2 text-sm"
                >
                  <option value="">-- เลือกธนาคาร --</option>
                  {THAI_BANKS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  หมายเหตุใบ PO (รวม)
                </label>
                <input
                  type="text"
                  value={poRemark}
                  onChange={e => setPoRemark(e.target.value)}
                  className="input-field bg-white !py-2 text-sm"
                  placeholder="เช่น รับของประจำสัปดาห์ / ซัพพลายเออร์ A"
                />
              </div>
            )}

            {/* Compulsory Receipt Image Upload Area */}
            <div className="md:col-span-3 border-t border-gray-200 pt-3">
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
                <span>📷 รูปภาพใบเสร็จ / หลักฐานการรับสินค้า (บังคับ) <span className="text-red-500">*</span></span>
                <span className="text-[10px] text-gray-400 font-normal">บีบอัดอัตโนมัติ ➔ Upload Cloudflare R2</span>
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <label className={`flex-1 w-full flex items-center justify-center gap-3 p-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                  receiptUrl
                    ? "border-green-400 bg-green-50/50"
                    : "border-purple-300 bg-purple-50/40 hover:bg-purple-50"
                }`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                  <span className="text-2xl">{uploadingImage ? "⏳" : receiptUrl ? "✅" : "📤"}</span>
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-700">
                      {uploadingImage
                        ? "กำลังบีบอัดและอัปโหลด..."
                        : receiptUrl
                        ? "อัปโหลดใบเสร็จเรียบร้อยแล้ว (คลิกเปลี่ยนรูป)"
                        : "คลิกเพื่อแนบรูปใบเสร็จ / ใบส่งของ"}
                    </p>
                    {compressionStats && (
                      <p className="text-[10px] text-green-600 font-mono mt-0.5">
                        ขนาด: {formatBytes(compressionStats.originalSize)} ➔ {formatBytes(compressionStats.compressedSize)}
                        {' '}(ประหยัด {Math.round((1 - compressionStats.compressedSize / compressionStats.originalSize) * 100)}%)
                      </p>
                    )}
                  </div>
                </label>

                {receiptPreview && (
                  <div className="relative w-20 h-20 rounded-xl border-2 border-purple-200 overflow-hidden flex-shrink-0 bg-gray-100 group">
                    <img src={receiptPreview} alt="Receipt Preview" className="w-full h-full object-cover" />
                    <a
                      href={receiptPreview}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 bg-black/40 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      🔍 ดูรูปเต็ม
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Search & Add Section */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="block text-xs font-bold text-gray-700">
                🔍 ค้นหาและเลือกสินค้าที่ต้องการรับเข้า
              </label>
              <button
                type="button"
                onClick={handleAddAllProducts}
                className="text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 font-bold px-3 py-1.5 rounded-xl transition-all border border-purple-200 flex items-center justify-center gap-1 w-full sm:w-auto"
              >
                <span>➕</span>
                <span>เลือกวัตถุดิบทั้งหมดเข้าตาราง ({rawMaterialInventory.length})</span>
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="คลิกเพื่อเลือกสินค้า หรือพิมพ์ชื่อสินค้า / SKU / บาร์โค้ด..."
                className="input-field"
              />

              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 max-h-60 overflow-y-auto divide-y">
                  {searchResults.map(prod => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleAddProduct(prod)}
                      className={`w-full text-left px-4 py-2.5 transition-colors flex items-center justify-between text-xs ${
                        prod.pending_adjust_id
                          ? "bg-amber-50/60 hover:bg-amber-100/70"
                          : "hover:bg-purple-50"
                      }`}
                    >
                      <div>
                        <span className="font-bold text-gray-800">{prod.name}</span>
                        <span className="text-gray-400 font-mono ml-2">({prod.sku})</span>
                        {prod.pending_adjust_id && (
                          <span className="ml-2 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                            ⏳ รออนุมัติปรับสต็อก
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-gray-500">คงเหลือ: <b>{prod.quantity}</b> {prod.unit || 'ชิ้น'}</span>
                        <span className="ml-3 text-purple-600 font-semibold">
                          ราคายกแพ็ค ฿{((prod.cost_price || 0) * (parseFloat(prod.net_weight) || 1)).toFixed(2)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Products Section */}
          {/* 1. Desktop Table View (>= md) */}
          <div className="hidden md:block border border-gray-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700 text-left font-bold">
                  <th className="py-3 px-3 text-slate-500 dark:text-slate-400">#</th>
                  <th className="py-3 px-3">สินค้า / SKU</th>
                  <th className="py-3 px-3 text-right">คงเหลือ</th>
                  <th className="py-3 px-3 text-center w-24">จำนวนแพ็คที่รับ</th>
                  <th className="py-3 px-3 text-center w-28">
                    <div>ปริมาณ/แพ็ค</div>
                    <div className="text-[9px] font-normal text-slate-400 dark:text-slate-400">🔒 ล็อกตามสินค้า</div>
                  </th>
                  <th className="py-3 px-3 text-center w-36">
                    <div>ราคารวมยกแพ็ค (บาท)</div>
                    <div className="text-[9px] font-semibold text-purple-600 dark:text-purple-400">ซื้อยกแพ็ค/ถุง</div>
                  </th>
                  <th className="py-3 px-3 text-right">รวมเงิน</th>
                  <th className="py-3 px-2 text-center w-10">ลบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {selectedItems.map((item, idx) => {
                  const packQty = parseInt(item.quantity) || 0;
                  const netWeight = parseFloat(item.net_weight) || 1;
                  const totalBaseQty = packQty * netWeight;
                  const defaultPackCost = item.cost_price * netWeight;
                  const activePackPrice = item.pack_price !== "" ? parseFloat(item.pack_price) || 0 : defaultPackCost;
                  const calcUnitCost = netWeight > 0 ? (activePackPrice / netWeight) : activePackPrice;
                  const subtotal = packQty * activePackPrice;

                  return (
                    <tr key={item.id} className="hover:bg-purple-50/30 transition-colors">
                      <td className="py-2.5 px-3 text-gray-400 font-semibold">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-gray-800">{item.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{item.sku}</p>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-500 font-medium">
                        {item.current_quantity} {item.unit}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={e => handleUpdateItem(item.id, "quantity", e.target.value)}
                          className="input-field !py-1 text-center font-bold text-purple-700 text-sm"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-bold text-gray-800 text-sm">
                          {netWeight} {item.unit}
                        </span>
                        <p className="text-[10px] text-purple-700 font-bold mt-0.5">
                          (รวม {totalBaseQty} {item.unit})
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.pack_price}
                          onChange={e => handleUpdateItem(item.id, "pack_price", e.target.value)}
                          placeholder={`${defaultPackCost.toFixed(2)}`}
                          className="input-field !py-1 text-center font-bold text-gray-800 text-sm"
                        />
                        {netWeight > 0 && (
                          <p className="text-[10px] text-indigo-600 font-medium mt-0.5">
                            (คิดเป็น ฿{calcUnitCost.toFixed(2)} / {item.unit})
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-gray-800 text-sm">
                        {formatCurrency(subtotal)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-400 hover:text-red-600 text-base transition-colors"
                          title="ลบออกจากรายการ"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {selectedItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-400 dark:text-slate-500">
                      <p className="text-2xl mb-1 opacity-70">🛒</p>
                      <p className="text-xs">ยังไม่มีสินค้าในรายการ กรุณาค้นหาและเลือกสินค้าด้านบน</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 2. Mobile / PWA Card List View (< md) */}
          <div className="block md:hidden space-y-3">
            {selectedItems.map((item, idx) => {
              const packQty = parseInt(item.quantity) || 0;
              const netWeight = parseFloat(item.net_weight) || 1;
              const totalBaseQty = packQty * netWeight;
              const defaultPackCost = item.cost_price * netWeight;
              const activePackPrice = item.pack_price !== "" ? parseFloat(item.pack_price) || 0 : defaultPackCost;
              const calcUnitCost = netWeight > 0 ? (activePackPrice / netWeight) : activePackPrice;
              const subtotal = packQty * activePackPrice;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl p-3.5 border border-purple-100 shadow-sm space-y-2.5 relative"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-bold text-gray-900 text-sm leading-snug break-words">
                          {item.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {item.sku}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            คงเหลือ: <b className="text-gray-700">{item.current_quantity}</b> {item.unit}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 active:scale-95 transition-all text-sm flex-shrink-0"
                      title="ลบออกจากรายการ"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Form Inputs */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* จำนวนแพ็คที่รับ */}
                    <div className="bg-purple-50/60 p-2.5 rounded-xl border border-purple-100">
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        จำนวนแพ็คที่รับ <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={e => handleUpdateItem(item.id, "quantity", e.target.value)}
                        className="input-field bg-white !py-1.5 text-center font-bold text-purple-700 text-base"
                      />
                      <p className="text-[10px] text-purple-700 font-semibold text-center mt-1">
                        รวม {totalBaseQty} {item.unit}
                      </p>
                    </div>

                    {/* ราคารวมยกแพ็ค */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        ราคารวมยกแพ็ค (บาท)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.pack_price}
                        onChange={e => handleUpdateItem(item.id, "pack_price", e.target.value)}
                        placeholder={`${defaultPackCost.toFixed(2)}`}
                        className="input-field bg-white !py-1.5 text-center font-bold text-gray-800 text-base"
                      />
                      <p className="text-[10px] text-indigo-600 font-semibold text-center mt-1 truncate">
                        (฿{calcUnitCost.toFixed(2)} / {item.unit})
                      </p>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                    <span className="text-gray-500 text-[11px]">
                      🔒 บรรจุ: <b className="text-gray-700">{netWeight} {item.unit}</b> / แพ็ค
                    </span>
                    <div className="text-right">
                      <span className="text-gray-400 text-[10px] mr-1">รวมเงิน:</span>
                      <span className="font-extrabold text-sm text-purple-700 font-mono">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {selectedItems.length === 0 && (
              <div className="bg-gray-50 rounded-2xl border border-gray-200 text-center py-8 text-gray-400">
                <p className="text-2xl mb-1">🛒</p>
                <p className="text-xs">ยังไม่มีสินค้าในรายการ กรุณาค้นหาและเลือกสินค้าด้านบน</p>
              </div>
            )}
          </div>

          {/* Modal Footer Summary */}
          <div className="bg-purple-50/70 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border border-purple-100">
            <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 sm:gap-6 text-xs text-gray-600 w-full sm:w-auto">
              <div>
                <span>รวมสินค้า:</span>
                <span className="ml-1 font-bold text-gray-800 text-sm">{selectedItems.length} รายการ</span>
              </div>
              <div>
                <span>รวมจำนวน:</span>
                <span className="ml-1 font-bold text-purple-700 text-sm">
                  {totalPacks.toLocaleString()} แพ็ค ({totalBaseUnits.toLocaleString()} หน่วยย่อย)
                </span>
              </div>
            </div>

            <div className="text-right w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-purple-200/50">
              <span className="text-xs text-gray-500">มูลค่ารวมทั้งสิ้น</span>
              <p className="text-2xl font-black text-purple-700 leading-none sm:mt-1 font-mono">
                {formatCurrency(grandTotal)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost flex-1 py-3 text-sm"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || uploadingImage || selectedItems.length === 0 || !receiptUrl}
              className="flex-[2] py-3 rounded-xl text-white font-bold shadow-md hover:opacity-90 disabled:opacity-40 transition-all text-xs sm:text-sm"
              style={{ backgroundImage: GRAD }}
            >
              {saving ? "กำลังบันทึก..." : "📦 ยืนยันรับสินค้าเข้าสต๊อก (สร้าง PO)"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
