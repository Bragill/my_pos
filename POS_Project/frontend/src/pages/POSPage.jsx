import { useState, useEffect, useRef } from "react";
import { useCart } from "../contexts/CartContext";
import { useAuth } from "../contexts/AuthContext";
import { formatCurrency } from "../utils/format";
import generatePayload from "promptpay-qr";
import { QRCodeCanvas } from "qrcode.react";
import { toJpeg } from 'html-to-image';
import api from "../services/api";
import { savePendingOrder, cacheProducts, getCachedProducts } from "../services/offlineDB";
import toast from "react-hot-toast";
import BarcodeScanner from "../components/BarcodeScanner";
import ScanIcon from "../components/ScanIcon";
import hardwareScanner from "../services/hardwareScannerService";
import { printReceipt, connectUsb, connectBluetooth, isPrinterAvailable } from "../services/thermalPrinterService";

const CartItem = ({ item, onUpdateQuantity, onRemove }) => {
  const [inputValue, setInputValue] = useState(item.quantity);
  const debounceTimerRef = useRef(null);

  // Keep local state in sync with external changes
  useEffect(() => {
    // Only sync if the input is not currently focused to avoid jumping while typing
    if (document.activeElement !== document.getElementById(`qty-input-${item.product_id}`)) {
      setInputValue(item.quantity);
    }
  }, [item.quantity, item.product_id]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val); // Local state responsive
    
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const parsed = parseInt(val);
    if (!isNaN(parsed) && parsed > 0) {
      // 1000ms debounce for multi-digit entry
      debounceTimerRef.current = setTimeout(() => {
        onUpdateQuantity(item.product_id, parsed);
      }, 1000);
    }
  };

  const handleBlur = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const parsed = parseInt(inputValue);
    if (isNaN(parsed) || parsed <= 0) {
      setInputValue(item.quantity);
    } else {
      onUpdateQuantity(item.product_id, parsed);
    }
  };

  return (
    <div className="p-3 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-500">{formatCurrency(item.selling_price)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onUpdateQuantity(item.product_id, item.quantity - 1)}
          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-lg">−</button>
        <input 
          id={`qty-input-${item.product_id}`}
          type="number" 
          min="1"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={(e) => e.target.select()}
          className="w-12 text-center text-sm font-bold bg-gray-50 rounded-lg py-1 border border-transparent focus:border-blue-400 focus:bg-white outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button onClick={() => onUpdateQuantity(item.product_id, item.quantity + 1)}
          className="w-8 h-8 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center font-bold text-lg">+</button>
      </div>
      <span className="text-sm font-semibold w-16 text-right">{formatCurrency(item.selling_price * item.quantity)}</span>
      <button onClick={() => onRemove(item.product_id)} className="text-red-400 hover:text-red-600 ml-1 text-lg leading-none">✕</button>
    </div>
  );
};

