import { useState, useEffect } from 'react';
import { formatCurrency, formatQty } from '../utils/format';
import api, { recipesAPI } from '../services/api';
import toast from 'react-hot-toast';
import Pagination from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';
import BarcodeScanner from '../components/BarcodeScanner';
import ScanIcon from '../components/ScanIcon';
import { useAuth } from '../contexts/AuthContext';
import { canMaintainModule } from '../utils/permissions';

const GRAD = 'linear-gradient(to left,#3300FC,#95008A,#EB0000)';

const BASE_UNITS_LIST = [
  { value: 'ชิ้น', label: 'ชิ้น (pcs)' },
  { value: 'g', label: 'กรัม (g)' },
  { value: 'ml', label: 'มิลลิลิตร (ml)' },
  { value: 'kg', label: 'กิโลกรัม (kg)' },
  { value: 'L', label: 'ลิตร (L)' },
  { value: 'oz', label: 'ออนซ์ (oz)' },
  { value: 'ถุง', label: 'ถุง (bag)' },
  { value: 'ขวด', label: 'ขวด (bottle)' },
  { value: 'กล่อง', label: 'กล่อง (box)' },
  { value: 'แพ็ค', label: 'แพ็ค (pack)' },
  { value: 'แก้ว', label: 'แก้ว (cup)' },
  { value: 'กระป๋อง', label: 'กระป๋อง (can)' },
  { value: 'แผ่น', label: 'แผ่น (sheet)' },
  { value: 'ชุด', label: 'ชุด (set)' },
];