export default function POSPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [lastAddedItem, setLastAddedItem] = useState(null);
  const bubbleTimeoutRef = useRef(null);

  const { cart, subTotal, tax, total, addItem: addItemRaw, removeItem, updateQuantity, clearCart } = useCart();
  const { activeStore } = useAuth();

  // Custom addItem to trigger bubble notification
  const addItem = (item) => {
    const existingInCart = cart.items.find(i => i.product_id === item.id);
    const currentQty = existingInCart ? existingInCart.quantity : 0;

    // Check stock before adding
    if (currentQty + 1 > item.stock_quantity) {
      toast.error(`สินค้า "${item.name}" มีในคลังเพียง ${item.stock_quantity} ชิ้น`, { 
        id: 'out-of-stock',
        duration: 2000,
        position: 'top-center',
        icon: '⚠️'
      });
      return;
    }

    addItemRaw(item);
    
    // Clear previous timeout if it exists
    if (bubbleTimeoutRef.current) {
      clearTimeout(bubbleTimeoutRef.current);
    }

    setLastAddedItem(null); // Force re-render for animation
    setTimeout(() => {
      setLastAddedItem(item);
      // Set new timeout to hide bubble after 3 seconds
      bubbleTimeoutRef.current = setTimeout(() => {
        setLastAddedItem(null);
        bubbleTimeoutRef.current = null;
      }, 3000);
    }, 10);
  };

  const handleUpdateQuantity = (productId, newQty) => {
    if (newQty <= 0) {
      updateQuantity(productId, 0); // This will remove the item
      return;
    }

    const product = products.find(p => p.id === productId);
    if (product && newQty > product.stock_quantity) {
      toast.error(`สินค้า "${product.name}" มีในคลังเพียง ${product.stock_quantity} ชิ้น (ปรับให้เท่ากับจำนวนสูงสุดแล้ว)`, { 
        id: 'out-of-stock-update',
        duration: 2000,
        position: 'top-center'
      });
      // Auto-cap to max stock
      updateQuantity(productId, product.stock_quantity);
      return;
    }
    updateQuantity(productId, newQty);
  };


  useEffect(() => { loadProducts(); loadCategories(); }, []);

  useEffect(() => {
    if (paymentModal) {
      setCashReceived("");
      setPaymentMethod("cash");
    }
  }, [paymentModal]);

  const loadProducts = async () => {
    try {
      const res = await api.get("/products", { params: { limit: 200, raw_material: "false" } });
      const sellable = (res.data.data || []).filter(p => !p.is_raw_material);
      setProducts(sellable);
      cacheProducts(sellable);
    } catch {
      const cached = await getCachedProducts();
      setProducts((cached || []).filter(p => !p.is_raw_material));
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.get("/categories");
      setCategories(res.data.data);
    } catch { setCategories([]); }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setCatSaving(true);
    try {
      await api.post("/categories", { name: catName.trim() });
      toast.success("เพิ่มหมวดหมู่สำเร็จ");
      setCatName("");
      setCatModal(false);
      loadCategories();
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    } finally { setCatSaving(false); }
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.includes(searchQuery) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = !selectedCategory || p.category_id === selectedCategory;
    return matchSearch && matchCategory;
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "F2") { e.preventDefault(); document.getElementById("search-input")?.focus(); }
      if (e.key === "F9") { e.preventDefault(); if (cart.items.length > 0) { loadDebtors(); setPaymentModal(true); } }
      if (e.key === "Escape") { setPaymentModal(false); setSearchQuery(""); setShowMobileCart(false); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart.items]);

  const [debtorName, setDebtorName] = useState("");
  const [debtorId, setDebtorId] = useState("");
  const [debtors, setDebtors] = useState([]);
  const [debtorModal, setDebtorModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [ppConfirmModal, setPpConfirmModal] = useState(false);
  const invoiceRef = useRef(null);

  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerTransport, setPrinterTransport] = useState(null);
  const [lastOrderData, setLastOrderData] = useState(null);
  const isAndroidPOS = hardwareScanner.isAvailable();

  useEffect(() => {
    if (!isAndroidPOS) return;
    const onScan = (code) => {
      const found = products.find((p) => p.barcode === code || p.sku === code);
      if (found) {
        addItem(found);
        toast.success(`เพิ่ม "${found.name}" ลงตะกร้า`, { duration: 1500, position: 'top-center' });
      } else {
        toast(`ไม่พบสินค้า "${code}"`, { icon: '❌', duration: 2000, position: 'top-center' });
      }
    };
    hardwareScanner.subscribe(onScan);
    return () => hardwareScanner.unsubscribe(onScan);
  }, [isAndroidPOS, products]);

  const handleConnectUsb = async () => {
    try {
      await connectUsb();
      setPrinterConnected(true);
      setPrinterTransport('usb');
      toast.success('เชื่อมต่อเครื่องพิมพ์ USB สำเร็จ');
    } catch (err) {
      toast.error(err.message || 'เชื่อมต่อ USB ล้มเหลว');
    }
  };

  const handleConnectBluetooth = async () => {
    try {
      await connectBluetooth();
      setPrinterConnected(true);
      setPrinterTransport('bluetooth');
      toast.success('เชื่อมต่อเครื่องพิมพ์ Bluetooth สำเร็จ');
    } catch (err) {
      toast.error(err.message || 'เชื่อมต่อ Bluetooth ล้มเหลว');
    }
  };

  const handlePrintReceipt = async (orderData) => {
    const source = orderData || lastOrderData;
    if (!source) { toast.error('ไม่มีข้อมูลออเดอร์'); return; }
    try {
      const transport = await printReceipt({
        storeName:    activeStore?.name,
        storeAddress: activeStore?.address,
        storePhone:   activeStore?.phone,
        items:        source.items.map((i) => ({
          name:       i.name || products.find((p) => p.id === i.product_id)?.name || '',
          quantity:   i.quantity,
          unit_price: i.unit_price,
        })),
        subTotal:      source.subTotal,
        discount:      source.discount || 0,
        tax:           source.tax,
        total:         source.total,
        cashReceived:  source.cashReceived,
        paymentMethod: source.payment_method,
        vatRate:       activeStore?.vat_rate ?? 7,
      });
      toast.success(`พิมพ์ใบเสร็จสำเร็จ (${transport})`);
    } catch (err) {
      toast.error(err.message || 'พิมพ์ไม่สำเร็จ');
    }
  };

  const handleDownloadStatement = async () => {
    // 1. Save order to DB with custom status
    const orderData = {
      items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.selling_price, discount: i.discount || 0 })),
      customer_id: cart.customerId,
      payment_method: "qr_promptpay",
      discount: cart.discount,
      is_outstanding: true,
      status: "รอชำระพร้อมเพย์",
      debtor_id: debtorId || undefined,
      debtor_name: debtorName || undefined,
    };

    const t = toast.loading("กำลังบันทึกรายการและสร้างใบแจ้งยอด...");
    try {
      await api.post("/orders", orderData);
      
      // 2. Generate JPEG
      if (!invoiceRef.current) throw new Error("Invoice template not found");
      const dataUrl = await toJpeg(invoiceRef.current, { quality: 0.95, backgroundColor: 'white' });
      
      // 3. Download
      const link = document.createElement('a');
      link.download = `statement-${new Date().getTime()}.jpg`;
      link.href = dataUrl;
      link.click();
      
      toast.success("บันทึกและดาวน์โหลดสำเร็จ", { id: t });
      
      // 4. Cleanup & Close everything
      clearCart();
      setPaymentModal(false);
      setPpConfirmModal(false);
      setCashReceived("");
      setDebtorId("");
      setDebtorName("");
      setShowMobileCart(false);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error?.message || "เกิดข้อผิดพลาด", { id: t });
    }
  };

  const handleBarcodeDetected = (barcode) => {
    // Continuous mode: scanner stays open for quick multi-item scanning
    const found = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (found) {
      addItem(found);
      toast.success(`เพิ่ม "${found.name}" ลงตะกร้า`, { duration: 1500, position: 'top-center' });
    } else {
      toast(`ไม่พบสินค้า "${barcode}"`, { icon: '❌', duration: 2000, position: 'top-center' });
    }
  };
  const [newDebtorName, setNewDebtorName] = useState("");
  const [newDebtorPhone, setNewDebtorPhone] = useState("");
  const [savingDebtor, setSavingDebtor] = useState(false);

  const loadDebtors = async () => {
    try { const res = await api.get("/debtors"); setDebtors(res.data.data); } catch {}
  };

  const handleAddDebtor = async (e) => {
    e.preventDefault();
    setSavingDebtor(true);
    try {
      const res = await api.post("/debtors", { name: newDebtorName, phone: newDebtorPhone });
      setDebtors(d => [...d, res.data.data]);
      setDebtorId(res.data.data.id);
      setDebtorName(res.data.data.name);
      setNewDebtorName(""); setNewDebtorPhone("");
      setDebtorModal(false);
      toast.success("เพิ่มลูกหนี้สำเร็จ");
    } catch (err) { toast.error(err.response?.data?.message || "เกิดข้อผิดพลาด"); }
    finally { setSavingDebtor(false); }
  };

  const handlePayment = async () => {
    const isOutstanding = paymentMethod === "outstanding";
    if (isOutstanding && !debtorId) { toast.error("กรุณาเลือกลูกหนี้"); return; }
    const orderData = {
      items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.selling_price, discount: i.discount || 0, name: i.name })),
      customer_id: cart.customerId,
      payment_method: isOutstanding ? "outstanding" : paymentMethod,
      discount: cart.discount,
      is_outstanding: isOutstanding,
      debtor_id: isOutstanding ? debtorId : undefined,
      debtor_name: isOutstanding ? debtorName : undefined,
      subTotal,
      tax,
      total,
      cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : undefined,
    };
    try {
      if (navigator.onLine) {
        await api.post("/orders", orderData);
        toast.success(isOutstanding ? "บันทึกค้างชำระสำเร็จ!" : "ชำระเงินสำเร็จ!");
        loadProducts();
      } else {
        await savePendingOrder(orderData);
        toast.success("บันทึกออฟไลน์ - จะซิงค์เมื่อออนไลน์");
      }
      setLastOrderData(orderData);
      if (!isOutstanding && isPrinterAvailable()) {
        handlePrintReceipt(orderData);
      }
      clearCart();
      setPaymentModal(false);
      setCashReceived("");
      setDebtorId("");
      setDebtorName("");
      setShowMobileCart(false);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "เกิดข้อผิดพลาด");
    }
  };

  const change = parseFloat(cashReceived) - total;
  const totalQty = cart.items.reduce((s, i) => s + i.quantity, 0);

  const ProductGrid = ({ cols }) => (
    <div className={`grid gap-3 ${cols}`}>
      {filteredProducts.map((product) => {
        const isOutOfStock = product.stock_quantity <= 0;
        return (
          <button
            key={product.id}
            onClick={() => { addItem(product); }}
            disabled={isOutOfStock}
            className={`relative bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-col items-center transition-all ${
              isOutOfStock 
                ? 'opacity-60 grayscale cursor-not-allowed' 
                : 'active:scale-95 hover:shadow-md'
            }`}
          >
            {isOutOfStock && (
              <div className="absolute top-2 right-2 z-10">
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                  หมด
                </span>
              </div>
            )}
            <div className="w-14 h-14 bg-gray-100 rounded-xl mb-2 flex items-center justify-center text-3xl overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt="" className="w-full h-full object-cover" />
              ) : "📦"}
            </div>
            <span className="text-xs font-medium text-gray-800 text-center line-clamp-2 leading-tight mb-1">
              {product.name}
            </span>
            <div className="flex flex-col items-center">
              <span className="text-sm font-bold text-blue-600">
                {formatCurrency(product.selling_price)}
              </span>
              <span className={`text-[10px] font-medium mt-0.5 ${isOutOfStock ? 'text-red-500' : 'text-gray-400'}`}>
                คลัง: {product.stock_quantity}
              </span>
            </div>
          </button>
        );
      })}
      {filteredProducts.length === 0 && (
        <div className="col-span-full text-center text-gray-400 mt-16 text-sm">ไม่พบสินค้า</div>
      )}
    </div>
  );

  const CategoryBar = () => (
    <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto border-b border-purple-100/40 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex-shrink-0">
      <button onClick={() => setSelectedCategory(null)}
        className={"whitespace-nowrap flex-shrink-0 category-tab " + (!selectedCategory ? 'category-tab-active' : 'category-tab-inactive')}>
        ทั้งหมด
      </button>
      {categories.map((cat) => (
        <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
          className={"whitespace-nowrap flex-shrink-0 category-tab " + (selectedCategory === cat.id ? 'category-tab-active' : 'category-tab-inactive')}>
          {cat.name}
        </button>
      ))}
      <button onClick={() => { setCatName(""); setCatModal(true); }}
        className="whitespace-nowrap flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md ml-1"
        style={{ backgroundImage: "linear-gradient(to left,#3300FC,#95008A,#EB0000)" }}
        title="เพิ่มหมวดหมู่">+</button>
    </div>
  );

  const CartItems = () => (
    <>
      {cart.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-400 gap-3 py-16">
          <span className="text-5xl">🛒</span>
          <p className="text-sm">ยังไม่มีสินค้าในตะกร้า</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {cart.items.map((item) => (
            <CartItem 
              key={item.product_id} 
              item={item} 
              onUpdateQuantity={handleUpdateQuantity}
              onRemove={removeItem}
            />
          ))}
        </div>
      )}
    </>
  );

  const CartSummary = () => (
    <div className="border-t border-primary-100/60 dark:border-slate-700 p-4 space-y-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400"><span>ยอดรวม</span><span className="font-medium text-gray-700 dark:text-slate-200">{formatCurrency(subTotal)}</span></div>
      {cart.discount > 0 && <div className="flex justify-between text-sm text-danger-600"><span>ส่วนลด</span><span>-{formatCurrency(cart.discount)}</span></div>}
      <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400"><span>VAT {activeStore?.vat_rate ?? 7}%</span><span className="font-medium text-gray-700 dark:text-slate-200">{formatCurrency(tax)}</span></div>
      <div className="flex justify-between text-xl font-bold pt-2 border-t border-primary-100/60 dark:border-slate-700">
        <span className="text-gray-700 dark:text-slate-100">รวมทั้งสิ้น</span>
        <span className="text-primary-600 dark:text-purple-400">{formatCurrency(total)}</span>
      </div>
      <button onClick={() => setPaymentModal(true)} disabled={cart.items.length === 0}
        className="btn-success w-full text-lg rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed mt-1"
        onMouseEnter={loadDebtors}>
        💳 ชำระเงิน {cart.items.length > 0 ? formatCurrency(total) : ''}
      </button>
      <div className="flex gap-2">
        <button onClick={() => { 
          if (cart.items.length > 0) {
            if (window.confirm("คุณต้องการยกเลิกรายการทั้งหมดในตะกร้าใช่หรือไม่?")) {
              clearCart(); 
              setShowMobileCart(false); 
            }
          } else {
            setShowMobileCart(false);
          }
        }} className="btn-danger w-full !py-3 text-sm">ยกเลิก</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] page-bg-gradient">

      {/* DESKTOP (md+) */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Left - Products */}
        <div className="w-[65%] flex flex-col border-r border-primary-100/60">
          <div className="p-3 border-b border-primary-100/60 flex-shrink-0 bg-white/50 backdrop-blur-sm">
            <div className="flex gap-2">
              <input id="search-input" type="text" placeholder="🔍 ค้นหาสินค้า / สแกนบาร์โค้ด (F2)"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field flex-1" autoComplete="off" />
              <button onClick={() => setShowScanner(true)} title="สแกนบาร์โค้ดด้วยกล้อง"
                className="flex-shrink-0 w-11 h-11 rounded-xl text-white flex items-center justify-center shadow hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}>
                <ScanIcon size={22} color="white" strokeWidth={2} />
              </button>
            </div>
          </div>
          <CategoryBar />
          <div className="flex-1 overflow-y-auto p-3">
            <ProductGrid cols="grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" />
          </div>
        </div>
        {/* Right - Cart */}
        <div className="w-[35%] flex flex-col bg-white/60 dark:bg-slate-900/60 border-l border-purple-100/40 dark:border-slate-800 backdrop-blur-sm">
          <div className="p-4 border-b border-primary-100/60 dark:border-slate-800 flex-shrink-0">
            <h2 className="font-bold text-gray-700 dark:text-slate-100 flex items-center gap-2">
              <span className="text-lg">🧾</span> ตะกร้าสินค้า
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <CartItems />
          </div>
          <CartSummary />
        </div>
      </div>

      {/* MOBILE (< md) */}
      <div className="flex flex-col flex-1 min-h-0 md:hidden relative">
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-3 border-b border-primary-100/60 bg-white/60 backdrop-blur-sm flex-shrink-0">
            <div className="flex gap-2">
              <input id="search-input" type="text" placeholder="🔍 ค้นหา / สแกนบาร์โค้ด"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field flex-1" autoComplete="off" />
              <button onClick={() => setShowScanner(true)} title="สแกนบาร์โค้ดด้วยกล้อง"
                className="flex-shrink-0 w-11 h-11 rounded-xl text-white flex items-center justify-center shadow hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}>
                <ScanIcon size={22} color="white" strokeWidth={2} />
              </button>
            </div>
          </div>
          <CategoryBar />
          <div className="flex-1 overflow-y-auto p-3">
            <ProductGrid cols="grid-cols-2" />
          </div>
        </div>

        {/* Floating Cart Button (FAB) & Messenger Bubble */}
        <div className="fixed bottom-8 right-8 z-40 flex items-center">
          {/* Messenger-style Notification Bubble */}
          {lastAddedItem && (
            <div className="relative mr-3 animate-slide-left">
              <div className="bg-[#2196F3] text-white px-4 py-2.5 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] text-sm font-bold whitespace-nowrap border border-white/20">
                เพิ่ม {lastAddedItem.name} แล้ว!
                {/* Triangular Pointer */}
                <div className="absolute top-1/2 -right-[7px] -translate-y-1/2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-[#2196F3]"></div>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowMobileCart(true)}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105 border-2 border-white/40 shadow-[0_15px_35px_-5px_rgba(0,0,0,0.4),0_10px_15px_-5px_rgba(0,0,0,0.2)]"
            style={{ 
              backgroundImage: 'linear-gradient(135deg, #3300FC 0%, #95008A 50%, #EB0000 100%)'
            }}
          >
            <svg 
              viewBox="0 0 24 24" 
              className="w-8 h-8 text-white fill-current"
            >
              <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
            {totalQty > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[12px] font-black w-8 h-8 rounded-full flex items-center justify-center shadow-2xl border-2 border-white animate-bounce">
                <span className="leading-none">{totalQty}</span>
              </span>
            )}
          </button>
        </div>

        {/* Mobile Cart Slide-up Drawer */}
        {showMobileCart && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileCart(false)} />
            <div className="relative bg-white rounded-t-[32px] shadow-2xl flex flex-col max-h-[90%] animate-slide-up">
              {/* Handle bar */}
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-3 flex-shrink-0" />
              
              <div className="px-6 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                  <span>🧾</span> ตะกร้าสินค้า ({totalQty} ชิ้น)
                </h2>
                <button onClick={() => setShowMobileCart(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                <CartItems />
              </div>
              
              <div className="p-2 border-t border-gray-100">
                <CartSummary />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg p-6 border border-primary-100">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />
            <h2 className="text-xl font-bold text-gray-800 mb-4">💳 ชำระเงิน</h2>
            <div className="text-center mb-5 rounded-2xl py-4 px-6" style={{ background: '#EB0000', backgroundImage: 'linear-gradient(to left, #3300FC, #95008A, #EB0000)' }}>
              <p className="text-purple-100 text-sm">ยอดที่ต้องชำระ</p>
              <p className="text-4xl font-bold text-white mt-1">{formatCurrency(total)}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { value: 'cash',          label: '💵', sub: 'เงินสด' },
                { value: 'qr_promptpay', label: '📱', sub: 'QR/PromptPay' },
                { value: 'outstanding',   label: '📋', sub: 'ค้างชำระ' },
              ].map((m) => (
                <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                  className={'p-3 rounded-2xl border-2 text-center transition-all ' +
                    (paymentMethod === m.value
                      ? 'border-purple-500 bg-purple-50 shadow-md'
                      : 'border-gray-100 hover:border-purple-200 bg-white')}>
                  <div className="text-2xl">{m.label}</div>
                  <div className={'text-xs font-semibold mt-1 ' + (paymentMethod === m.value ? 'text-purple-700' : 'text-gray-600')}>{m.sub}</div>
                </button>
              ))}
            </div>
            {paymentMethod === 'outstanding' && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2">
                  <select value={debtorId} onChange={e => {
                    const d = debtors.find(x => x.id === e.target.value);
                    setDebtorId(e.target.value);
                    setDebtorName(d?.name || "");
                  }} className="input-field flex-1">
                    <option value="">— เลือกลูกหนี้ —</option>
                    {debtors.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ''}</option>)}
                  </select>
                  <button type="button" onClick={() => setDebtorModal(true)}
                    className="flex-shrink-0 w-10 h-10 rounded-xl text-white text-xl font-bold shadow-md hover:opacity-90"
                    style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}
                    title="เพิ่มลูกหนี้ใหม่">+</button>
                </div>
                {!debtorId && <p className="text-xs text-red-500">* กรุณาเลือกลูกหนี้</p>}
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  ⚠️ รายการนี้จะไม่นับรวมในยอดขาย จนกว่าจะมีการชำระเงิน
                </p>
              </div>
            )}
            {paymentMethod === 'qr_promptpay' && (
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-500 mb-3 font-medium">สแกนเพื่อชำระเงิน</p>
                {activeStore?.promptpay_number ? (
                  <div className="bg-white p-4 rounded-3xl border-2 border-primary-50 inline-block shadow-sm">
                    <QRCodeCanvas 
                      value={generatePayload(activeStore.promptpay_number, { amount: total })} 
                      size={200}
                      includeMargin={true}
                    />
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-100">
                      <p className="text-xs text-gray-400">PromptPay</p>
                      <p className="text-sm font-bold text-gray-700">
                        {activeStore.promptpay_number?.length === 10 
                          ? `${activeStore.promptpay_number.slice(0, 3)}-XXX-XX${activeStore.promptpay_number.slice(8)}`
                          : activeStore.promptpay_number}
                      </p>
                      {activeStore.promptpay_name && <p className="text-xs font-medium text-gray-500 mt-1">{activeStore.promptpay_name}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-red-600 font-bold mb-1">❌ ยังไม่ได้ตั้งค่า PromptPay</p>
                    <p className="text-xs text-red-500">กรุณาตั้งค่าหมายเลขพร้อมเพย์ในหน้าตั้งค่าระบบ</p>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-4 italic">เมื่อลูกค้าชำระเงินเรียบร้อยแล้ว กดปุ่มยืนยันด้านล่าง</p>
                <button onClick={() => { loadDebtors(); setPpConfirmModal(true); }} className="mt-4 text-sm font-bold text-primary-600 hover:text-primary-700 flex items-center justify-center gap-2 mx-auto bg-primary-50 px-4 py-2 rounded-full border border-primary-100 transition-all active:scale-95">
                  📥 ดาวน์โหลดใบแจ้งยอด (Statement)
                </button>
              </div>
            )}
            {paymentMethod === 'cash' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-1">รับเงิน (บาท)</label>
                <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)}
                  className="input-field text-2xl text-center font-bold" placeholder="0.00" autoFocus />
                {cashReceived && (
                  change >= 0 ? (
                    <div className="text-center mt-3 bg-success-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-success-600">เงินทอน: {formatCurrency(change)}</p>
                    </div>
                  ) : (
                    <div className="text-center mt-3 bg-red-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-red-600">ขาดอีก: {formatCurrency(Math.abs(change))}</p>
                    </div>
                  )
                )}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[1, 5, 10, 20, 50, 100, 500, 1000].map((amt) => (
                    <button key={amt} onClick={() => setCashReceived(prev => String((parseFloat(prev) || 0) + amt))}
                      className="btn-ghost text-sm !py-2 !px-1">
                      ฿{amt}
                    </button>
                  ))}
                  <button onClick={() => setCashReceived(String(Math.ceil(total)))}
                    className="btn-ghost text-sm !py-2 !px-1 col-span-4">
                    พอดี
                  </button>
                </div>
              </div>
            )}
            {/* Printer connect row — shown only when no native bridge detected */}
            {!isPrinterAvailable() && (navigator.usb || navigator.bluetooth) && (
              <div className="flex gap-2 mb-4">
                {navigator.usb && (
                  <button onClick={handleConnectUsb}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center gap-1 transition-all">
                    🖨️ เชื่อม USB
                  </button>
                )}
                {navigator.bluetooth && (
                  <button onClick={handleConnectBluetooth}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center gap-1 transition-all">
                    📡 เชื่อม Bluetooth
                  </button>
                )}
              </div>
            )}
            {printerConnected && (
              <p className="text-xs text-green-600 font-medium text-center mb-3">
                ✅ เครื่องพิมพ์พร้อมใช้งาน ({printerTransport})
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => setPaymentModal(false)} className="btn-ghost flex-1">ยกเลิก</button>
              <button onClick={handlePayment}
                disabled={
                  (paymentMethod === 'cash' && (!cashReceived || change < 0)) ||
                  (paymentMethod === 'outstanding' && !debtorName.trim()) ||
                  (paymentMethod === 'qr_promptpay' && !activeStore?.promptpay_number)
                }
                className="btn-success flex-1 disabled:opacity-40">
                {paymentMethod === 'outstanding'
                  ? '📋 บันทึกค้างชำระ'
                  : isPrinterAvailable() ? '🖨️ ชำระและพิมพ์ใบเสร็จ' : '✅ ยืนยันชำระเงิน'}
              </button>
            </div>

            {lastOrderData && !paymentModal && isPrinterAvailable() && (
              <button onClick={() => handlePrintReceipt(null)}
                className="w-full mt-2 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-all">
                🖨️ พิมพ์ใบเสร็จซ้ำ
              </button>
            )}
          </div>
        </div>
      )}
          {/* Add Category Modal */}
          {catModal && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">🏷️ เพิ่มหมวดหมู่ใหม่</h3>
                <form onSubmit={handleAddCategory} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">ชื่อหมวดหมู่</label>
                    <input
                      autoFocus
                      type="text"
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      className="input-field"
                      placeholder="เช่น เครื่องดื่ม, ขนม, อาหาร..."
                      required
                    />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setCatModal(false)} className="btn-ghost flex-1">ยกเลิก</button>
                    <button type="submit" disabled={catSaving} className="btn-primary flex-1 disabled:opacity-50">
                      {catSaving ? "กำลังบันทึก..." : "➕ เพิ่มหมวดหมู่"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            )}
            {/* PromptPay Confirmation & Debtor Selection Modal */}
            {ppConfirmModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
              <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md p-8 border border-primary-50 animate-bounce-in">
                <div className="text-center mb-6">
                  <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">📥</div>
                  <h3 className="text-2xl font-black text-gray-800 mb-2">สร้างใบแจ้งยอด</h3>
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-amber-700 text-sm font-medium leading-relaxed">
                    ⚠️ เมื่อดาวน์โหลดแล้ว <span className="font-bold underline">QR Code จะถูกปิด</span> และรายการนี้จะถูกย้ายไปที่หน้า <b>"ลูกหนี้/ค้างชำระ"</b> อัตโนมัติ โดยระบุสถานะเป็น <b>"รอชำระพร้อมเพย์"</b>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">เลือกลูกหนี้ (ถ้ามี/ไม่บังคับ)</label>
                    <div className="flex gap-2">
                      <select value={debtorId} onChange={e => {
                        const d = debtors.find(x => x.id === e.target.value);
                        setDebtorId(e.target.value);
                        setDebtorName(d?.name || "");
                      }} className="input-field flex-1 !rounded-2xl">
                        <option value="">— ไม่ระบุ / ลูกค้าทั่วไป —</option>
                        {debtors.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => setDebtorModal(true)}
                        className="flex-shrink-0 w-12 h-12 rounded-2xl text-white text-xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
                        style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}
                        title="เพิ่มลูกหนี้ใหม่">+</button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button onClick={handleDownloadStatement} className="btn-primary !py-4 !text-lg !rounded-2xl shadow-xl shadow-primary-200">
                    🚀 ยืนยันบันทึกและดาวน์โหลด
                  </button>
                  <button onClick={() => setPpConfirmModal(false)} className="btn-ghost !text-gray-400 font-bold !py-3">ไว้ทีหลัง / ยกเลิก</button>
                </div>
              </div>
            </div>
            )}
            {/* Add Debtor Modal */}
          {debtorModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">➕ เพิ่มลูกหนี้ใหม่</h3>
                <form onSubmit={handleAddDebtor} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">ชื่อ <span className="text-red-500">*</span></label>
                    <input autoFocus required value={newDebtorName} onChange={e => setNewDebtorName(e.target.value)}
                      className="input-field" placeholder="ชื่อ-นามสกุล / ชื่อบริษัท" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">เบอร์โทร</label>
                    <input value={newDebtorPhone} onChange={e => setNewDebtorPhone(e.target.value)}
                      className="input-field" placeholder="เบอร์โทรศัพท์ (ไม่บังคับ)" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setDebtorModal(false)} className="btn-ghost flex-1">ยกเลิก</button>
                    <button type="submit" disabled={savingDebtor} className="btn-primary flex-1 disabled:opacity-50">
                      {savingDebtor ? "กำลังบันทึก..." : "➕ เพิ่ม"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Barcode Scanner */}
          {showScanner && (
            <BarcodeScanner
              onDetected={handleBarcodeDetected}
              onClose={() => setShowScanner(false)}
              isContinuous={true}
            />
          )}

          {/* Hidden Invoice Template for Capture */}
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
            <div ref={invoiceRef} className="bg-white p-10 w-[600px] text-gray-800 font-sans" style={{ background: 'white' }}>
              <div className="text-center border-b-4 border-gray-100 pb-6 mb-8">
                <h2 className="text-3xl font-black text-gray-900 mb-1">{activeStore?.name}</h2>
                <p className="text-base text-gray-500">{activeStore?.address}</p>
                {activeStore?.phone && <p className="text-base text-gray-500">โทร: {activeStore?.phone}</p>}
                <div className="mt-6 bg-gray-900 text-white inline-block px-8 py-2 rounded-full text-xl font-bold tracking-[0.2em] uppercase">
                  ใบแจ้งยอด
                </div>
              </div>

              <table className="w-full mb-8">
                <thead>
                  <tr className="text-left border-b-2 border-gray-100 text-gray-400 text-sm uppercase tracking-wider">
                    <th className="py-3 font-bold">รายการ</th>
                    <th className="py-3 text-center font-bold">จำนวน</th>
                    <th className="py-3 text-right font-bold">ราคา</th>
                    <th className="py-3 text-right font-bold">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cart.items.map((item, idx) => (
                    <tr key={idx} className="text-gray-700">
                      <td className="py-4 font-bold">{item.name}</td>
                      <td className="py-4 text-center">{item.quantity}</td>
                      <td className="py-4 text-right">{formatCurrency(item.selling_price)}</td>
                      <td className="py-4 text-right font-bold">{formatCurrency(item.selling_price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mb-10">
                <div className="w-64 space-y-3">
                  <div className="flex justify-between text-gray-500">
                    <span>ยอดรวม</span>
                    <span className="font-medium">{formatCurrency(subTotal)}</span>
                  </div>
                  {cart.discount > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>ส่วนลด</span>
                      <span className="font-medium">-{formatCurrency(cart.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-500">
                    <span>VAT {activeStore?.vat_rate}%</span>
                    <span className="font-medium">{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between text-3xl font-black text-primary-600 pt-4 border-t-2 border-gray-100">
                    <span>รวมทั้งสิ้น</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {activeStore?.promptpay_number && (
                <div className="flex flex-col items-center bg-gray-50 rounded-[40px] p-8 border-2 border-primary-50 shadow-inner">
                  <p className="text-sm font-black text-gray-400 mb-4 tracking-widest uppercase">สแกนเพื่อชำระเงิน (PromptPay)</p>
                  <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                    <QRCodeCanvas 
                      value={generatePayload(activeStore.promptpay_number, { amount: total })} 
                      size={240}
                      includeMargin={true}
                    />
                  </div>
                  <div className="mt-6 text-center">
                    <p className="text-2xl font-black text-gray-800 tracking-wider">{activeStore.promptpay_number}</p>
                    {activeStore.promptpay_name && (
                      <p className="text-lg font-bold text-primary-600 mt-1">{activeStore.promptpay_name}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-12 text-center">
                <p className="text-sm text-gray-400 font-medium italic">ขอบคุณที่ใช้บริการ</p>
                <p className="text-xs text-gray-300 mt-2">พิมพ์เมื่อ: {new Date().toLocaleString('th-TH')}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