function normalizeUnitKey(unitStr) {
  if (!unitStr) return 'ชิ้น';
  const u = String(unitStr).trim();
  const lower = u.toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล'].includes(lower)) return 'kg';
  if (['g', 'กรัม', 'ก.'].includes(lower)) return 'g';
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล'].includes(lower)) return 'ml';
  if (['l', 'ลิตร'].includes(lower)) return 'L';
  if (['oz', 'ออนซ์'].includes(lower)) return 'oz';
  if (['ถุง', 'bag'].includes(lower)) return 'ถุง';
  if (['ขวด', 'bottle'].includes(lower)) return 'ขวด';
  if (['กล่อง', 'box'].includes(lower)) return 'กล่อง';
  if (['แพ็ค', 'pack'].includes(lower)) return 'แพ็ค';
  if (['แก้ว', 'cup'].includes(lower)) return 'แก้ว';
  if (['กระป๋อง', 'can'].includes(lower)) return 'กระป๋อง';
  if (['แผ่น', 'sheet'].includes(lower)) return 'แผ่น';
  if (['ชุด', 'set'].includes(lower)) return 'ชุด';
  if (['ชิ้น', 'pcs', 'piece'].includes(lower)) return 'ชิ้น';
  return u;
}

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
      {/* Toggle button */}
      <button type="button"
        onClick={() => { if (!applied) setOpen(o => !o); }}
        className={"flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all " +
          (applied
            ? "border-green-300 text-green-700 bg-green-50 cursor-default"
            : "border-red-300 text-red-700 bg-red-50 hover:bg-red-100")}
      >
        <span>{applied ? '🔒' : '📦'}</span>
        {applied ? `ใช้ต้นทุนจากแพ็ค (฿${costPerItem.toFixed(2)}/ชิ้น)` : 'คำนวณจากจำนวนแพ็คที่ซื้อ'}
        {!applied && <span className="text-gray-400 ml-1">{open ? '▲' : '▼'}</span>}
      </button>

      {/* Unlock button shown when applied */}
      {applied && (
        <button type="button" onClick={handleUnlock}
          className="ml-2 text-xs text-gray-400 hover:text-red-500 underline transition-colors">
          ยกเลิกล็อก
        </button>
      )}

      {/* Calculator panel */}
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

          <button type="button" onClick={handleApply}
            disabled={costPerItem <= 0}
            className="w-full py-2.5 rounded-xl text-white font-bold text-sm shadow hover:opacity-90 disabled:opacity-40 transition-all"
            style={{ backgroundColor: '#EB0000' }}>
            นำไปใช้เป็นราคาต้นทุน (฿{costPerItem.toFixed(2)}/ชิ้น)
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const { user } = useAuth();
  const canMaintain = canMaintainModule(user, 'products');

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recipeSummaryMap, setRecipeSummaryMap] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [packLocked, setPackLocked] = useState(false);
  const [productType, setProductType] = useState('standard'); // 'standard' | 'finished_goods' | 'raw_material'
  const [selectedLinkedRecipeId, setSelectedLinkedRecipeId] = useState('');
  const [form, setForm] = useState({
    sku: '', barcode: '', name: '', description: '', category_id: '',
    cost_price: '', selling_price: '', image_url: '', is_featured: false, is_raw_material: false, unit: 'ชิ้น', net_weight: 1, reorder_level: 5,
  });
  const [packTotalPrice, setPackTotalPrice] = useState('');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIsRaw, setNewCategoryIsRaw] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);

  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitSymbol, setNewUnitSymbol] = useState('');
  const [customUnits, setCustomUnits] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_custom_units');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleCreateUnit = (e) => {
    e.preventDefault();
    const name = newUnitName.trim();
    const symbol = newUnitSymbol.trim();
    if (!name) return toast.error('กรุณาระบุชื่อหน่วยนับ');

    const unitVal = normalizeUnitKey(name);
    const displayLabel = symbol ? `${name} (${symbol})` : name;

    const newUnitObj = { value: unitVal, label: displayLabel };
    
    const allCurrent = [...BASE_UNITS_LIST, ...customUnits];
    const isExisting = allCurrent.some(u => normalizeUnitKey(u.value) === unitVal);
    if (isExisting) {
      toast.error(`หน่วยนับ "${name}" มีอยู่ในระบบแล้ว`);
      setForm(f => ({ ...f, unit: unitVal }));
      setShowAddUnitModal(false);
      return;
    }

    const updatedCustomUnits = [...customUnits, newUnitObj];
    setCustomUnits(updatedCustomUnits);
    try {
      localStorage.setItem('pos_custom_units', JSON.stringify(updatedCustomUnits));
    } catch {}

    setForm(f => ({ ...f, unit: unitVal }));
    toast.success(`เพิ่มหน่วยนับ "${displayLabel}" สำเร็จ`);
    setNewUnitName('');
    setNewUnitSymbol('');
    setShowAddUnitModal(false);
  };

  const getAvailableUnits = () => {
    const map = new Map();
    BASE_UNITS_LIST.forEach(u => map.set(normalizeUnitKey(u.value), u));
    customUnits.forEach(u => {
      const normKey = normalizeUnitKey(u.value);
      if (!map.has(normKey)) map.set(normKey, u);
    });
    if (form.unit) {
      const normKey = normalizeUnitKey(form.unit);
      if (!map.has(normKey)) {
        map.set(normKey, { value: form.unit, label: form.unit });
      }
    }
    return Array.from(map.values());
  };

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return toast.error('กรุณาระบุชื่อหมวดหมู่');
    try {
      setSavingCategory(true);
      const res = await api.post('/categories', {
        name: newCategoryName.trim(),
        is_raw_material: newCategoryIsRaw ? 1 : 0
      });
      if (res.data.success) {
        toast.success(`เพิ่มหมวดหมู่ "${newCategoryName}" สำเร็จ`);
        const newCat = res.data.data;
        await loadCategories();
        const isRawMat = Boolean(newCategoryIsRaw || newCat.is_raw_material || newCat.name === 'วัตถุดิบ' || newCat.name.includes('วัตถุดิบ'));
        setForm(f => ({
          ...f,
          category_id: newCat.id,
          is_raw_material: isRawMat,
          selling_price: isRawMat ? '0' : f.selling_price,
          unit: (isRawMat && f.unit === 'ชิ้น') ? 'g' : f.unit
        }));
        setNewCategoryName('');
        setNewCategoryIsRaw(false);
        setShowAddCategoryModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาดในการสร้างหมวดหมู่');
    } finally {
      setSavingCategory(false);
    }
  };

  const getProductRecipeInfo = (product) => {
    if (!product) return null;
    const rec = recipeSummaryMap[product.id];
    if (rec && (rec.ingredient_count > 0 || (rec.unit_cost !== undefined && rec.unit_cost > 0))) {
      return rec;
    }
    if (product.recipe_name || (product.sku && product.sku.startsWith('REC'))) {
      if (rec) return rec;
      return {
        unit_cost: product.cost_price,
        ingredient_count: 1,
        recipe_name: product.recipe_name
      };
    }
    return null;
  };

  const loadProducts = async () => {
    try {
      const [resProd, resRec] = await Promise.allSettled([
        api.get('/products', { params: { limit: 200 } }),
        recipesAPI.getSummary()
      ]);

      const map = {};
      if (resRec.status === 'fulfilled' && resRec.value?.data?.data && Array.isArray(resRec.value.data.data)) {
        for (const item of resRec.value.data.data) {
          map[item.product_id] = item;
        }
      }

      if (resProd.status === 'fulfilled' && resProd.value?.data?.data) {
        const prodList = resProd.value.data.data;
        const missing = prodList.filter(p =>
          !map[p.id] && (
            (p.sku && p.sku.startsWith('REC')) ||
            (p.recipe_name && p.recipe_name.trim() !== '') ||
            (parseFloat(p.recipe_yield) > 1)
          )
        );

        if (missing.length > 0) {
          await Promise.allSettled(
            missing.map(async (p) => {
              try {
                const rRes = await recipesAPI.getByProduct(p.id);
                if (rRes.data?.success && rRes.data.data) {
                  const d = rRes.data.data;
                  map[p.id] = {
                    product_id: p.id,
                    calculated_cost: d.calculated_cost || 0,
                    unit_cost: d.unit_cost !== undefined ? d.unit_cost : (p.cost_price || 0),
                    ingredient_count: (d.recipe || []).length,
                    recipe_name: p.recipe_name,
                    portion_count: p.portion_count,
                    portion_unit: p.portion_unit
                  };
                }
              } catch (_) {}
            })
          );
        }

        setRecipeSummaryMap(map);
        setProducts(prodList);
      }
    } catch (err) {
      toast.error('โหลดสินค้าไม่สำเร็จ');
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data.data);
    } catch {}
  };

  const isExistingRawMaterial = Boolean(
    editingProduct && (
      editingProduct.is_raw_material === 1 ||
      editingProduct.is_raw_material === true ||
      (editingProduct.category_name && editingProduct.category_name.includes('วัตถุดิบ'))
    )
  );

  const handleSelectProductType = (type) => {
    if (isExistingRawMaterial && type !== 'raw_material') {
      toast.error('สินค้าประเภทวัตถุดิบถูกล็อก ไม่สามารถเปลี่ยนเป็นสินค้าขาย POS ได้');
      return;
    }
    setProductType(type);
    if (type === 'raw_material') {
      const rawCat = categories.find(c => c.name === 'วัตถุดิบ' || c.is_raw_material);
      setForm(f => ({
        ...f,
        is_raw_material: true,
        category_id: rawCat ? rawCat.id : f.category_id,
        selling_price: '0',
        unit: (f.unit === 'ชิ้น' || !f.unit) ? 'g' : f.unit
      }));
    } else if (type === 'finished_goods') {
      const currentCat = categories.find(c => c.id === form.category_id);
      let catId = form.category_id;
      if (currentCat && (currentCat.name === 'วัตถุดิบ' || currentCat.is_raw_material)) {
        const nonRaw = categories.find(c => !c.name.includes('วัตถุดิบ') && !c.is_raw_material);
        if (nonRaw) catId = nonRaw.id;
      }
      setForm(f => ({
        ...f,
        is_raw_material: false,
        category_id: catId,
        cost_price: f.cost_price || '0',
        selling_price: f.selling_price === '0' ? '' : f.selling_price
      }));
    } else {
      const currentCat = categories.find(c => c.id === form.category_id);
      let catId = form.category_id;
      if (currentCat && (currentCat.name === 'วัตถุดิบ' || currentCat.is_raw_material)) {
        const nonRaw = categories.find(c => !c.name.includes('วัตถุดิบ') && !c.is_raw_material);
        if (nonRaw) catId = nonRaw.id;
      }
      setForm(f => ({
        ...f,
        is_raw_material: false,
        category_id: catId,
        selling_price: f.selling_price === '0' ? '' : f.selling_price
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isExistingRawMaterial && productType !== 'raw_material') {
      toast.error('สินค้าประเภทวัตถุดิบถูกล็อก ไม่สามารถเปลี่ยนเป็นสินค้าขาย POS ได้');
      return;
    }
    try {
      const catObj = categories.find(c => c.id === form.category_id);
      const isRawMatCat = catObj && (catObj.name === 'วัตถุดิบ' || catObj.name.includes('วัตถุดิบ'));
      const isFinishedGood = productType === 'finished_goods';
      const isRawMatFinal = productType === 'raw_material' || (!isFinishedGood && Boolean(form.is_raw_material || isRawMatCat));

      const recInfo = editingProduct ? getProductRecipeInfo(editingProduct) : null;
      const effectiveCost = isFinishedGood
        ? (selectedLinkedRecipeId && recipeSummaryMap[selectedLinkedRecipeId]
            ? recipeSummaryMap[selectedLinkedRecipeId].unit_cost
            : (recInfo?.unit_cost ?? (parseFloat(form.cost_price) || 0)))
        : (parseFloat(form.cost_price) || 0);

      const payload = {
        ...form,
        barcode: form.barcode?.trim() || null,
        unit: form.unit || (isRawMatFinal ? 'kg' : 'ชิ้น'),
        net_weight: parseFloat(form.net_weight) || 1,
        is_raw_material: isRawMatFinal ? 1 : 0,
        selling_price: isRawMatFinal ? 0 : parseFloat(form.selling_price) || 0,
        cost_price: effectiveCost,
        reorder_level: form.reorder_level !== '' && !Number.isNaN(Number(form.reorder_level)) ? Number(form.reorder_level) : 5
      };

      let savedProduct;
      if (editingProduct) {
        const res = await api.put(`/products/${editingProduct.id}`, { ...payload, is_active: true });
        savedProduct = res.data?.data;
        toast.success('แก้ไขสินค้าสำเร็จ');
      } else {
        const res = await api.post('/products', payload);
        savedProduct = res.data?.data;
        toast.success('เพิ่มสินค้าสำเร็จ');
      }

      // If finished good and a template recipe was selected, copy recipe items to the new product
      if (isFinishedGood && selectedLinkedRecipeId && savedProduct?.id && selectedLinkedRecipeId !== savedProduct.id) {
        try {
          const recData = await recipesAPI.getByProduct(selectedLinkedRecipeId);
          if (recData.data?.success && recData.data.data?.recipe) {
            const items = recData.data.data.recipe.map(i => ({
              ingredient_id: i.ingredient_id,
              quantity: i.quantity,
              unit: i.unit
            }));
            await recipesAPI.saveRecipe(savedProduct.id, {
              items,
              recipe_name: `สูตร ${savedProduct.name}`,
              recipe_yield: recData.data.data.product?.recipe_yield || 1,
              portion_count: recData.data.data.product?.portion_count || 1,
              portion_unit: form.unit || 'ชิ้น',
              shelf_life_days: recData.data.data.product?.shelf_life_days || 3,
              update_product_cost: true
            });
          }
        } catch (_) {}
      }

      setShowForm(false);
      setEditingProduct(null);
      resetForm();
      loadProducts();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const generateSku = async () => {
    try {
      const res = await api.get('/products/generate-sku');
      return res.data.data.sku;
    } catch { return 'PRD' + Date.now().toString().slice(-6); }
  };

  const resetForm = async () => {
    const sku = await generateSku();
    setPackLocked(false);
    setPackTotalPrice('');
    setProductType('standard');
    setSelectedLinkedRecipeId('');
    setForm({ sku, barcode: '', name: '', description: '', category_id: '',
      cost_price: '', selling_price: '', image_url: '', is_featured: false, is_raw_material: false, unit: 'ชิ้น', net_weight: 1, reorder_level: 5 });
  };

  const editProduct = (product) => {
    if (!canMaintain) {
      toast.error('คุณมีสิทธิ์ดูข้อมูลเท่านั้น ไม่สามารถแก้ไขสินค้าได้');
      return;
    }
    const recInfo = getProductRecipeInfo(product);
    const isRecipeItem = Boolean(recInfo && (recInfo.ingredient_count > 0 || recInfo.unit_cost > 0));
    const isRaw = Boolean(product.is_raw_material || (product.category_name && product.category_name.includes('วัตถุดิบ')));

    let initialType = 'standard';
    if (isRecipeItem) initialType = 'finished_goods';
    else if (isRaw) initialType = 'raw_material';
    setProductType(initialType);
    setSelectedLinkedRecipeId(isRecipeItem ? product.id : '');

    const cost = isRecipeItem
      ? (recInfo.unit_cost ?? product.cost_price)
      : (product.pending_cost_price ?? product.cost_price);
    const netW = product.net_weight ?? 1;
    const normalizedUnit = normalizeUnitKey(product.unit);
    setForm({
      sku: product.sku, barcode: product.barcode || '', name: product.name,
      description: product.description || '', category_id: product.category_id || '',
      cost_price: cost, selling_price: product.selling_price,
      image_url: product.image_url || '', is_featured: Boolean(product.is_featured),
      is_raw_material: isRaw, unit: normalizedUnit, net_weight: netW,
      reorder_level: product.reorder_level ?? 5, is_active: product.is_active,
    });
    setPackTotalPrice(cost && netW > 1 && !isRecipeItem ? (cost * netW).toFixed(2) : '');
    setEditingProduct(product);
    setPackLocked(false);
    setShowForm(true);
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const handleDelete = async () => {
    if (!canMaintain) {
      toast.error('คุณมีสิทธิ์ดูข้อมูลเท่านั้น');
      return;
    }
    try {
      await api.delete(`/products/${deleteConfirm.id}`);
      toast.success(`ลบ "${deleteConfirm.name}" สำเร็จ`);
      setDeleteConfirm(null);
      loadProducts();
    } catch (err) { toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด'); }
  };

  const handleToggleRawMaterial = async (product) => {
    if (!canMaintain) {
      toast.error('คุณมีสิทธิ์ดูข้อมูลเท่านั้น');
      return;
    }
    const isCurrentlyRaw = Boolean(product.is_raw_material === 1 || product.is_raw_material === true || (product.category_name && product.category_name.includes('วัตถุดิบ')));
    if (isCurrentlyRaw) {
      toast.error('สินค้าประเภทวัตถุดิบถูกล็อก ไม่สามารถเปลี่ยนเป็นสินค้าขายหน้าร้าน (POS) ได้');
      return;
    }
    try {
      const rawCat = categories.find(c => c.name === 'วัตถุดิบ' || c.is_raw_material);
      const targetCategoryId = rawCat ? rawCat.id : product.category_id;

      await api.put(`/products/${product.id}`, {
        ...product,
        category_id: targetCategoryId,
        is_raw_material: 1,
        selling_price: 0,
        is_active: true
      });
      toast.success(`เปลี่ยน "${product.name}" เป็นวัตถุดิบสำเร็จ`);
      loadProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
    }
  };

  // Deleted products drawer
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedProducts, setDeletedProducts] = useState([]);
  const [deletedSearch, setDeletedSearch] = useState('');
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(null);

  const loadDeletedProducts = async () => {
    setDeletedLoading(true);
    try {
      const res = await api.get('/products/deleted', { params: { search: deletedSearch || undefined } });
      setDeletedProducts(res.data.data);
    } catch { toast.error('โหลดข้อมูลไม่สำเร็จ'); }
    finally { setDeletedLoading(false); }
  };

  const handleRestore = async () => {
    if (!canMaintain) {
      toast.error('คุณมีสิทธิ์ดูข้อมูลเท่านั้น');
      return;
    }
    try {
      await api.post(`/products/${restoreConfirm.id}/restore`);
      toast.success(`กู้คืน "${restoreConfirm.name}" สำเร็จ`);
      setRestoreConfirm(null);
      loadDeletedProducts();
      loadProducts();
    } catch (err) { toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด'); }
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  );

  const productsPaging = usePagination(filtered, 20, search);

  const editingCurrentCost = editingProduct ? Number(editingProduct.cost_price) || 0 : 0;
  const editingPendingCost = editingProduct && editingProduct.pending_cost_price !== null && editingProduct.pending_cost_price !== undefined && editingProduct.pending_cost_price !== ''
    ? Number(editingProduct.pending_cost_price)
    : null;
  const editingStock = editingProduct ? Number(editingProduct.stock_quantity) || 0 : 0;
  const editingFormCost = form.cost_price === '' ? null : Number(form.cost_price);
  const editingCostWillQueue = Boolean(editingProduct) && editingStock > 0 && editingFormCost !== null && !Number.isNaN(editingFormCost) && editingFormCost !== editingCurrentCost;
  const editingRecipeInfo = editingProduct ? getProductRecipeInfo(editingProduct) : null;
  const isEditingRecipeProduct = Boolean(editingRecipeInfo && (editingRecipeInfo.ingredient_count > 0 || editingRecipeInfo.unit_cost > 0));

  return (
    <div className="p-6 overflow-y-auto h-[calc(100vh-56px)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">📦 จัดการสินค้า</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowDeleted(true); loadDeletedProducts(); }}
            className="btn-ghost !py-2 !px-4 text-sm flex items-center gap-1.5">
            🗑️ สินค้าที่ลบแล้ว
          </button>
          {canMaintain && (
            <button onClick={async () => { await resetForm(); setEditingProduct(null); setShowForm(true); }} className="btn-primary">
              + เพิ่มสินค้า
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="🔍 ค้นหาสินค้า..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field mb-4 max-w-md"
      />

      {/* ตารางสินค้า (Desktop View >= md) */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-3 px-2">SKU</th>
              <th className="py-3 px-2">ชื่อสินค้า</th>
              <th className="py-3 px-2">หมวดหมู่</th>
              <th className="py-3 px-2 text-right">ต้นทุน</th>
              <th className="py-3 px-2 text-right">ราคาขาย</th>
              <th className="py-3 px-2 text-right">จุดสั่งซื้อ</th>
              <th className="py-3 px-2">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {productsPaging.paged.map((product) => {
              const recipeInfo = getProductRecipeInfo(product);
              const isRecipeItem = Boolean(recipeInfo && (recipeInfo.ingredient_count > 0 || recipeInfo.unit_cost > 0));
              const isRaw = Boolean(product.is_raw_material || (product.category_name && product.category_name.includes('วัตถุดิบ')));
              const effectiveCost = isRecipeItem 
                ? (recipeInfo.unit_cost ?? product.cost_price) 
                : product.cost_price;

              return (
                <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-2 text-gray-600 dark:text-slate-400 font-mono text-xs">{product.sku}</td>
                  <td className="py-2 px-2 font-medium text-gray-900 dark:text-slate-100">
                    {!!product.is_featured && <span className="text-yellow-500 mr-1" title="สินค้าแนะนำ">⭐</span>}
                    {product.name}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-0.5">
                      {isRaw ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
                          <span>📦</span>
                          <span>วัตถุดิบ</span>
                        </span>
                      ) : isRecipeItem ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800">
                          <span>🧪</span>
                          <span>สินค้าสำเร็จรูป</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800">
                          <span>🛍️</span>
                          <span>สินค้าทั่วไป</span>
                        </span>
                      )}
                      {product.category_name && !product.category_name.includes('วัตถุดิบ') && (
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium pl-1">
                          {product.category_name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right text-gray-500">
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1">
                        {isRecipeItem && (
                          <span 
                            title={`ต้นทุนคำนวณจากสูตรอาหาร (${recipeInfo.ingredient_count || 1} วัตถุดิบ)`}
                            className="text-[10px] bg-cyan-50 text-cyan-700 font-bold px-1.5 py-0.5 rounded border border-cyan-200 inline-flex items-center gap-0.5"
                          >
                            🧪 ตามสูตร
                          </span>
                        )}
                        <span className="font-semibold text-gray-700">
                          {formatCurrency(effectiveCost)} <span className="text-xs text-gray-400 font-normal">/ {product.unit || 'ชิ้น'}</span>
                        </span>
                      </div>

                        {product.net_weight && product.net_weight > 1 && !isRecipeItem && (
                          <span className="text-[10px] text-indigo-600 font-semibold whitespace-nowrap">
                            (฿{(effectiveCost * product.net_weight).toFixed(2)} / แพ็ค {product.net_weight} {product.unit})
                          </span>
                        )}

                        {product.pending_cost_price !== null && product.pending_cost_price !== undefined && product.pending_cost_price !== product.cost_price && !isRecipeItem && product.stock_quantity > 0 && (() => {
                          const oldRemain = product.stock_quantity - (product.last_receive_qty || 0);
                          return (
                            <span className="text-[10px] text-amber-600 font-medium whitespace-nowrap">
                              คิวถัดไป: {formatCurrency(product.pending_cost_price)} {oldRemain > 0 ? `(เหลืออีก ${oldRemain} ${product.unit || 'ชิ้น'})` : '(มีผลรายการถัดไป)'}
                            </span>
                          );
                        })()}
                      </div>
                  </td>
                <td className="py-2 px-2 text-right font-semibold">
                  {product.is_raw_material ? <span className="text-gray-400 font-normal text-xs">ไม่ขายหน้าร้าน</span> : formatCurrency(product.selling_price)}
                </td>
                <td className="py-2 px-2 text-right font-semibold text-gray-700 dark:text-slate-200">
                  {formatQty(product.reorder_level ?? 5)}
                </td>
                <td className="py-2 px-2">
                  {canMaintain ? (
                    <div className="flex items-center gap-2">
                      {product.is_raw_material ? (
                        <span 
                          title="สินค้าประเภทวัตถุดิบถูกล็อก ไม่สามารถเปลี่ยนเป็นสินค้าขาย POS ได้"
                          className="text-xs px-2 py-1 rounded-lg font-medium bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500 border border-gray-200 dark:border-slate-700 flex items-center gap-1 cursor-not-allowed select-none"
                        >
                          🔒 ล็อกวัตถุดิบ
                        </span>
                      ) : (
                        <button 
                          onClick={() => handleToggleRawMaterial(product)}
                          title="เปลี่ยนเป็นวัตถุดิบ/ส่วนผสม"
                          className="text-xs px-2 py-1 rounded-lg font-medium transition-all flex items-center gap-1 border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        >
                          🧪 เป็นวัตถุดิบ
                        </button>
                      )}
                      <span className="text-gray-200">|</span>
                      <button onClick={() => editProduct(product)} className="text-blue-600 hover:underline text-sm font-medium">
                        แก้ไข
                      </button>
                      <span className="text-gray-200">|</span>
                      <button onClick={() => setDeleteConfirm(product)} className="text-red-500 hover:underline text-sm">
                        ลบ
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">ดูอย่างเดียว</span>
                  )}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>

      {/* การ์ดรายการสินค้า (Mobile / PWA View < md) */}
      <div className="block md:hidden space-y-3">
        {productsPaging.paged.map((product) => {
          const recipeInfo = getProductRecipeInfo(product);
          const isRecipeItem = Boolean(recipeInfo && (recipeInfo.ingredient_count > 0 || recipeInfo.unit_cost > 0));
          const effectiveCost = isRecipeItem 
            ? (recipeInfo.unit_cost ?? product.cost_price) 
            : product.cost_price;
          const isLowStock = product.stock_quantity <= (product.reorder_level || 5);

          return (
            <div
              key={product.id}
              className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3"
            >
              {/* Header: Name, Badges, Selling Price */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!!product.is_featured && <span title="สินค้าแนะนำ">⭐</span>}
                    <h3 className="font-bold text-gray-900 text-base leading-snug break-words">
                      {product.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                      {product.sku}
                    </span>
                    {product.category_name && (
                      <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {product.category_name}
                      </span>
                    )}
                    {product.is_raw_material ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full">
                        📦 วัตถุดิบ
                      </span>
                    ) : isRecipeItem ? (
                      <span className="text-[10px] font-bold text-cyan-800 bg-cyan-100/90 px-2 py-0.5 rounded-full">
                        🧪 สินค้าสำเร็จรูป
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100/90 px-2 py-0.5 rounded-full">
                        🛍️ สินค้าทั่วไป
                      </span>
                    )}
                  </div>
                </div>

                {/* Selling Price / Indicator */}
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    {product.is_raw_material ? 'ประเภท' : 'ราคาขาย'}
                  </div>
                  {product.is_raw_material ? (
                    <span className="inline-block mt-0.5 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg font-medium">
                      ไม่ขายหน้าร้าน
                    </span>
                  ) : (
                    <div className="text-xl font-black text-indigo-600 font-mono leading-tight mt-0.5">
                      {formatCurrency(product.selling_price)}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Grid: Cost & Stock */}
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-gray-50/80 rounded-xl border border-gray-100 text-xs">
                {/* Cost info */}
                <div>
                  <span className="text-gray-400 block text-[11px]">ต้นทุนต่อหน่วย:</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isRecipeItem && (
                      <span className="text-[9px] bg-cyan-100 text-cyan-800 font-bold px-1 rounded">
                        ตามสูตร
                      </span>
                    )}
                    <span className="font-bold text-gray-800">
                      {formatCurrency(effectiveCost)}
                    </span>
                    <span className="text-gray-400 text-[11px]">/ {product.unit || 'ชิ้น'}</span>
                  </div>
                  {product.net_weight && product.net_weight > 1 && !isRecipeItem && (
                    <p className="text-[10px] text-indigo-600 mt-0.5 truncate">
                      ยกแพ็ค ฿{(effectiveCost * product.net_weight).toFixed(2)} ({product.net_weight} {product.unit})
                    </p>
                  )}
                  {product.pending_cost_price !== null && product.pending_cost_price !== undefined && product.pending_cost_price !== product.cost_price && !isRecipeItem && product.stock_quantity > 0 && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      คิวถัดไป: {formatCurrency(product.pending_cost_price)}
                    </p>
                  )}
                </div>

                {/* Reorder Level info */}
                <div className="text-right border-l border-gray-200/60 pl-2">
                  <span className="text-gray-400 block text-[11px]">จุดสั่งซื้อ:</span>
                  <div className="font-mono font-bold text-base mt-0.5 text-gray-800 dark:text-slate-200">
                    {formatQty(product.reorder_level ?? 5)}
                    <span className="text-xs font-normal text-gray-500 ml-1">{product.unit || 'ชิ้น'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              {canMaintain && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {product.is_raw_material ? (
                    <div 
                      title="สินค้าประเภทวัตถุดิบถูกล็อก ไม่สามารถเปลี่ยนเป็นสินค้าขาย POS ได้"
                      className="flex-1 py-2 px-2.5 rounded-xl font-medium text-xs border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 flex items-center justify-center gap-1 cursor-not-allowed select-none"
                    >
                      <span>🔒</span>
                      <span>ล็อกวัตถุดิบ</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleRawMaterial(product)}
                      title="เปลี่ยนเป็นวัตถุดิบ/ส่วนผสม"
                      className="flex-1 py-2 px-2.5 rounded-xl font-bold text-xs border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 active:scale-95 transition-all flex items-center justify-center gap-1"
                    >
                      <span>🧪</span>
                      <span>เปลี่ยนเป็นวัตถุดิบ</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => editProduct(product)}
                    className="py-2 px-3 rounded-xl font-bold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all flex items-center gap-1"
                  >
                    <span>✏️</span>
                    <span>แก้ไข</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(product)}
                    className="py-2 px-3 rounded-xl font-bold text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:scale-95 transition-all flex items-center gap-1"
                  >
                    <span>🗑️</span>
                    <span>ลบ</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 text-center text-gray-400 py-10">
            ไม่พบสินค้า
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="card mt-3">
        <Pagination
          page={productsPaging.page}
          totalPages={productsPaging.totalPages}
          perPage={productsPaging.perPage}
          onPageChange={productsPaging.setPage}
          onPerPageChange={productsPaging.setPerPage}
          rangeStart={productsPaging.rangeStart}
          rangeEnd={productsPaging.rangeEnd}
          total={productsPaging.total}
        />
      </div>

      {/* Modal ฟอร์ม (Add / Edit Product) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden animate-scale-up">
            
            {/* Modal Header (Sticky at top) */}
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">{editingProduct ? '✏️' : '📦'}</span>
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">
                  {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-gray-200/70 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold transition-all active:scale-95"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form id="productForm" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Row 1: SKU & Barcode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1">รหัสสินค้า (SKU)</label>
                  <div className="relative">
                    <input value={form.sku} readOnly
                      className="input-field bg-gray-50 text-gray-500 cursor-not-allowed font-mono pr-10 !py-2 text-sm" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔒</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">สร้างอัตโนมัติ ไม่สามารถแก้ไขได้</p>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1">บาร์โค้ด</label>
                  <div className="flex gap-2">
                    <input 
                      value={form.barcode} 
                      onChange={(e) => setForm(f => ({ ...f, barcode: e.target.value }))}
                      readOnly={!!editingProduct?.barcode}
                      className={"input-field flex-1 !py-2 text-sm " + (editingProduct?.barcode ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "")} 
                      placeholder="กรอก หรือ สแกนบาร์โค้ด" 
                    />
                    {!editingProduct?.barcode && (
                      <button type="button" onClick={() => setShowScanner(true)}
                        title="สแกนบาร์โค้ดด้วยกล้อง"
                        className="flex-shrink-0 w-10 h-10 rounded-xl text-white flex items-center justify-center shadow hover:opacity-90 active:scale-95 transition-all"
                        style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}>
                        <ScanIcon size={20} color="white" strokeWidth={2} />
                      </button>
                    )}
                    {editingProduct?.barcode && (
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200" title="บาร์โค้ดถูกล็อกแล้ว">
                        🔒
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ตัวเลือกประเภทสินค้า (Product Type) */}
              <div>
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>ประเภทสินค้า <span className="text-red-500">*</span></span>
                  {isExistingRawMaterial && (
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      🔒 ล็อกประเภทวัตถุดิบ
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isExistingRawMaterial}
                    onClick={() => handleSelectProductType('standard')}
                    title={isExistingRawMaterial ? "สินค้าประเภทวัตถุดิบถูกล็อก ไม่สามารถเปลี่ยนเป็นสินค้าขาย POS ได้" : "สินค้าทั่วไป (ซื้อมาขายไป)"}
                    className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border text-center transition-all ${
                      isExistingRawMaterial
                        ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-200 dark:bg-slate-800/40 dark:border-slate-700/60 text-gray-400 dark:text-slate-500'
                        : productType === 'standard'
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 shadow-sm ring-2 ring-indigo-500/20 font-bold dark:bg-indigo-950/40 dark:border-indigo-500 dark:text-indigo-200 dark:ring-indigo-500/30'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/80'
                    }`}
                  >
                    <span className="text-xl sm:text-2xl mb-1">🛍️</span>
                    <span className="text-xs font-bold leading-tight">สินค้าทั่วไป</span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-400 mt-0.5 leading-tight hidden sm:block">
                      {isExistingRawMaterial ? '🔒 ล็อก' : 'ซื้อมาขายไป'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isExistingRawMaterial}
                    onClick={() => handleSelectProductType('finished_goods')}
                    title={isExistingRawMaterial ? "สินค้าประเภทวัตถุดิบถูกล็อก ไม่สามารถเปลี่ยนเป็นสินค้าขาย POS ได้" : "สินค้าสำเร็จรูป (คำนวณตามสูตร)"}
                    className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border text-center transition-all ${
                      isExistingRawMaterial
                        ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-200 dark:bg-slate-800/40 dark:border-slate-700/60 text-gray-400 dark:text-slate-500'
                        : productType === 'finished_goods'
                        ? 'border-cyan-600 bg-cyan-50/80 text-cyan-950 shadow-sm ring-2 ring-cyan-500/20 font-bold dark:bg-cyan-950/40 dark:border-cyan-500 dark:text-cyan-200 dark:ring-cyan-500/30'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/80'
                    }`}
                  >
                    <span className="text-xl sm:text-2xl mb-1">🧪</span>
                    <span className="text-xs font-bold leading-tight">สินค้าสำเร็จรูป</span>
                    <span className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-0.5 leading-tight font-medium hidden sm:block">
                      {isExistingRawMaterial ? '🔒 ล็อก' : 'คำนวณตามสูตร'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectProductType('raw_material')}
                    className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border text-center transition-all ${
                      productType === 'raw_material'
                        ? 'border-amber-600 bg-amber-50/80 text-amber-950 shadow-sm ring-2 ring-amber-500/20 font-bold dark:bg-amber-950/40 dark:border-amber-500 dark:text-amber-200 dark:ring-amber-500/30'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/80'
                    }`}
                  >
                    <span className="text-xl sm:text-2xl mb-1">📦</span>
                    <span className="text-xs font-bold leading-tight">วัตถุดิบ</span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 leading-tight hidden sm:block font-medium">
                      {isExistingRawMaterial ? '🔒 ตัดสต๊อก (ล็อก)' : 'ตัดสต๊อก'}
                    </span>
                  </button>
                </div>
                {isExistingRawMaterial && (
                  <div className="mt-2 p-2.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <span className="text-base flex-shrink-0">🔒</span>
                    <p className="leading-snug">
                      สินค้านี้เป็น <b>วัตถุดิบ</b> ระบบล็อกไว้ไม่สามารถเปลี่ยนเป็นสินค้าขายหน้าร้าน (POS) ได้ เพื่อความถูกต้องของคลังและสูตรการผลิต
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1">ชื่อสินค้า*</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field !py-2 text-sm" placeholder="ระบุชื่อสินค้า..." required />
              </div>

              {/* หมวดหมู่, หน่วยนับ, ปริมาณสุทธิ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700">หมวดหมู่*</label>
                    <button
                      type="button"
                      onClick={() => setShowAddCategoryModal(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline flex items-center gap-0.5"
                    >
                      + เพิ่มหมวดหมู่
                    </button>
                  </div>
                  <select
                    value={form.category_id}
                    onChange={(e) => {
                      const selectedCatId = e.target.value;
                      const catObj = categories.find(c => c.id === selectedCatId);
                      const isRawMat = catObj && (catObj.name === 'วัตถุดิบ' || catObj.name.includes('วัตถุดิบ') || catObj.is_raw_material);
                      if (isExistingRawMaterial && !isRawMat && selectedCatId !== '') {
                        toast.error('สินค้าประเภทวัตถุดิบต้องอยู่ในหมวดหมู่วัตถุดิบเท่านั้น');
                        return;
                      }
                      setForm(f => ({
                        ...f,
                        category_id: selectedCatId,
                        is_raw_material: isExistingRawMaterial ? true : (isRawMat ? true : (catObj && !isRawMat ? false : f.is_raw_material)),
                        selling_price: (isExistingRawMaterial || isRawMat) ? '0' : f.selling_price,
                        unit: (isRawMat && !editingProduct && (f.unit === 'ชิ้น' || !f.unit)) ? 'g' : f.unit
                      }));
                    }}
                    className="input-field bg-white !py-2 text-sm font-medium"
                    required
                  >
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {categories.map((c) => {
                      const isCatRaw = Boolean(c.is_raw_material || c.name === 'วัตถุดิบ' || c.name.includes('วัตถุดิบ'));
                      return (
                        <option key={c.id} value={c.id} disabled={isExistingRawMaterial && !isCatRaw}>
                          {c.name}{isExistingRawMaterial && !isCatRaw ? ' (ล็อกเฉพาะวัตถุดิบ)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:col-span-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700">หน่วยนับ</label>
                      <button
                        type="button"
                        onClick={() => setShowAddUnitModal(true)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                      >
                        + เพิ่ม
                      </button>
                    </div>
                    <select
                      value={form.unit || 'ชิ้น'}
                      onChange={(e) => {
                        const selectedUnit = normalizeUnitKey(e.target.value);
                        setForm(f => ({ ...f, unit: selectedUnit }));
                      }}
                      className="input-field bg-white !py-2 text-sm font-medium"
                    >
                      {getAvailableUnits().map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">
                      ปริมาณสุทธิ <span className="text-gray-400 font-normal">({form.unit || 'หน่วย'})</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      value={form.net_weight}
                      onChange={(e) => {
                        const netW = e.target.value;
                        setForm(f => {
                          const updated = { ...f, net_weight: netW };
                          if (packTotalPrice && parseFloat(netW) > 0) {
                            const calc = parseFloat(packTotalPrice) / parseFloat(netW);
                            updated.cost_price = Number(calc.toFixed(4)).toString();
                          }
                          return updated;
                        });
                      }}
                      className="input-field bg-white !py-2 text-sm"
                      placeholder="เช่น 1, 500"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* ส่วนจัดการต้นทุน & ราคารวมแพ็ค */}
              {(isEditingRecipeProduct || productType === 'finished_goods') ? (
                <div className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 dark:bg-gradient-to-br dark:from-cyan-950/40 dark:via-slate-900/90 dark:to-blue-950/30 border border-cyan-200 dark:border-cyan-500/30 rounded-2xl space-y-3 shadow-sm dark:shadow-inner">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="text-2xl mt-0.5">🧪</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-cyan-950 dark:text-cyan-200">สินค้าสำเร็จรูป ผลิตตามสูตรอาหาร (BOM)</h4>
                          <span className="text-[10px] bg-cyan-200 text-cyan-800 dark:bg-cyan-900/80 dark:text-cyan-300 dark:border dark:border-cyan-500/40 font-bold px-2 py-0.5 rounded-full">
                            คำนวณตามสูตร
                          </span>
                        </div>
                        <p className="text-xs text-cyan-700 dark:text-cyan-300/80 mt-1">
                          ต้นทุนจะถูกคำนวณจากวัตถุดิบในสูตรอาหารโดยอัตโนมัติ {isEditingRecipeProduct ? `(${editingRecipeInfo.ingredient_count || 1} ส่วนผสม)` : ''} คุณไม่จำเป็นต้องกรอกหรือดูแลราคาต้นทุนเอง
                        </p>
                      </div>
                    </div>
                  </div>

                  {!editingProduct && (
                    <div className="bg-white/90 dark:bg-slate-800/80 rounded-xl p-3 border border-cyan-200 dark:border-cyan-500/20 space-y-2">
                      <label className="block text-xs font-bold text-cyan-950 dark:text-cyan-200">
                        🔗 เลือกคัดลอกสูตรจากสินค้าอื่น (ไม่บังคับ):
                      </label>
                      <select
                        value={selectedLinkedRecipeId}
                        onChange={(e) => {
                          const recProdId = e.target.value;
                          setSelectedLinkedRecipeId(recProdId);
                          if (recProdId && recipeSummaryMap[recProdId]) {
                            setForm(f => ({
                              ...f,
                              cost_price: recipeSummaryMap[recProdId].unit_cost.toString()
                            }));
                          }
                        }}
                        className="input-field bg-white dark:bg-slate-900 text-xs font-medium dark:text-slate-100 dark:border-slate-700"
                      >
                        <option value="">-- ยังไม่มีสูตร (สร้างสูตรวัตถุดิบทีหลังได้ที่หน้ารายการสูตร) --</option>
                        {Object.values(recipeSummaryMap).map(rec => (
                          <option key={rec.product_id} value={rec.product_id}>
                            {rec.product_name} (ต้นทุน: {formatCurrency(rec.unit_cost)} / {rec.portion_unit || 'หน่วย'})
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-cyan-700 dark:text-cyan-400/80">
                        {selectedLinkedRecipeId
                          ? '✨ ระบบจะคัดลอกส่วนผสมและคำนวณต้นทุนให้อัตโนมัติทันทีที่กดบันทึก'
                          : '💡 บันทึกเสร็จแล้ว สามารถไปกำหนดวัตถุดิบและสัดส่วนที่เมนู "สูตรการผลิต"'}
                      </p>
                    </div>
                  )}

                  <div className="bg-white/90 dark:bg-slate-800/80 rounded-xl p-3 border border-cyan-200 dark:border-cyan-500/20 flex items-center justify-between">
                    <span className="text-xs text-gray-700 dark:text-slate-300 font-medium">ราคาต้นทุนต่อหน่วย (คำนวณจากสูตร):</span>
                    <span className="text-lg font-black text-cyan-700 dark:text-cyan-400 font-mono">
                      {formatCurrency(
                        isEditingRecipeProduct
                          ? (form.cost_price || editingRecipeInfo.unit_cost || 0)
                          : (selectedLinkedRecipeId && recipeSummaryMap[selectedLinkedRecipeId]
                              ? recipeSummaryMap[selectedLinkedRecipeId].unit_cost
                              : (parseFloat(form.cost_price) || 0))
                      )} <span className="text-xs font-normal text-gray-500 dark:text-slate-400">/ {form.unit || 'ชิ้น'}</span>
                    </span>
                  </div>
                  <input
                    type="hidden"
                    name="cost_price"
                    value={
                      isEditingRecipeProduct
                        ? (form.cost_price || editingRecipeInfo.unit_cost || 0)
                        : (selectedLinkedRecipeId && recipeSummaryMap[selectedLinkedRecipeId]
                            ? recipeSummaryMap[selectedLinkedRecipeId].unit_cost
                            : (parseFloat(form.cost_price) || 0))
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/80 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                      ราคารวมยกแพ็ค (บาท) <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400">(คำนวณให้อัตโนมัติ)</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="เช่น 100 (หากซื้อยกแพ็ค)"
                      value={packTotalPrice}
                      onChange={(e) => {
                        const pPrice = e.target.value;
                        setPackTotalPrice(pPrice);
                        const nWeight = parseFloat(form.net_weight) || 1;
                        if (pPrice !== '' && nWeight > 0) {
                          const calcCost = parseFloat(pPrice) / nWeight;
                          setForm(f => ({ ...f, cost_price: Number(calcCost.toFixed(4)).toString() }));
                        }
                      }}
                      disabled={packLocked || !!editingProduct}
                      className={"input-field bg-white dark:bg-slate-900 !py-2 text-sm " + ((packLocked || editingProduct) ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed" : "")}
                    />
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">กรอกราคารวมของทั้งถุง/แพ็ค</p>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                      ราคาต้นทุนต่อหน่วย* <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 font-mono">(บาท / {form.unit || 'ชิ้น'})</span>
                    </label>
                    <div className="relative flex items-center">
                      <input type="number" step="any" value={form.cost_price}
                        onChange={(e) => {
                          const cPrice = e.target.value;
                          setForm(f => ({ ...f, cost_price: cPrice }));
                          const nWeight = parseFloat(form.net_weight) || 1;
                          if (cPrice !== '' && nWeight > 1) {
                            const total = parseFloat(cPrice) * nWeight;
                            setPackTotalPrice(Number(total.toFixed(2)).toString());
                          }
                        }}
                        disabled={packLocked || !!editingProduct}
                        className={"input-field bg-white dark:bg-slate-900 pr-14 !py-2 text-sm " + ((packLocked || editingProduct) ? "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 cursor-not-allowed opacity-100" : "")}
                        style={(packLocked || editingProduct) ? { pointerEvents: 'none' } : {}}
                        required={!(packLocked || editingProduct)} />
                      <span className="absolute right-3 text-xs font-bold text-slate-400 pointer-events-none">
                        / {form.unit || 'ชิ้น'}
                      </span>
                      {(packLocked || editingProduct) && (
                        <>
                          <input type="hidden" name="cost_price" value={form.cost_price} required />
                          <span className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔒</span>
                        </>
                      )}
                    </div>
                    {editingProduct ? (
                      <div className="mt-1 text-xs text-gray-500 space-y-1">
                        <p className="text-gray-400">🔒 ต้นทุนจัดซื้อควบคุมผ่านระบบสต๊อก</p>
                        <p>
                          ล็อกที่ <span className="font-semibold text-gray-700">{formatCurrency(editingCurrentCost)} / {form.unit || 'ชิ้น'}</span>
                          {editingPendingCost !== null && editingStock > 0 && (
                            <>
                              . ต้นทุนใหม่รอดำเนินการ: <span className="text-sky-600 font-semibold">{formatCurrency(editingPendingCost)}</span> เมื่อสต๊อกเหลือ 0
                            </>
                          )}
                        </p>
                      </div>
                    ) : (
                      editingCostWillQueue && (
                        <p className="mt-1 text-xs text-amber-600">ต้นทุนใหม่จะรอดำเนินการจนกว่าสต๊อกปัจจุบันจะหมด</p>
                      )
                    )}
                  </div>

                  {/* Banner สรุปราคาต้นทุนต่อหน่วยอัตโนมัติ */}
                  {Boolean(form.cost_price && parseFloat(form.cost_price) > 0) && (
                    <div className="col-span-1 sm:col-span-2 p-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl space-y-1">
                      <div className="flex justify-between items-center text-xs text-indigo-950">
                        <span className="font-bold">🏷️ ต้นทุนคำนวณต่อ 1 {form.unit || 'หน่วย'}:</span>
                        <span className="text-sm font-black text-indigo-700 font-mono">
                          {formatCurrency(form.cost_price)} / {form.unit || 'หน่วย'}
                        </span>
                      </div>
                      {parseFloat(form.net_weight) > 1 && (
                        <div className="text-[11px] text-indigo-600 font-medium text-right">
                          (จากราคารวมยกแพ็ค {formatCurrency(packTotalPrice || (parseFloat(form.cost_price) * parseFloat(form.net_weight)))} บรรจุ {form.net_weight} {form.unit})
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1">
                    ราคาขาย{form.is_raw_material ? ' (ไม่ต้องระบุสำหรับวัตถุดิบ)' : ' (บาท)*'}
                  </label>
                  <input type="number" step="any" value={form.is_raw_material ? '0' : form.selling_price}
                    onChange={(e) => setForm(f => ({ ...f, selling_price: e.target.value }))}
                    disabled={form.is_raw_material}
                    className={"input-field !py-2 text-sm " + (form.is_raw_material ? "bg-gray-100 text-gray-400 cursor-not-allowed opacity-80" : "")}
                    placeholder={form.is_raw_material ? "0 (วัตถุดิบไม่ขายหน้าร้าน)" : "ระบุราคาขาย..."}
                    required={!form.is_raw_material} />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1">
                    จุดสั่งซื้อ ({form.unit || 'หน่วย'})
                  </label>
                  <input type="number" step="any" min="0" value={form.reorder_level ?? ''}
                    onChange={(e) => setForm(f => ({ ...f, reorder_level: e.target.value }))}
                    className="input-field !py-2 text-sm"
                    placeholder="เช่น 5" />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" checked={form.is_featured}
                  onChange={(e) => setForm(f => ({ ...f, is_featured: e.target.checked }))}
                  id="featured" className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="featured" className="text-xs sm:text-sm text-gray-700 font-medium cursor-pointer">
                  ⭐ สินค้าแนะนำ (แสดงแท็บแรกในหน้าขาย POS)
                </label>
              </div>
            </form>

            {/* Modal Footer (Sticky at bottom) */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/90 flex gap-3 flex-shrink-0">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1 py-2.5 text-sm">
                ยกเลิก
              </button>
              <button type="submit" form="productForm" className="btn-primary flex-1 py-2.5 text-sm">
                {editingProduct ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal เพิ่มหมวดหมู่ใหม่ */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">🏷️ เพิ่มหมวดหมู่สินค้าใหม่</h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ชื่อหมวดหมู่ *</label>
                <input
                  type="text"
                  placeholder="เช่น เบเกอรี่, ชาเขียว, กาแฟ, วัตถุดิบ"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                  required
                />
              </div>
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={newCategoryIsRaw}
                    onChange={(e) => setNewCategoryIsRaw(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>🌾 เป็นหมวดหมู่วัตถุดิบ (Raw Material Category)</span>
                </label>
                <p className="text-[11px] text-amber-700 pl-6 leading-tight">
                  สินค้าในหมวดนี้จะล็อกราคาขายเป็น ฿0 อัตโนมัติ (ไม่ต้องตั้งราคาขาย) สำหรับนำไปตัดสต๊อกและคำนวณสูตร
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-md shadow-indigo-100"
                >
                  {savingCategory ? 'กำลังบันทึก...' : 'บันทึกหมวดหมู่'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal เพิ่มหน่วยนับใหม่ */}
      {showAddUnitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">📏 เพิ่มหน่วยนับใหม่</h3>
              <button
                type="button"
                onClick={() => setShowAddUnitModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateUnit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ชื่อหน่วยนับ (ภาษาไทย/อังกฤษ) *</label>
                <input
                  type="text"
                  placeholder="เช่น ถัง, ปอนด์, ถาด, กะละมัง, cc"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ตัวย่อ/สัญลักษณ์ภาษาอังกฤษ (ถ้ามี)</label>
                <input
                  type="text"
                  placeholder="เช่น bucket, lb, tray, cc"
                  value={newUnitSymbol}
                  onChange={(e) => setNewUnitSymbol(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUnitModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-indigo-100"
                >
                  บันทึกหน่วยนับ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onDetected={(barcode) => {
            setForm(f => ({ ...f, barcode }));
            setShowScanner(false);
            toast.success(`สแกนได้: ${barcode}`);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <p className="font-bold text-gray-800 text-lg mb-1">ลบสินค้า?</p>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-semibold text-gray-700">"{deleteConfirm.name}"</span>
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-5">
              ⚠️ สินค้าจะถูกซ่อนจากระบบ แต่ประวัติการขายจะยังคงอยู่
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost flex-1">ยกเลิก</button>
              <button onClick={handleDelete}
                className="flex-1 py-3 rounded-xl text-white font-bold shadow hover:opacity-90 transition-all"
                style={{ backgroundImage: 'linear-gradient(to left,#EB0000,#95008A)' }}>
                🗑️ ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deleted Products Drawer */}
      {showDeleted && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-end z-50">
          <div className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
              style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}>
              <h2 className="text-lg font-bold text-white">🗑️ สินค้าที่ถูกลบ</h2>
              <button onClick={() => setShowDeleted(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">✕</button>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-gray-100">
              <div className="flex gap-2">
                <input type="text" placeholder="🔍 ค้นหาชื่อสินค้า / SKU"
                  value={deletedSearch} onChange={e => setDeletedSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadDeletedProducts()}
                  className="input-field flex-1" />
                <button onClick={loadDeletedProducts} className="btn-ghost !py-2 !px-4 text-sm">ค้นหา</button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {deletedLoading ? (
                <p className="text-center text-gray-400 py-16">⏳ กำลังโหลด...</p>
              ) : deletedProducts.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-gray-500 font-medium">ไม่มีสินค้าที่ถูกลบ</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deletedProducts.map(p => (
                    <div key={p.id} className="border border-red-100 bg-red-50/40 rounded-2xl px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-gray-400">{p.sku}</span>
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">ถูกลบ</span>
                        </div>
                        <p className="font-semibold text-gray-800">{p.name}</p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-400">
                          <span>หมวด: {p.category_name || '—'}</span>
                          <span>ต้นทุน: ฿{p.cost_price}</span>
                          <span>ราคาขาย: ฿{p.selling_price}</span>
                          <span>สต๊อก: {formatQty(p.stock_quantity)}</span>
                        </div>
                        <p className="text-xs text-gray-300 mt-0.5">ลบเมื่อ: {p.updated_at?.slice(0,16)}</p>
                      </div>
                      <button onClick={() => setRestoreConfirm(p)}
                        className="flex-shrink-0 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 active:scale-95 transition-all"
                        style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}>
                        ♻️ กู้คืน
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 text-xs text-gray-400 text-center">
              สินค้าที่ถูกลบจะยังคงข้อมูลประวัติการขายไว้
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirm Modal */}
      {restoreConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center">
            <p className="text-4xl mb-3">♻️</p>
            <p className="font-bold text-gray-800 text-lg mb-1">กู้คืนสินค้า?</p>
            <p className="text-sm text-gray-600 mb-5">
              <span className="font-semibold">"{restoreConfirm.name}"</span> จะกลับมาแสดงในระบบและหน้าขาย
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRestoreConfirm(null)} className="btn-ghost flex-1">ยกเลิก</button>
              <button onClick={handleRestore}
                className="flex-1 py-3 rounded-xl text-white font-bold shadow hover:opacity-90 transition-all"
                style={{ backgroundImage: 'linear-gradient(to left,#3300FC,#95008A,#EB0000)' }}>
                ♻️ ยืนยันกู้คืน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
