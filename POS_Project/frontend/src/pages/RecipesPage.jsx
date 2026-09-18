import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { formatQty, exportToExcel, EXCEL_COLUMNS } from '../utils/format';
import { 
  BeakerIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  ArrowPathIcon, 
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  ShoppingBagIcon,
  ScaleIcon
} from '@heroicons/react/24/outline';
import api, { ingredientsAPI, recipesAPI } from '../services/api';
import WeightUnitCalculator from '../components/WeightUnitCalculator';
import Pagination from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';
import { useAuth } from '../contexts/AuthContext';
import { canMaintainModule } from '../utils/permissions';

const UNITS = [
  { label: 'กรัม (g)', value: 'g' },
  { label: 'กิโลกรัม (kg)', value: 'kg' },
  { label: 'มิลลิลิตร (ml)', value: 'ml' },
  { label: 'ลิตร (L)', value: 'L' },
  { label: 'ชิ้น (pcs)', value: 'pcs' },
  { label: 'ออนซ์ (oz)', value: 'oz' },
  { label: 'แผ่น (sheet)', value: 'sheet' },
  { label: 'ถุง (bag)', value: 'bag' },
];

function getAvailableUnits(currentUnit) {
  const map = new Map();
  UNITS.forEach(u => map.set(u.value, u));
  try {
    const saved = localStorage.getItem('pos_custom_units');
    if (saved) {
      JSON.parse(saved).forEach(u => {
        if (!map.has(u.value)) map.set(u.value, u);
      });
    }
  } catch {}
  if (currentUnit && !map.has(currentUnit)) {
    map.set(currentUnit, { value: currentUnit, label: currentUnit });
  }
  return Array.from(map.values());
}

function getUnitFamily(unitStr) {
  if (!unitStr) return 'count';
  const u = String(unitStr).trim().toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล', 'g', 'กรัม', 'ก.', 'mg', 'มิลลิกรัม', 'oz', 'ออนซ์', 'lb', 'ปอนด์'].includes(u)) {
    return 'weight';
  }
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล', 'l', 'ลิตร'].includes(u)) {
    return 'volume';
  }
  return 'count';
}

function getUnitFactor(unitStr) {
  if (!unitStr) return 1;
  const u = String(unitStr).trim().toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล'].includes(u)) return 1000;
  if (['g', 'กรัม', 'ก.'].includes(u)) return 1;
  if (['mg', 'มิลลิกรัม'].includes(u)) return 0.001;
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล'].includes(u)) return 1;
  if (['l', 'ลิตร'].includes(u)) return 1000;
  if (['oz', 'ออนซ์'].includes(u)) return 28.3495;
  if (['lb', 'ปอนด์'].includes(u)) return 453.592;
  return 1;
}

function convertQuantity(qty, fromUnit, toUnit) {
  const numQty = parseFloat(qty) || 0;
  if (numQty === 0) return 0;
  const fromFamily = getUnitFamily(fromUnit);
  const toFamily = getUnitFamily(toUnit);
  if (fromFamily !== toFamily || fromFamily === 'count') {
    return numQty;
  }
  const fromFactor = getUnitFactor(fromUnit);
  const toFactor = getUnitFactor(toUnit);
  if (fromFactor === toFactor) return numQty;
  return numQty * (fromFactor / toFactor);
}

function getCompatibleUnits(baseUnit, currentItemUnit) {
  const family = getUnitFamily(baseUnit);
  const allUnits = getAvailableUnits(currentItemUnit || baseUnit);

  const filtered = allUnits.filter(u => {
    const uFamily = getUnitFamily(u.value);
    if (family === 'weight') return uFamily === 'weight';
    if (family === 'volume') return uFamily === 'volume';
    return uFamily === 'count' || u.value === baseUnit;
  });

  if (baseUnit && !filtered.some(u => u.value === baseUnit)) {
    filtered.unshift({ value: baseUnit, label: baseUnit });
  }
  if (currentItemUnit && !filtered.some(u => u.value === currentItemUnit)) {
    filtered.push({ value: currentItemUnit, label: currentItemUnit });
  }

  return filtered;
}

function isCorruptedRecipeName(name) {
  if (!name) return true;
  const trimmed = String(name).trim();
  return !trimmed || /^\?+/.test(trimmed) || trimmed.includes('????');
}

function getValidRecipeName(recipeName, fallbackProductName) {
  return isCorruptedRecipeName(recipeName) ? (fallbackProductName || '') : String(recipeName).trim();
}

function isDeductOn(v) {
  return v === 1 || v === true || v === '1';
}

export default function RecipesPage() {
  const { user } = useAuth();
  const canMaintain = canMaintainModule(user, 'recipes');
  // Persist active tab across refresh (was resetting to first tab)
  const VALID_TABS = ['ingredients', 'master_recipes', 'recipes', 'work_orders'];
  const [activeTab, setActiveTabState] = useState(() => {
    try {
      const saved = localStorage.getItem('recipes_active_tab');
      if (saved && VALID_TABS.includes(saved)) return saved;
    } catch {}
    return 'ingredients';
  });
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    try { localStorage.setItem('recipes_active_tab', tab); } catch {}
  };
  
  // Ingredients state
  const [ingredients, setIngredients] = useState([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [ingredientForm, setIngredientForm] = useState({
    sku: '',
    name: '',
    unit: 'g',
    cost_per_unit: 0,
    quantity: 0,
    reorder_level: 0,
  });

  // Stock Adjustment modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingIngredient, setAdjustingIngredient] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    quantity_change: 0,
    type: 'receive', // 'receive' | 'issue' | 'adjust'
    remark: '',
  });

  // Recipes state
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [recipeItems, setRecipeItems] = useState([]);
  const [recipeName, setRecipeName] = useState('');
  const [recipeYield, setRecipeYield] = useState(1);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [yieldUnit, setYieldUnit] = useState('L');
  const [portionCount, setPortionCount] = useState(1);
  const [portionUnit, setPortionUnit] = useState('แก้ว');
  const [shelfLifeDays, setShelfLifeDays] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  // Opt-in Recipe Deduction on POS sale (per product checkbox)
  const [deductOnSale, setDeductOnSale] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [recipeSummary, setRecipeSummary] = useState([]);
  const [targetMappedProductIds, setTargetMappedProductIds] = useState([]);
  const [newSaleProductName, setNewSaleProductName] = useState('');
  const [mappingSearch, setMappingSearch] = useState('');
  const [creatingSaleProduct, setCreatingSaleProduct] = useState(false);

  // Recipe load generations: guards against out-of-order responses when
  // products are clicked in rapid succession (stale response must never
  // overwrite a newer selection), and tracks whether the visible editor
  // state has been confirmed against server truth.
  const recipeLoadSeq = useRef(0);
  const [recipeLoadedId, setRecipeLoadedId] = useState(null);
  const [productionModal, setProductionModal] = useState({
    show: false,
    recipe: null,
    batchCount: 1,
    loadingItems: false,
    items: []
  });
  const [submittingProduction, setSubmittingProduction] = useState(false);
  const [batchQuantities, setBatchQuantities] = useState({});

  // Work Orders (WO) State - Default date range: 1st day of current month to current day
  const getCurrentMonthRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return {
      start: `${year}-${month}-01`,
      end: `${year}-${month}-${day}`
    };
  };

  const [workOrders, setWorkOrders] = useState([]);
  const [woStartDate, setWoStartDate] = useState(() => getCurrentMonthRange().start);
  const [woEndDate, setWoEndDate] = useState(() => getCurrentMonthRange().end);
  const [woSortField, setWoSortField] = useState('created_at');
  const [woSortOrder, setWoSortOrder] = useState('desc');
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [workOrderSearch, setWorkOrderSearch] = useState('');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [loadingWorkOrderDetail, setLoadingWorkOrderDetail] = useState(false);

  const handleWoSort = (field) => {
    if (woSortField === field) {
      setWoSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setWoSortField(field);
      setWoSortOrder('asc');
    }
  };

  const filteredWorkOrders = useMemo(() => {
    if (!workOrders || workOrders.length === 0) return [];
    return workOrders.filter(wo => {
      if (!wo.created_at) return true;
      const woDate = wo.created_at.slice(0, 10);
      if (woStartDate && woDate < woStartDate) return false;
      if (woEndDate && woDate > woEndDate) return false;
      return true;
    });
  }, [workOrders, woStartDate, woEndDate]);

  const sortedWorkOrders = useMemo(() => {
    if (!filteredWorkOrders || filteredWorkOrders.length === 0) return [];
    return [...filteredWorkOrders].sort((a, b) => {
      let aVal = a[woSortField];
      let bVal = b[woSortField];

      if (woSortField === 'user_name') {
        aVal = a.user_name || a.user_full_name || '';
        bVal = b.user_name || b.user_full_name || '';
      }

      if (['batch_count', 'produced_yield', 'total_cost'].includes(woSortField)) {
        const numA = parseFloat(aVal) || 0;
        const numB = parseFloat(bVal) || 0;
        return woSortOrder === 'asc' ? numA - numB : numB - numA;
      }

      if (woSortField === 'created_at') {
        const timeA = new Date(aVal).getTime() || 0;
        const timeB = new Date(bVal).getTime() || 0;
        return woSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }

      const strA = String(aVal || '').toLowerCase();
      const strB = String(bVal || '').toLowerCase();
      if (strA < strB) return woSortOrder === 'asc' ? -1 : 1;
      if (strA > strB) return woSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredWorkOrders, woSortField, woSortOrder]);

  const fetchWorkOrders = async (searchQuery = workOrderSearch, start = woStartDate, end = woEndDate) => {
    try {
      setLoadingWorkOrders(true);
      let url = `/recipes/work-orders?search=${encodeURIComponent(searchQuery || '')}`;
      if (start) url += `&startDate=${encodeURIComponent(start)}`;
      if (end) url += `&endDate=${encodeURIComponent(end)}`;
      const res = await api.get(url);
      if (res.data.success) {
        setWorkOrders(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch Work Orders', err);
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  const [exportingWOExcel, setExportingWOExcel] = useState(false);

  const handleExportWorkOrdersExcel = async () => {
    setExportingWOExcel(true);
    const toastId = toast.loading('กำลังดึงข้อมูลใบสั่งผลิตและสร้างไฟล์ Excel (WO Items)...');
    try {
      const params = {
        type: 'wo',
        startDate: woStartDate || undefined,
        endDate: woEndDate || undefined
      };
      const res = await api.get('/reports/export-items', { params });
      const woData = res.data?.data?.wo || [];

      if (woData.length === 0) {
        toast.error('ไม่พบข้อมูลใบสั่งผลิตที่จะส่งออกในช่วงเวลาที่เลือก', { id: toastId });
        return;
      }

      const dateSuffix = `${woStartDate || 'all'}_to_${woEndDate || 'all'}`;
      const filename = `WO_Items_${dateSuffix}.xlsx`;

      await exportToExcel({
        filename,
        sheets: [
          {
            sheetName: 'ใบสั่งผลิต (WO Items)',
            data: woData,
            columns: EXCEL_COLUMNS.WO_ITEMS
          }
        ]
      });

      toast.success(`ดาวน์โหลดไฟล์ Excel (${filename}) สำเร็จ! 🎉`, { id: toastId });
    } catch (err) {
      console.error('Export WO Excel error:', err);
      toast.error(err.response?.data?.message || err.message || 'ส่งออกไฟล์ Excel ไม่สำเร็จ', { id: toastId });
    } finally {
      setExportingWOExcel(false);
    }
  };

  const hasPendingWO = useMemo(() => 
    (workOrders || []).some(wo => wo.status === 'รออนุมัติ' || wo.status === 'pending_approval'),
    [workOrders]
  );

  useEffect(() => {
    if (!hasPendingWO) return;
    const interval = setInterval(() => {
      fetchWorkOrders(workOrderSearch, woStartDate, woEndDate);
    }, 3000);
    return () => clearInterval(interval);
  }, [hasPendingWO, workOrderSearch, woStartDate, woEndDate]);

  const [cancelingWorkOrder, setCancelingWorkOrder] = useState(false);

  const handleCancelWorkOrder = async (wo) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์ยกเลิกใบสั่งผลิต (ดูข้อมูลเท่านั้น)');
      return;
    }

    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการยกเลิกใบสั่งผลิต ${wo.wo_number} (${wo.product_name})?\n\n* ระบบจะตรวจสอบว่าสินค้าล็อตนี้ยังไม่มียอดขาย และจะทำการหักคืนสต็อกสินค้าสำเร็จรูปพร้อมทั้งคืนวัตถุดิบทั้งหมดกลับเข้าคลัง`)) {
      return;
    }

    try {
      setCancelingWorkOrder(true);
      const res = await recipesAPI.cancelWorkOrder(wo.id, { reason: 'ผู้ใช้ยกเลิกใบสั่งผลิต' });
      if (res.data?.success) {
        if (res.data?.requires_approval) {
          toast.success(`ส่งคำขออนุมัติยกเลิกใบสั่งผลิต #${wo.wo_number} ไปยัง LINE เรียบร้อยแล้ว กำลังรอผู้จัดการอนุมัติ 💬 (หน้าต่างจะปิดใน 3 วินาที)`, { duration: 4000 });
          // Auto close and refresh list after 3s
          setTimeout(() => {
            setSelectedWorkOrder(null);
            setCancelingWorkOrder(false);
            fetchWorkOrders(workOrderSearch, woStartDate, woEndDate);
          }, 3000);

          const approvalId = res.data?.data?.id;
          if (approvalId) {
            const pollInterval = setInterval(async () => {
              try {
                const checkRes = await api.get(`/approvals/${approvalId}`);
                const status = checkRes.data?.data?.status;
                if (status === 'APPROVED') {
                  clearInterval(pollInterval);
                  toast.success(`ผู้จัดการอนุมัติการยกเลิกใบสั่งผลิต #${wo.wo_number} แล้ว! 🎉`);
                  fetchWorkOrders(workOrderSearch, woStartDate, woEndDate);
                  fetchProductsAndCategories();
                  fetchIngredients();
                } else if (status === 'REJECTED') {
                  clearInterval(pollInterval);
                  toast.error(`คำขอยกเลิกใบสั่งผลิต #${wo.wo_number} ถูกปฏิเสธ ❌`);
                  fetchWorkOrders(workOrderSearch, woStartDate, woEndDate);
                }
              } catch (_) {}
            }, 3000);
          }
        } else {
          toast.success(res.data.message || `ยกเลิกใบสั่งผลิต ${wo.wo_number} สำเร็จ`);
          setSelectedWorkOrder(null);
          fetchWorkOrders(workOrderSearch, woStartDate, woEndDate);
          fetchProductsAndCategories();
          fetchIngredients();
        }
      }
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.response?.data?.message || 'ไม่สามารถยกเลิกใบสั่งผลิตได้';
      toast.error(errMsg, { duration: 6000 });
    } finally {
      setCancelingWorkOrder(false);
    }
  };

  const handleOpenWorkOrderDetail = async (wo) => {
    try {
      setLoadingWorkOrderDetail(true);
      setSelectedWorkOrder({ ...wo, items: [] });
      const res = await api.get(`/recipes/work-orders/${wo.id}`);
      if (res.data.success) {
        setSelectedWorkOrder(res.data.data);
      }
    } catch (err) {
      toast.error('ไม่สามารถดึงข้อมูลรายละเอียด Work Order ได้');
    } finally {
      setLoadingWorkOrderDetail(false);
    }
  };

  const handleOpenProductionModal = async (recipe, batchCount = 1) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์สั่งผลิตสินค้า (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (recipe.is_locked || recipe.pending_adjust_id || recipe.recipe_pending_adjust_id) {
      toast.error(`สูตรการผลิต "${recipe.product_name || recipe.recipe_name}" หรือวัตถุดิบในสูตร มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE ไม่สามารถสร้างใบสั่งผลิต (WO) ได้ขณะนี้`);
      return;
    }
    setProductionModal({
      show: true,
      recipe,
      batchCount: Math.max(1, parseInt(batchCount) || 1),
      loadingItems: true,
      items: []
    });

    try {
      const res = await recipesAPI.getByProduct(recipe.product_id);
      if (res.data.success) {
        const recipeItems = res.data.data.recipe || [];
        const lockedIng = recipeItems.find(i => i.pending_adjust_id);
        if (lockedIng) {
          toast.error(`วัตถุดิบ "${lockedIng.ingredient_name}" ในสูตรนี้ มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE ไม่สามารถสร้างใบสั่งผลิต (WO) ได้`);
          setProductionModal({ show: false, recipe: null, batchCount: 1, loadingItems: false, items: [] });
          return;
        }
        setProductionModal(prev => ({
          ...prev,
          loadingItems: false,
          items: recipeItems
        }));
      }
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลส่วนผสมสูตรได้');
      setProductionModal(prev => ({ ...prev, loadingItems: false }));
    }
  };

  const handleConfirmProduction = async () => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์สั่งผลิตสินค้า (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (!productionModal.recipe) return;
    try {
      setSubmittingProduction(true);
      const res = await api.post('/recipes/produce', {
        product_id: productionModal.recipe.product_id,
        batch_count: productionModal.batchCount
      });

      if (res.data.success) {
        const expiryDate = res.data.data?.expiry_date;
        const baseMsg = res.data.message || 'ผลิตและอัปเดตสต็อกเรียบร้อยแล้ว';
        if (expiryDate) {
          const expText = new Date(expiryDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
          toast.success(`${baseMsg}\nวันหมดอายุของล็อตนี้: ${expText}`, { duration: 5000 });
        } else {
          toast.success(baseMsg);
        }
        setProductionModal({ show: false, recipe: null, batchCount: 1, loadingItems: false, items: [] });
        fetchIngredients();
        fetchProductsAndCategories();
        fetchRecipeSummary();
        fetchWorkOrders();
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาดในการผลิตและอัปเดตสต็อก');
    } finally {
      setSubmittingProduction(false);
    }
  };

  // Merge ingredients stock and products so any product or sub-recipe can be selected as a recipe component
  const allAvailableIngredients = useMemo(() => {
    const map = new Map();
    const prodMap = new Map((products || []).map(p => [p.id, p]));

    (ingredients || []).forEach(ing => {
      const p = prodMap.get(ing.id);
      const isSubRecipe = p 
        ? (p.sku?.startsWith('REC') || p.recipe_name || (p.selling_price && parseFloat(p.selling_price) > 0) || p.is_raw_material === 0) 
        : (ing.sku?.startsWith('REC'));
      map.set(ing.id, {
        ...ing,
        is_sub_recipe: isSubRecipe,
        is_product: !!p
      });
    });

    (products || []).forEach(prod => {
      if (selectedProduct && prod.id === selectedProduct.id) return;
      if (!map.has(prod.id)) {
        const isSubRecipe = prod.sku?.startsWith('REC') || prod.recipe_name || (prod.selling_price && parseFloat(prod.selling_price) > 0);
        map.set(prod.id, {
          id: prod.id,
          sku: prod.sku || '',
          name: prod.name,
          unit: prod.unit || 'ชิ้น',
          cost_per_unit: parseFloat(prod.cost_price) || 0,
          quantity: 999,
          reorder_level: 0,
          is_product: true,
          is_sub_recipe: isSubRecipe
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [ingredients, products, selectedProduct]);

  // Master Recipe Modal State
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [masterRecipeSearch, setMasterRecipeSearch] = useState('');
  const [masterForm, setMasterForm] = useState({
    name: '',
    category: 'สูตรกลาง',
    recipe_yield: 1,
    yield_unit: 'L',
    portion_count: 1,
    portion_unit: 'ถุง',
    selling_price: 0,
    description: '',
    items: [],
    target_product_ids: []
  });

  const handleOpenMasterModal = (presetName = '') => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์จัดการสูตรอาหาร (ดูข้อมูลเท่านั้น)');
      return;
    }
    const defaultIng = allAvailableIngredients[0];
    setMasterForm({
      name: presetName,
      category: 'สูตรกลาง',
      recipe_yield: 1,
      yield_unit: 'L',
      portion_count: 1,
      portion_unit: 'ถุง',
      selling_price: 0,
      description: '',
      deduct_recipe_on_sale: 0,
      items: defaultIng ? [{
        ingredient_id: defaultIng.id,
        quantity: 1,
        unit: defaultIng.unit || 'g'
      }] : []
    });
    setShowMasterModal(true);
  };

  const handleAddMasterItem = () => {
    if (!canMaintain) return;
    if (allAvailableIngredients.length === 0) return;
    const defaultIng = allAvailableIngredients[0];
    setMasterForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          ingredient_id: defaultIng.id,
          quantity: 1,
          unit: defaultIng.unit || 'g'
        }
      ]
    }));
  };

  const handleMasterItemChange = (idx, field, val) => {
    if (!canMaintain) return;
    const updated = [...masterForm.items];
    updated[idx] = { ...updated[idx], [field]: val };
    if (field === 'ingredient_id') {
      const match = allAvailableIngredients.find(i => i.id === val);
      if (match) updated[idx].unit = match.unit || 'g';
    }
    setMasterForm(prev => ({ ...prev, items: updated }));
  };

  const handleRemoveMasterItem = (idx) => {
    if (!canMaintain) return;
    setMasterForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const handleSaveMasterRecipe = async (e) => {
    if (e) e.preventDefault();
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์จัดการสูตรอาหาร (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (!masterForm.name.trim()) return toast.error('กรุณาระบุชื่อสูตรอาหาร');
    if (masterForm.items.length === 0) return toast.error('กรุณาเพิ่มส่วนผสมอย่างน้อย 1 รายการ');

    try {
      setSavingRecipe(true);

      const res = await recipesAPI.createMasterRecipe({
        ...masterForm,
        recipe_yield: parseFloat(masterForm.recipe_yield) || 1,
        portion_count: parseFloat(masterForm.portion_count) || 1,
        selling_price: parseFloat(masterForm.selling_price) || 0
      });
      if (res.data.success) {
        toast.success(res.data.message || 'สร้างสูตรอาหารเรียบร้อย');
        setShowMasterModal(false);
        fetchProductsAndCategories();
        fetchRecipeSummary();
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'ไม่สามารถสร้างสูตรอาหารได้');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleDeleteMasterRecipe = async (id, name) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์จัดการสูตรอาหาร (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (!window.confirm(`คุณต้องการลบสูตรอาหาร "${name}" หรือไม่?`)) return;
    try {
      await recipesAPI.deleteMasterRecipe(id);
      toast.success('ลบสูตรอาหารสำเร็จ');
      fetchProductsAndCategories();
      fetchRecipeSummary();
    } catch (err) {
      toast.error('ไม่สามารถลบสูตรอาหารได้');
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchIngredients();
    fetchProductsAndCategories();
    fetchRecipeSummary();
    fetchWorkOrders();
  }, []);

  const fetchIngredients = async () => {
    try {
      setLoadingIngredients(true);
      const res = await ingredientsAPI.getAll(ingredientSearch);
      if (res.data.success) {
        setIngredients(res.data.data);
      }
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลวัตถุดิบได้');
    } finally {
      setLoadingIngredients(false);
    }
  };

  const fetchProductsAndCategories = async () => {
    try {
      const [resProd, resCat] = await Promise.all([
        api.get('/products?limit=500'),
        api.get('/categories')
      ]);
      if (resProd.data.success) setProducts(resProd.data.data);
      if (resCat.data.success) setCategories(resCat.data.data);
      return resProd.data.success ? resProd.data.data : [];
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลสินค้าได้');
      return [];
    }
  };

  const fetchRecipeSummary = async () => {
    try {
      const [resSummary, resProd] = await Promise.all([
        recipesAPI.getSummary(),
        api.get('/products?limit=500')
      ]);

      const summaryList = resSummary.data?.success && Array.isArray(resSummary.data.data) 
        ? [...resSummary.data.data] 
        : [];
      const prodList = resProd.data?.success && Array.isArray(resProd.data.data) 
        ? resProd.data.data 
        : [];

      // Find any Master Recipe / BOM product that might be omitted by backend raw material filter
      const existingIds = new Set(summaryList.map(r => r.product_id));
      const missingMasterRecipes = prodList.filter(p => 
        !existingIds.has(p.id) && (
          (p.sku && p.sku.startsWith('REC')) ||
          (p.recipe_name && p.recipe_name.trim() !== '' && !isCorruptedRecipeName(p.recipe_name)) ||
          (parseFloat(p.recipe_yield) > 1)
        )
      );

      if (missingMasterRecipes.length > 0) {
        const enriched = await Promise.all(
          missingMasterRecipes.map(async (p) => {
            try {
              const recRes = await recipesAPI.getByProduct(p.id);
              if (recRes.data?.success && recRes.data.data) {
                const recData = recRes.data.data;
                const items = recData.recipe || [];
                return {
                  product_id: p.id,
                  product_name: p.name,
                  recipe_name: getValidRecipeName(p.recipe_name, `สูตร ${p.name}`),
                  recipe_yield: parseFloat(p.recipe_yield) || 1,
                  portion_count: parseFloat(p.portion_count) || parseFloat(p.recipe_yield) || 1,
                  portion_unit: p.portion_unit || p.unit || 'ถุง',
                  sku: p.sku,
                  category_name: p.category_name || 'สูตรอาหาร (BOM)',
                  selling_price: parseFloat(p.selling_price) || 0,
                  current_cost: parseFloat(p.cost_price) || 0,
                  calculated_cost: recData.calculated_cost || 0,
                  unit_cost: recData.unit_cost || 0,
                  margin: recData.margin || 0,
                  ingredient_count: items.length,
                  is_raw_material: p.is_raw_material
                };
              }
            } catch (_) {}
            return null;
          })
        );
        for (const item of enriched) {
          if (item) summaryList.push(item);
        }
      }

      setRecipeSummary(summaryList);
    } catch (err) {
      console.error('fetchRecipeSummary error:', err);
    }
  };

  const handleSearchIngredient = (e) => {
    e.preventDefault();
    fetchIngredients();
  };

  // Ingredient Handlers
  const handleOpenIngredientModal = (ing = null) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์จัดการวัตถุดิบ (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (ing) {
      setEditingIngredient(ing);
      setIngredientForm({
        sku: ing.sku || '',
        name: ing.name,
        unit: ing.unit,
        cost_per_unit: ing.cost_per_unit,
        quantity: ing.quantity,
        reorder_level: ing.reorder_level,
      });
    } else {
      setEditingIngredient(null);
      setIngredientForm({
        sku: '',
        name: '',
        unit: 'g',
        cost_per_unit: 0,
        quantity: 0,
        reorder_level: 0,
      });
    }
    setShowIngredientModal(true);
  };

  const handleSaveIngredient = async (e) => {
    e.preventDefault();
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์จัดการวัตถุดิบ (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (!ingredientForm.name.trim()) {
      return toast.error('กรุณาระบุชื่อวัตถุดิบ');
    }

    try {
      if (editingIngredient) {
        await ingredientsAPI.update(editingIngredient.id, ingredientForm);
        toast.success('อัปเดตวัตถุดิบเรียบร้อยแล้ว');
      } else {
        const res = await ingredientsAPI.create(ingredientForm);
        toast.success('เพิ่มวัตถุดิบใหม่เรียบร้อยแล้ว');
        if (res.data.success && res.data.data && selectedProduct) {
          const newIng = res.data.data;
          const calc = calculateItemCostAndQty(newIng, newIng.unit, newIng.unit, 1);
          setRecipeItems(prev => [
            ...prev,
            {
              ingredient_id: newIng.id,
              ingredient_name: newIng.name,
              quantity: 1,
              unit: newIng.unit,
              cost_per_unit: calc.cost_per_unit,
              item_cost: calc.item_cost,
            }
          ]);
          setIsDirty(true);
        }
      }
      setShowIngredientModal(false);
      fetchIngredients();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาดในการบันทึกวัตถุดิบ');
    }
  };

  const handleDeleteIngredient = async (id) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์จัดการวัตถุดิบ (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (!window.confirm('คุณต้องการลบวัตถุดิบนี้หรือไม่?')) return;
    try {
      await ingredientsAPI.delete(id);
      toast.success('ลบวัตถุดิบสำเร็จ');
      fetchIngredients();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'ไม่สามารถลบวัตถุดิบได้');
    }
  };

  // Stock Adjust Handlers
  const handleOpenAdjustModal = (ing) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์ปรับสต็อกวัตถุดิบ (ดูข้อมูลเท่านั้น)');
      return;
    }
    setAdjustingIngredient(ing);
    setAdjustForm({ quantity_change: 0, type: 'receive', remark: '' });
    setShowAdjustModal(true);
  };

  const handleSaveStockAdjust = async (e) => {
    e.preventDefault();
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์ปรับสต็อกวัตถุดิบ (ดูข้อมูลเท่านั้น)');
      return;
    }
    const qty = parseFloat(adjustForm.quantity_change);
    if (!qty || qty === 0) return toast.error('กรุณาระบุจำนวนที่ปรับเปลี่ยน');

    const finalChange = adjustForm.type === 'issue' ? -Math.abs(qty) : qty;

    try {
      await ingredientsAPI.adjustStock(adjustingIngredient.id, {
        quantity_change: finalChange,
        type: adjustForm.type,
        remark: adjustForm.remark
      });
      toast.success('ปรับปรุงสต็อกวัตถุดิบเรียบร้อย');
      setShowAdjustModal(false);
      fetchIngredients();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาดในการปรับสต็อก');
    }
  };

  // Recipe Handlers
  const handleSelectProductForRecipe = async (product, opts = {}) => {
    if (!opts.skipDirtyCheck && isDirty && selectedProduct && selectedProduct.id !== product.id) {
      if (!window.confirm(`คุณมีข้อมูลสูตรสำหรับ "${selectedProduct.name}" ที่ยังไม่ได้บันทึก ต้องการสลับสินค้าโดยไม่บันทึกหรือไม่?`)) {
        return;
      }
    }
    const loadSeq = ++recipeLoadSeq.current;
    setRecipeLoadedId(null);
    setSelectedProduct(product);
    setSellingPrice(product.selling_price || 0);
    setYieldUnit(product.yield_unit || 'L');
    setPortionCount(product.portion_count || product.recipe_yield || 1);
    setPortionUnit(product.portion_unit || product.unit || 'แก้ว');
    setShelfLifeDays(product.shelf_life_days != null ? product.shelf_life_days : '');
    setDeductOnSale(isDeductOn(product.deduct_recipe_on_sale));

    // Auto-detect matching POS finished sale products (is_raw_material === 0)
    // Skipped on post-save resync so an explicit user mapping is never dropped.
    if (opts.keepMappedIds) {
      setTargetMappedProductIds(opts.keepMappedIds);
    } else {
    const matchingSaleProducts = (products || []).filter(p => 
      (p.is_raw_material === 0 || p.is_raw_material === false) &&
      p.id !== product.id &&
      (
        p.name.trim().toLowerCase() === product.name.trim().toLowerCase() ||
        (product.recipe_name && p.name.trim().toLowerCase() === product.recipe_name.trim().toLowerCase())
      )
    );
    setTargetMappedProductIds(matchingSaleProducts.map(p => p.id));
    }
    setIsDirty(false);
    try {
      setLoadingRecipe(true);
      const res = await recipesAPI.getByProduct(product.id);
      // Discard stale responses from an older selection (rapid clicking).
      if (recipeLoadSeq.current !== loadSeq) return;
      if (res.data.success) {
        setRecipeItems(res.data.data.recipe || []);
        if (res.data.data.product) {
          setRecipeName(getValidRecipeName(res.data.data.product.recipe_name, `สูตร ${product.name}`));
          setRecipeYield(res.data.data.product.recipe_yield || 1);
          setSellingPrice(res.data.data.product.selling_price || product.selling_price || 0);
          setYieldUnit(res.data.data.product.yield_unit || product.yield_unit || 'L');
          setPortionCount(res.data.data.product.portion_count || res.data.data.product.recipe_yield || 1);
          setPortionUnit(res.data.data.product.portion_unit || res.data.data.product.unit || 'แก้ว');
          setShelfLifeDays(res.data.data.product.shelf_life_days != null ? res.data.data.product.shelf_life_days : '');
          if (res.data.data.product.deduct_recipe_on_sale !== undefined) {
            setDeductOnSale(isDeductOn(res.data.data.product.deduct_recipe_on_sale));
          }
        }
        // Editor state is now confirmed against server truth.
        setRecipeLoadedId(product.id);
      }
    } catch (err) {
      if (recipeLoadSeq.current !== loadSeq) return;
      toast.error('ไม่สามารถโหลดสูตรสินค้าได้');
    } finally {
      if (recipeLoadSeq.current === loadSeq) setLoadingRecipe(false);
    }
  };

  const handleCreateAndMapSaleProduct = async (presetName = '') => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์สร้างสินค้าขาย POS (ดูข้อมูลเท่านั้น)');
      return;
    }
    const targetName = (presetName || newSaleProductName || recipeName || selectedProduct?.name || '').trim();
    if (!targetName) return toast.error('กรุณากรอกชื่อสินค้าขายใน POS');

    try {
      setCreatingSaleProduct(true);
      const sku = 'PRD' + String(Math.floor(100000 + Math.random() * 900000));
      const res = await api.post('/products', {
        sku,
        name: targetName,
        selling_price: parseFloat(sellingPrice) || 0,
        unit: portionUnit || 'ถุง',
        is_raw_material: 0,
        is_active: 1
      });

      if (res.data.success) {
        const newProd = res.data.data;
        toast.success(`สร้างเมนูขาย POS "${newProd.name}" และเพิ่มในรายการผูกสูตรเรียบร้อย!`);
        setTargetMappedProductIds(prev => [...prev, newProd.id]);
        setNewSaleProductName('');
        setIsDirty(true);
        fetchProductsAndCategories();
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'ไม่สามารถสร้างสินค้าขาย POS ได้');
    } finally {
      setCreatingSaleProduct(false);
    }
  };

  const handleToggleConvertToSaleProduct = async () => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์เปลี่ยนประเภทสินค้า (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (!selectedProduct) return;
    try {
      const nextRawFlag = selectedProduct.is_raw_material === 1 ? 0 : 1;
      let targetCatId = selectedProduct.category_id;
      if (nextRawFlag === 0) {
        // If converting to sale product, ensure category is NOT raw material
        const isCurrentCatRaw = categories.find(c => c.id === selectedProduct.category_id && (c.name === 'วัตถุดิบ' || c.name.includes('วัตถุดิบ') || c.is_raw_material));
        if (isCurrentCatRaw || !targetCatId) {
          const bevCat = categories.find(c => (c.name === 'เครื่องดื่ม' || c.name.includes('เครื่องดื่ม')) && !c.is_raw_material);
          const foodCat = categories.find(c => (c.name === 'อาหาร' || c.name.includes('อาหาร')) && !c.is_raw_material);
          const otherCat = categories.find(c => !c.name.includes('วัตถุดิบ') && !c.is_raw_material);
          targetCatId = (selectedProduct.name.includes('น้ำ') && bevCat) ? bevCat.id : (bevCat?.id || foodCat?.id || otherCat?.id || null);
        }
      } else {
        const rawCat = categories.find(c => c.name === 'วัตถุดิบ' || c.is_raw_material);
        if (rawCat) targetCatId = rawCat.id;
      }

      const res = await api.put(`/products/${selectedProduct.id}`, {
        is_raw_material: nextRawFlag,
        category_id: targetCatId,
        selling_price: nextRawFlag === 1 ? 0 : (parseFloat(sellingPrice) || selectedProduct.selling_price || 0)
      });
      if (res.data.success) {
        toast.success(nextRawFlag === 0 ? `เปลี่ยน "${selectedProduct.name}" เป็นเมนูขายหน้าร้าน POS เรียบร้อย!` : `เปลี่ยน "${selectedProduct.name}" เป็นสูตรเตรียม/วัตถุดิบ`);
        setSelectedProduct(res.data.data);
        fetchProductsAndCategories();
        fetchRecipeSummary();
      }
    } catch (err) {
      toast.error('ไม่สามารถเปลี่ยนประเภทสินค้าได้');
    }
  };

  const handleAddRecipeRow = () => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์แก้ไขสูตรอาหาร (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (allAvailableIngredients.length === 0) {
      return toast.error('กรุณาเพิ่มรายการวัตถุดิบหรือสินค้าในคลังก่อนสร้างสูตร');
    }
    const matchingIng = allAvailableIngredients.find(ing => 
      (ing.id === selectedProduct?.id || ing.name === selectedProduct?.name) &&
      !recipeItems.some(r => r.ingredient_id === ing.id)
    );
    const unusedIng = allAvailableIngredients.find(ing => !recipeItems.some(r => r.ingredient_id === ing.id));
    const defaultIng = matchingIng || unusedIng || allAvailableIngredients[0];
    const calc = calculateItemCostAndQty(defaultIng, defaultIng.unit, defaultIng.unit, 1);

    setRecipeItems([
      ...recipeItems,
      {
        ingredient_id: defaultIng.id,
        ingredient_name: defaultIng.name,
        quantity: 1,
        unit: defaultIng.unit,
        cost_per_unit: calc.cost_per_unit,
        item_cost: calc.item_cost,
      }
    ]);
    setIsDirty(true);
  };

  const handleAddProductAsIngredient = async (productToAdd) => {
    if (!selectedProduct) {
      return toast.error('กรุณาเลือกสินค้าที่ต้องการสร้างสูตรก่อน');
    }
    if (selectedProduct.id === productToAdd.id) {
      return toast.error('ไม่สามารถเพิ่มสินค้าตัวเดียวกันเป็นส่วนผสมของตัวเองได้');
    }
    const ingUnit = productToAdd.unit || 'ชิ้น';
    const costPerUnit = parseFloat(productToAdd.cost_price) || 0;
    const calc = calculateItemCostAndQty({ unit: ingUnit, cost_per_unit: costPerUnit }, ingUnit, ingUnit, 1);

    setRecipeItems(prev => [
      ...prev,
      {
        ingredient_id: productToAdd.id,
        ingredient_name: productToAdd.name,
        quantity: 1,
        unit: ingUnit,
        cost_per_unit: calc.cost_per_unit,
        item_cost: calc.item_cost,
      }
    ]);
    setIsDirty(true);
    toast.success(`เพิ่ม "${productToAdd.name}" เข้าในสูตรเรียบร้อยแล้ว`);
  };

function getUnitFactor(unitStr) {
  if (!unitStr) return 1;
  const u = String(unitStr).trim().toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล'].includes(u)) return 1000;
  if (['g', 'กรัม', 'ก.'].includes(u)) return 1;
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล'].includes(u)) return 1;
  if (['l', 'ลิตร'].includes(u)) return 1000;
  if (['oz', 'ออนซ์'].includes(u)) return 28.3495;
  return 1;
}

function calculateItemCostAndQty(ing, newUnit, oldUnit, currentQty) {
  if (!ing) return { cost_per_unit: 0, item_cost: 0, quantity: currentQty };
  const ingFactor = getUnitFactor(ing.unit);
  const targetFactor = getUnitFactor(newUnit);
  const oldFactor = getUnitFactor(oldUnit || ing.unit);

  let newCostPerUnit = ing.cost_per_unit;
  let newQuantity = currentQty;

  if (ingFactor > 0 && targetFactor > 0 && ingFactor !== targetFactor) {
    newCostPerUnit = ing.cost_per_unit * (targetFactor / ingFactor);
  }

  if (oldFactor > 0 && targetFactor > 0 && oldFactor !== targetFactor && currentQty > 0) {
    newQuantity = currentQty * (oldFactor / targetFactor);
    if (newQuantity < 1) newQuantity = Number(newQuantity.toFixed(4));
    else newQuantity = Number(newQuantity.toFixed(2));
  }

  const itemCost = newQuantity * newCostPerUnit;
  return {
    cost_per_unit: Number(newCostPerUnit.toFixed(4)),
    item_cost: Number(itemCost.toFixed(4)),
    quantity: newQuantity
  };
}

  const handleRecipeRowChange = (index, field, value) => {
    const updated = [...recipeItems];
    const item = updated[index];
    const selectedIng = allAvailableIngredients.find(i => i.id === (field === 'ingredient_id' ? value : item.ingredient_id));

    if (field === 'ingredient_id') {
      if (selectedIng) {
        const calc = calculateItemCostAndQty(selectedIng, selectedIng.unit, selectedIng.unit, 1);
        updated[index] = {
          ...item,
          ingredient_id: selectedIng.id,
          ingredient_name: selectedIng.name,
          unit: selectedIng.unit,
          quantity: 1,
          cost_per_unit: calc.cost_per_unit,
          item_cost: calc.item_cost
        };
      }
    } else if (field === 'unit') {
      const newUnit = value;
      const oldUnit = item.unit;
      const currentQty = parseFloat(item.quantity) || 1;
      const calc = calculateItemCostAndQty(selectedIng, newUnit, oldUnit, currentQty);

      updated[index] = {
        ...item,
        unit: newUnit,
        quantity: calc.quantity,
        cost_per_unit: calc.cost_per_unit,
        item_cost: calc.item_cost
      };
    } else if (field === 'quantity') {
      const rawVal = value;
      const numQty = parseFloat(value) || 0;
      const costPerUnit = item.cost_per_unit || (selectedIng ? selectedIng.cost_per_unit : 0);
      updated[index] = {
        ...item,
        quantity: rawVal,
        item_cost: Number((numQty * costPerUnit).toFixed(4))
      };
    }
    setRecipeItems(updated);
    setIsDirty(true);
  };

  const handleRemoveRecipeRow = async (index) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์แก้ไขสูตรอาหาร (ดูข้อมูลเท่านั้น)');
      return;
    }
    const updated = recipeItems.filter((_, i) => i !== index);
    setRecipeItems(updated);
    setIsDirty(true);

    if (selectedProduct) {
      try {
        setSavingRecipe(true);
        const payload = {
          recipe_name: isCorruptedRecipeName(recipeName) ? `สูตร ${selectedProduct.name}` : recipeName.trim(),
          recipe_yield: Math.max(0.0001, parseFloat(recipeYield) || 1),
          portion_count: Math.max(0.0001, parseFloat(portionCount) || 1),
          portion_unit: portionUnit || 'แก้ว',
          items: updated.map(r => ({
            ingredient_id: r.ingredient_id,
            quantity: parseFloat(r.quantity) || 0,
            unit: r.unit
          })),
          update_product_cost: true,
          target_product_ids: targetMappedProductIds
        };
        const res = await recipesAPI.saveRecipe(selectedProduct.id, payload);
        if (res.data.success) {
          toast.success('ลบส่วนผสมออกจากสูตรเรียบร้อยแล้ว');
          setIsDirty(false);
          fetchRecipeSummary();
          fetchProductsAndCategories();
        }
      } catch (err) {
        toast.error('ไม่สามารถลบส่วนผสมได้');
      } finally {
        setSavingRecipe(false);
      }
    }
  };

  const handleSaveRecipe = async (updateProductCost = false) => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์บันทึกสูตรอาหาร (ดูข้อมูลเท่านั้น)');
      return;
    }
    if (!selectedProduct) return;
    try {
      setSavingRecipe(true);

      const newSellingPrice = parseFloat(sellingPrice) || 0;
      const targetUnit = portionUnit || selectedProduct.unit || 'ถุง';
      if (newSellingPrice !== selectedProduct.selling_price || targetUnit !== selectedProduct.unit || (yieldUnit && yieldUnit !== selectedProduct.yield_unit)) {
        const targetIsRaw = newSellingPrice > 0 ? 0 : (selectedProduct.is_raw_material ? 1 : 0);
        await api.put(`/products/${selectedProduct.id}`, {
          selling_price: newSellingPrice,
          unit: targetUnit,
          yield_unit: yieldUnit || null,
          is_raw_material: targetIsRaw
        });
        setSelectedProduct(prev => ({
          ...prev,
          selling_price: newSellingPrice,
          unit: targetUnit,
          yield_unit: yieldUnit || prev.yield_unit,
          is_raw_material: targetIsRaw
        }));
      }

      const payload = {
        recipe_name: isCorruptedRecipeName(recipeName) ? `สูตร ${selectedProduct.name}` : recipeName.trim(),
        recipe_yield: Math.max(0.0001, parseFloat(recipeYield) || 1),
        portion_count: Math.max(0.0001, parseFloat(portionCount) || 1),
        portion_unit: portionUnit || 'แก้ว',
        shelf_life_days: shelfLifeDays !== '' && shelfLifeDays !== null ? Math.max(0, parseInt(shelfLifeDays, 10) || 0) : null,
        deduct_recipe_on_sale: deductOnSale ? 1 : 0,
        yield_unit: yieldUnit || null,
        items: recipeItems.map(r => ({
          ingredient_id: r.ingredient_id,
          quantity: parseFloat(r.quantity) || 0,
          unit: r.unit
        })),
        update_product_cost: updateProductCost,
        target_product_ids: targetMappedProductIds
      };

      const res = await recipesAPI.saveRecipe(selectedProduct.id, payload);
      if (res.data.success) {
        toast.success(res.data.message || 'บันทึกสูตรสินค้าสำเร็จ');
        setIsDirty(false);
        // Resync editor from server truth: guarantees what you see is what
        // was persisted. Any silent persistence failure snaps back here
        // immediately instead of surfacing as a "revert on refresh".
        const keepMapped = [...targetMappedProductIds];
        const freshList = await fetchProductsAndCategories();
        fetchRecipeSummary();
        const fresh = (freshList || []).find(p => p.id === selectedProduct.id);
        if (fresh) {
          await handleSelectProductForRecipe(fresh, { skipDirtyCheck: true, keepMappedIds: keepMapped });
        } else {
          setSelectedProduct(prev => ({
            ...prev,
            recipe_name: payload.recipe_name,
            recipe_yield: payload.recipe_yield,
            portion_count: payload.portion_count,
            portion_unit: payload.portion_unit,
            shelf_life_days: payload.shelf_life_days,
            deduct_recipe_on_sale: payload.deduct_recipe_on_sale,
            yield_unit: payload.yield_unit
          }));
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'เกิดข้อผิดพลาดในการบันทึกสูตร');
    } finally {
      setSavingRecipe(false);
    }
  };

  const [syncing, setSyncing] = useState(false);

  const handleSyncIngredients = async () => {
    if (!canMaintain) {
      toast.error('คุณไม่มีสิทธิ์ซิงค์วัตถุดิบ (ดูข้อมูลเท่านั้น)');
      return;
    }
    try {
      setSyncing(true);
      const res = await api.post('/ingredients/sync');
      if (res.data.success) {
        toast.success(res.data.message || 'ซิงค์ข้อมูลวัตถุดิบอัตโนมัติสำเร็จ');
        setIngredients(res.data.data);
      }
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการซิงค์ข้อมูลวัตถุดิบ');
    } finally {
      setSyncing(false);
    }
  };

  // Calculations
  const totalRecipeCost = recipeItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (item.cost_per_unit || 0)), 0);
  const yieldNum = Math.max(0.0001, parseFloat(recipeYield) || 1);
  const portionNum = Math.max(0.0001, parseFloat(portionCount) || 1);
  const costPerBatchUnit = totalRecipeCost / yieldNum;
  const unitCost = totalRecipeCost / portionNum;
  const currentSellingPrice = parseFloat(sellingPrice) || 0;
  const profitMargin = currentSellingPrice > 0 
    ? ((currentSellingPrice - unitCost) / currentSellingPrice) * 100 
    : 0;

  const lowStockIngredientsCount = (ingredients || []).filter(i => i.quantity <= i.reorder_level).length;
  const configuredRecipesCount = (recipeSummary || []).filter(r => r.ingredient_count > 0).length;

  const availableCategories = categories.filter(cat => products.some(p => p.category_id === cat.id));

  const filteredProducts = products.filter(p => {
    const isPureRaw = (p.is_raw_material === 1 || p.is_raw_material === true || p.category_name === 'วัตถุดิบ' || (p.category_name && p.category_name.includes('วัตถุดิบ')))
      && (!p.selling_price || parseFloat(p.selling_price) <= 0)
      && (!p.sku || !p.sku.startsWith('REC'));
    if (isPureRaw) return false;
    const matchSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()));
    const matchCategory = selectedCategoryId ? p.category_id === selectedCategoryId : true;
    return matchSearch && matchCategory;
  });

  // Selectable POS products for recipe mapping (TAB 3)
  const mappingProducts = products.filter(p => {
    const isPureRaw = (p.is_raw_material === 1 || p.is_raw_material === true || p.category_name === 'วัตถุดิบ' || (p.category_name && p.category_name.includes('วัตถุดิบ')))
      && (!p.selling_price || parseFloat(p.selling_price) <= 0)
      && (!p.sku || !p.sku.startsWith('REC'));
    if (isPureRaw) return false;
    return !mappingSearch || p.name.toLowerCase().includes(mappingSearch.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(mappingSearch.toLowerCase()));
  });

  // Table pagination (page resets on new search / tab switch / date filter)
  const ingredientsPaging = usePagination(ingredients, 20, ingredientSearch + '|' + activeTab);
  const mappingPaging = usePagination(mappingProducts, 20, mappingSearch + '|' + activeTab);
  const woPaging = usePagination(sortedWorkOrders, 10, workOrderSearch + '|' + woStartDate + '|' + woEndDate + '|' + activeTab);

  const navTabs = [
    {
      id: 'ingredients',
      label: 'คลังวัตถุดิบ',
      icon: ScaleIcon,
      badge: ingredients.length,
    },
    {
      id: 'master_recipes',
      label: 'สูตรอาหาร & BOM',
      desktopPrefix: 'คลัง',
      icon: BeakerIcon,
      badge: configuredRecipesCount,
    },
    {
      id: 'recipes',
      label: 'ผูกสูตรขาย POS',
      icon: ShoppingBagIcon,
    },
    {
      id: 'work_orders',
      label: 'ประวัติการผลิต',
      suffix: '(WO)',
      icon: CheckCircleIcon,
      badge: workOrders.length,
      action: fetchWorkOrders,
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-6 space-y-3.5 sm:space-y-6 overflow-x-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-850 dark:to-indigo-950/40 rounded-2xl p-3.5 sm:p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 border border-indigo-100 dark:border-slate-800">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold flex flex-wrap items-center gap-2 text-gray-800 dark:text-white">
            <BeakerIcon className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>ระบบสูตรอาหาร & จัดการวัตถุดิบ</span>
            <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold shrink-0">
              Recipe & BOM
            </span>
          </h1>
          <p className="text-gray-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
            คำนวณต้นทุนตามสูตรวัตถุดิบจริง ตัดสต็อกวัตถุดิบอัตโนมัติเมื่อมีการขาย
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full md:w-auto shrink-0">
          <div className="bg-white/90 dark:bg-slate-800/90 px-2 sm:px-4 py-2 rounded-xl text-center border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">วัตถุดิบทั้งหมด</p>
            <p className="text-sm sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">{ingredients.length} <span className="text-[10px] sm:text-xs font-normal">รายการ</span></p>
          </div>
          <div className="bg-white/90 dark:bg-slate-800/90 px-2 sm:px-4 py-2 rounded-xl text-center border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">สต็อกต่ำ</p>
            <p className={`text-sm sm:text-xl font-bold ${lowStockIngredientsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {lowStockIngredientsCount} <span className="text-[10px] sm:text-xs font-normal">รายการ</span>
            </p>
          </div>
          <div className="bg-white/90 dark:bg-slate-800/90 px-2 sm:px-4 py-2 rounded-xl text-center border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">มีสูตรแล้ว</p>
            <p className="text-sm sm:text-xl font-bold text-cyan-600 dark:text-cyan-400">{configuredRecipesCount} <span className="text-[10px] sm:text-xs font-normal">เมนู</span></p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (2x2 Grid on Mobile - No Slide / 4-Col Grid on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-1.5 gap-1.5 shadow-xs">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.action) tab.action();
              }}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 cursor-pointer select-none active:scale-[0.98] ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200/60 dark:shadow-none font-extrabold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
              }`}
            >
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              <span className="leading-tight text-center">
                {tab.desktopPrefix && <span className="hidden sm:inline">{tab.desktopPrefix}</span>}
                {tab.label}
                {tab.suffix && <span className="ml-1 text-[10px] sm:text-xs opacity-85">{tab.suffix}</span>}
              </span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full font-semibold shrink-0 transition-colors ${
                    isActive
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: INGREDIENTS MANAGEMENT */}
      {activeTab === 'ingredients' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4">
            <form onSubmit={handleSearchIngredient} className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาตามชื่อวัตถุดิบ หรือ SKU..."
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-xs sm:text-sm"
              />
            </form>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSyncIngredients}
                disabled={syncing}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 rounded-xl font-bold text-xs transition-all disabled:opacity-50 w-full sm:w-auto"
                title="ซิงค์วัตถุดิบจากคลังสินค้าอัตโนมัติ"
              >
                <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'กำลังซิงค์...' : '🔄 ซิงค์วัตถุดิบอัตโนมัติ'}</span>
              </button>
            </div>
          </div>

          {/* Ingredients Table (PWA Responsive Touch Scroll) */}
          <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-xs">
            <table className="w-full text-left text-xs sm:text-sm min-w-[550px]">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2.5 sm:p-4">SKU</th>
                  <th className="p-2.5 sm:p-4">ชื่อวัตถุดิบ</th>
                  <th className="p-2.5 sm:p-4">หน่วยนับ</th>
                  <th className="p-2.5 sm:p-4">ต้นทุน/หน่วย (฿)</th>
                  <th className="p-2.5 sm:p-4">จำนวนคงเหลือ</th>
                  <th className="p-2.5 sm:p-4">จุดสั่งซื้อเพิ่ม</th>
                  <th className="p-2.5 sm:p-4">สถานะสต็อก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingIngredients ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400">
                      กำลังโหลดข้อมูลวัตถุดิบ...
                    </td>
                  </tr>
                ) : ingredients.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400">
                      ยังไม่มีรายการวัตถุดิบในคลัง (เพิ่มวัตถุดิบได้ที่หน้า จัดการคลังสินค้า หรือกด "ซิงค์วัตถุดิบอัตโนมัติ")
                    </td>
                  </tr>
                ) : (
                  ingredientsPaging.paged.map((ing) => {
                    const isLow = ing.quantity <= ing.reorder_level;
                    return (
                      <tr key={ing.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2.5 sm:p-4 font-mono text-xs text-slate-500">{ing.sku || '-'}</td>
                        <td className="p-2.5 sm:p-4 font-semibold text-slate-800">{ing.name}</td>
                        <td className="p-2.5 sm:p-4 text-slate-600">{ing.unit}</td>
                        <td className="p-2.5 sm:p-4 font-semibold text-slate-700">฿{ing.cost_per_unit.toFixed(2)}</td>
                        <td className="p-2.5 sm:p-4 font-bold text-slate-800">
                          {formatQty(ing.quantity)} {ing.unit}
                        </td>
                        <td className="p-2.5 sm:p-4 text-slate-500">{formatQty(ing.reorder_level)} {ing.unit}</td>
                        <td className="p-2.5 sm:p-4">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                              สต็อกต่ำกว่าเกณฑ์
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircleIcon className="w-3.5 h-3.5" />
                              ปกติ
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <Pagination
              page={ingredientsPaging.page}
              totalPages={ingredientsPaging.totalPages}
              perPage={ingredientsPaging.perPage}
              onPageChange={ingredientsPaging.setPage}
              onPerPageChange={ingredientsPaging.setPerPage}
              rangeStart={ingredientsPaging.rangeStart}
              rangeEnd={ingredientsPaging.rangeEnd}
              total={ingredientsPaging.total}
            />
          </div>
        </div>
      )}

      {/* TAB 2: MASTER RECIPE LIBRARY & BOM */}
      {activeTab === 'master_recipes' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BeakerIcon className="w-6 h-6 text-indigo-600" />
                คลังสูตรอาหาร & BOM (Master Recipe Library)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                สร้างและจัดการสูตรอาหารอิสระ (Master Recipes) ผสมวัตถุดิบหลายชนิด กำหนด Yield และคำนวณต้นทุน/หน่วย
              </p>
            </div>
            {canMaintain && (
              <button
                type="button"
                onClick={() => handleOpenMasterModal()}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-100 shrink-0"
              >
                <PlusIcon className="w-5 h-5" />
                + สร้างสูตรอาหารใหม่
              </button>
            )}
          </div>

          {/* Master Recipe Search Bar */}
          <div className="relative max-w-md">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาชื่อสูตรอาหาร..."
              value={masterRecipeSearch}
              onChange={(e) => setMasterRecipeSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Master Recipe Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {recipeSummary
              .filter(r => !masterRecipeSearch || r.product_name.toLowerCase().includes(masterRecipeSearch.toLowerCase()) || (!isCorruptedRecipeName(r.recipe_name) && r.recipe_name.toLowerCase().includes(masterRecipeSearch.toLowerCase())))
              .map(recipe => (
                <div key={recipe.product_id} className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-4 shadow-md flex flex-col justify-between hover:border-indigo-500/50 transition-all">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[11px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-700/60 px-2.5 py-0.5 rounded-full">
                        {recipe.category_name || 'สูตรอาหาร'}
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${isDeductOn(recipe.deduct_recipe_on_sale) ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {isDeductOn(recipe.deduct_recipe_on_sale) ? '🧾 ✅ เปิดตัดสูตร' : '🧾 ⬜ ปิด'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">SKU: {recipe.sku || '-'}</span>
                      </span>
                    </div>
                    <h3 className="font-extrabold text-lg text-white mt-2">
                      {getValidRecipeName(recipe.recipe_name, recipe.product_name)}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      ผลผลิตต่อ Batch: <span className="font-bold text-indigo-300">{recipe.recipe_yield} หน่วย</span>
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-center bg-slate-950/60 p-3 rounded-xl">
                    <div>
                      <p className="text-[11px] text-slate-400">ต้นทุนต่อ Batch</p>
                      <p className="text-base font-bold text-slate-200">฿{recipe.calculated_cost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-indigo-300 font-bold">ต้นทุนต่อ 1 หน่วย</p>
                      <p className="text-base font-extrabold text-cyan-400">฿{recipe.unit_cost.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-400">
                      {recipe.ingredient_count > 0 ? `ส่วนผสม ${recipe.ingredient_count} รายการ` : 'ยังไม่ได้ระบุส่วนผสม'}
                    </span>
                    {isDeductOn(recipe.deduct_recipe_on_sale) && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700/70">
                        🧾 ตัดสูตรเมื่อขาย
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      {canMaintain ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const prod = products.find(p => p.id === recipe.product_id);
                              if (prod) {
                                setActiveTab('recipes');
                                handleSelectProductForRecipe(prod);
                              }
                            }}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all"
                          >
                            ✏️ แก้ไขสูตร
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMasterRecipe(recipe.product_id, getValidRecipeName(recipe.recipe_name, recipe.product_name))}
                            className="p-1 hover:bg-rose-950 text-rose-400 rounded-lg transition-colors"
                            title="ลบสูตรนี้"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const prod = products.find(p => p.id === recipe.product_id);
                            if (prod) {
                              setActiveTab('recipes');
                              handleSelectProductForRecipe(prod);
                            }
                          }}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all"
                        >
                          👁️ ดูสูตร
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Linked POS menus (display only — toggle in ผูกสูตรขาย POS tab) */}
                  {(() => {
                    const linkedPos = (products || []).filter(p =>
                      p.id !== recipe.product_id &&
                      recipe.recipe_name && p.recipe_name === recipe.recipe_name &&
                      parseFloat(p.selling_price) > 0
                    ).slice(0, 3);
                    if (linkedPos.length === 0) return null;
                    return (
                      <p className="text-[11px] text-slate-400 px-1 pt-2 border-t border-slate-800">
                        🔗 เมนูขายที่ผูกสูตรนี้: <span className="text-indigo-300 font-bold">{linkedPos.map(p => p.name).join(', ')}</span>
                      </p>
                    );
                  })()}

                  {/* Batch Production Control Box */}
                  {canMaintain && (
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                          <BeakerIcon className="w-3.5 h-3.5 text-amber-400" />
                          จำนวนที่จะผลิต (Batch):
                        </span>
                        <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl p-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const curr = parseInt(batchQuantities[recipe.product_id]) || 1;
                              setBatchQuantities(prev => ({ ...prev, [recipe.product_id]: Math.max(1, curr - 1) }));
                            }}
                            className="w-6 h-6 flex items-center justify-center text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-extrabold transition-all"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={batchQuantities[recipe.product_id] ?? 1}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setBatchQuantities(prev => ({ ...prev, [recipe.product_id]: '' }));
                              } else {
                                const parsed = parseInt(val, 10);
                                setBatchQuantities(prev => ({ ...prev, [recipe.product_id]: isNaN(parsed) ? '' : Math.max(1, parsed) }));
                              }
                            }}
                            onBlur={() => {
                              if (!batchQuantities[recipe.product_id] || batchQuantities[recipe.product_id] < 1) {
                                setBatchQuantities(prev => ({ ...prev, [recipe.product_id]: 1 }));
                              }
                            }}
                            className="w-10 text-center bg-transparent text-xs font-extrabold text-cyan-300 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const curr = parseInt(batchQuantities[recipe.product_id]) || 1;
                              setBatchQuantities(prev => ({ ...prev, [recipe.product_id]: curr + 1 }));
                            }}
                            className="w-6 h-6 flex items-center justify-center text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-extrabold transition-all"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenProductionModal(recipe, batchQuantities[recipe.product_id] || 1)}
                        className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-950"
                      >
                        <BeakerIcon className="w-4 h-4 text-amber-300" />
                        <span>🍳 สรุปวัตถุดิบ & ผลิตตามสูตร ({batchQuantities[recipe.product_id] || 1} Batch)</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 3: PRODUCT RECIPES MANAGEMENT */}
      {activeTab === 'recipes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel: Products Selection List */}
          <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <BeakerIcon className="w-5 h-5 text-indigo-600" />
              เลือกสูตรที่ต้องการสำหรับจัดการสูตร
            </h2>

            {/* Product Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาชื่อสูตรหรือสินค้า..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Product List Scroll Area */}
            <div className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto pr-1">
              {filteredProducts.length === 0 ? (
                <p className="p-4 text-center text-slate-400 text-sm">ไม่พบสินค้า</p>
              ) : (
                filteredProducts.map(product => {
                  const isSelected = selectedProduct?.id === product.id;
                  const hasRecipe = recipeSummary.some(r => r.product_id === product.id && r.ingredient_count > 0);
                  return (
                    <div
                      key={product.id}
                      onClick={() => handleSelectProductForRecipe(product)}
                      className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isSelected 
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div>
                        <p className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {product.name}
                        </p>
                        <p className={`text-xs ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                          ราคาขาย: ฿{product.selling_price} | ทุนเดิม: ฿{product.cost_price}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isDeductOn(product.deduct_recipe_on_sale) && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSelected ? 'bg-amber-400 text-amber-950 border border-amber-300' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            🧾 ตัดสูตร
                          </span>
                        )}
                        {hasRecipe && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSelected ? 'bg-indigo-500 text-white border border-indigo-400' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                          }`}>
                            มีสูตรแล้ว
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Recipe Builder Workspace */}
          <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
            {!selectedProduct ? (
              <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400 space-y-3">
                <BeakerIcon className="w-16 h-16 text-slate-300" />
                <p className="text-base font-medium text-slate-600">กรุณาเลือกสินค้าจากรายการด้านซ้ายเพื่อดูหรือสร้างสูตร</p>
                <p className="text-xs text-slate-400">คุณสามารถเพิ่มวัตถุดิบ ระบุปริมาณที่ใช้ และคำนวณต้นทุนขายได้ในส่วนนี้</p>
              </div>
            ) : (
              <>
                {/* Product Summary Header */}
                <div className="p-5 bg-slate-900/90 border border-slate-700/80 rounded-2xl text-white shadow-lg space-y-4">
                  {/* Top Header: Product Info & Actions */}
                  <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-slate-700/70 pb-4">
                    {/* Left: Product Name, SKU, Type Badge & Convert Action */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-indigo-300 bg-indigo-950/90 border border-indigo-700/70 px-2.5 py-1 rounded-lg">
                          สินค้าที่เลือก
                        </span>
                        <span className="text-xs text-slate-300 font-mono bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700">
                          SKU: <span className="text-amber-300 font-semibold">{selectedProduct.sku || '-'}</span>
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                          selectedProduct.is_raw_material === 1
                            ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                        }`}>
                          {selectedProduct.is_raw_material === 1 ? '📦 สูตรเตรียม/วัตถุดิบ' : '🛍️ สินค้าขาย POS'}
                        </span>
                        {canMaintain && selectedProduct.is_raw_material === 1 && (
                          <button
                            type="button"
                            onClick={handleToggleConvertToSaleProduct}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 border border-emerald-400/40"
                            title="เปลี่ยนสินค้าตัวนี้ให้เปิดขายหน้าร้าน POS ได้"
                          >
                            <span>🛍️</span>
                            <span>เปิดขายหน้าร้าน POS</span>
                          </button>
                        )}
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{selectedProduct.name}</h2>
                    </div>
                  </div>

                  {/* Middle Row: Recipe Configuration Inputs (Grid on desktop) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">ชื่อสูตร / หมายเหตุ</label>
                      <input
                        type="text"
                        disabled={!canMaintain}
                        placeholder={`สูตร ${selectedProduct.name}`}
                        value={recipeName}
                        onChange={(e) => { setRecipeName(e.target.value); setIsDirty(true); }}
                        className="w-full px-3 py-1.5 border border-slate-700 rounded-lg text-xs sm:text-sm font-semibold bg-slate-900 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none disabled:opacity-80"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1" title="ปริมาณหรือภาชนะต้ม/ปรุงรวมทั้งหม้อ">
                        ผลผลิต Batch รวม <span className="text-[10px] text-slate-400 font-normal">(หม้อ/ปริมาตร)</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          disabled={!canMaintain}
                          value={recipeYield}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => { setRecipeYield(e.target.value); setIsDirty(true); }}
                          className="w-full px-2.5 py-1.5 border border-slate-700 rounded-lg text-xs sm:text-sm font-bold text-center bg-slate-900 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-80"
                        />
                        <select
                          disabled={!canMaintain}
                          value={yieldUnit}
                          onChange={(e) => { setYieldUnit(e.target.value); setIsDirty(true); }}
                          className="px-2.5 py-1.5 border border-slate-700 rounded-lg text-xs font-bold bg-slate-900 text-indigo-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0 disabled:opacity-80 cursor-pointer"
                        >
                          {['หม้อ', 'ถัง', 'กะละมัง', 'L', 'ml', 'kg', 'g', 'รอบ/Batch', ...(yieldUnit && !['หม้อ', 'ถัง', 'กะละมัง', 'L', 'ml', 'kg', 'g', 'รอบ/Batch'].includes(yieldUnit) ? [yieldUnit] : [])].map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-cyan-300 mb-1" title="จำนวนชิ้น/แก้ว/ถุง ที่ตักแบ่งขายได้หน้าร้าน">
                        ผลิตได้ <span className="text-[10px] text-cyan-400/80 font-normal">(หน่วยขาย POS)</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          min="1"
                          disabled={!canMaintain}
                          value={portionCount}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => { setPortionCount(e.target.value); setIsDirty(true); }}
                          className="w-full px-2.5 py-1.5 border border-cyan-500/60 rounded-lg text-xs sm:text-sm font-extrabold text-center bg-slate-900 text-cyan-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none disabled:opacity-80"
                        />
                        <select
                          disabled={!canMaintain}
                          value={portionUnit}
                          onChange={(e) => { setPortionUnit(e.target.value); setIsDirty(true); }}
                          className="px-2.5 py-1.5 border border-cyan-500/60 rounded-lg text-xs font-bold bg-slate-900 text-cyan-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none shrink-0 disabled:opacity-80 cursor-pointer"
                        >
                          {['ถุง', 'แก้ว', 'ขวด', 'ถ้วย', 'ชิ้น', 'จาน', 'กล่อง', 'ชุด', ...(portionUnit && !['ถุง', 'แก้ว', 'ขวด', 'ถ้วย', 'ชิ้น', 'จาน', 'กล่อง', 'ชุด'].includes(portionUnit) ? [portionUnit] : [])].map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-300 mb-1">อายุการเก็บรักษา (วัน)</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          disabled={!canMaintain}
                          placeholder="ไม่จำกัด"
                          value={shelfLifeDays}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => { setShelfLifeDays(e.target.value); setIsDirty(true); }}
                          className="w-full px-2.5 py-1.5 border border-amber-500/60 rounded-lg text-xs sm:text-sm font-extrabold text-center bg-slate-900 text-amber-300 placeholder-slate-600 focus:ring-2 focus:ring-amber-400 focus:outline-none disabled:opacity-80"
                          title="จำนวนวันหลังผลิตก่อนสินค้าหมดอายุ (เว้นว่าง = ไม่ติดตามวันหมดอายุ)"
                        />
                        <span className="text-xs text-slate-400 font-medium shrink-0">วัน</span>
                      </div>
                    </div>
                  </div>

                  {/* Warning callout when same unit is used and portionCount > recipeYield */}
                  {yieldUnit === portionUnit && parseFloat(portionCount) > parseFloat(recipeYield) && (
                    <div className="p-2.5 bg-amber-950/60 border border-amber-600/70 rounded-xl text-amber-200 text-xs flex items-center gap-2">
                      <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        ⚠️ หน่วย Batch รวม และหน่วยขายเป็นหน่วยเดียวกัน (<strong>{yieldUnit}</strong>) โดย <strong>{recipeYield} {yieldUnit}</strong> ไม่สามารถแบ่งผลิตได้ <strong>{portionCount} {portionUnit}</strong> — แนะนำเปลี่ยนหน่วย Batch รวมเป็นภาชนะหรือปริมาตร (เช่น <strong>หม้อ, L, kg</strong>) หรือปรับจำนวนให้เท่ากัน
                      </span>
                    </div>
                  )}

                  {/* Bottom Row: Cost Metrics & Editable Selling Price (PWA Responsive Grid) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <p className="text-[10px] sm:text-xs text-amber-300 font-bold mb-0.5">ราคาขาย/1 {portionUnit || 'หน่วย'} (฿)</p>
                      <div className="flex items-center gap-1">
                        <span className="text-xs sm:text-sm font-bold text-slate-400">฿</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0"
                          disabled={!canMaintain}
                          value={sellingPrice}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => { setSellingPrice(e.target.value); setIsDirty(true); }}
                          className="w-full px-2 py-0.5 border border-amber-500/50 focus:border-amber-400 rounded-lg text-xs sm:text-sm font-extrabold text-amber-300 bg-slate-800 focus:ring-1 focus:ring-amber-400 focus:outline-none text-center disabled:opacity-80"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800" title="คำนวณอัตโนมัติจาก ราคาขาย/หน่วย × จำนวนหน่วยขาย">
                      <p className="text-[10px] sm:text-xs text-amber-200/80 font-medium mb-0.5 flex items-center gap-1">
                        ยอดขายรวมทั้ง Batch
                        <span title="ล็อก — คำนวณอัตโนมัติโดยระบบ">🔒</span>
                      </p>
                      <p className="text-sm sm:text-base font-extrabold text-amber-200 mt-0.5">
                        ฿{(portionCount > 0 ? Number(((parseFloat(sellingPrice) || 0) * (parseFloat(portionCount) || 1)).toFixed(2)) : (parseFloat(sellingPrice) || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <p className="text-[10px] sm:text-xs text-slate-400 font-medium">ต้นทุนรวม Batch</p>
                      <p className="text-sm sm:text-base font-extrabold text-slate-200 mt-0.5">฿{totalRecipeCost.toFixed(2)}</p>
                    </div>

                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <p className="text-[10px] sm:text-xs text-slate-400 font-medium">
                        {yieldUnit === portionUnit ? `ต้นทุน/Batch (${recipeYield} ${yieldUnit})` : `ต้นทุน/${yieldUnit || 'หน่วย'}`}
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-slate-300 mt-0.5">฿{costPerBatchUnit.toFixed(2)}</p>
                    </div>

                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <p className="text-[10px] sm:text-xs font-bold text-cyan-300">ต้นทุนต่อ 1 {portionUnit || 'หน่วย'}</p>
                      <p className="text-sm sm:text-base font-black text-cyan-400 mt-0.5">
                        ฿{unitCost.toFixed(2)}
                      </p>
                    </div>

                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <p className="text-[10px] sm:text-xs text-slate-300 font-medium">กำไรส่วนต่าง (%)</p>
                      <p className={`text-sm sm:text-base font-black mt-0.5 ${profitMargin >= 50 ? 'text-emerald-400' : profitMargin > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {profitMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recipe Ingredients Builder Table */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base flex items-center gap-2">
                      <ScaleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400" />
                      ส่วนผสมตามสูตร (Ingredients List)
                    </h3>
                    {canMaintain && (
                      <button
                        type="button"
                        onClick={handleAddRecipeRow}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        <PlusIcon className="w-4 h-4" />
                        เพิ่มส่วนผสม
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto border border-slate-700/80 rounded-xl bg-slate-900/80 shadow-inner">
                    <table className="w-full text-left text-xs sm:text-sm min-w-[620px]">
                      <thead className="bg-slate-800 text-slate-200 font-semibold border-b border-slate-700">
                        <tr>
                          <th className="p-3">ส่วนผสม / สูตรย่อย (Ingredient / Sub-recipe)</th>
                          <th className="p-3 w-32">ปริมาณที่ใช้</th>
                          <th className="p-3 w-28">หน่วยนับ</th>
                          <th className="p-3 w-32 text-right">ต้นทุน/หน่วย</th>
                          <th className="p-3 w-36 text-right">ต้นทุนรวม (฿)</th>
                          <th className="p-3 w-16 text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {loadingRecipe ? (
                          <tr>
                            <td colSpan="6" className="p-6 text-center text-slate-400">กำลังโหลดสูตร...</td>
                          </tr>
                        ) : recipeItems.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="p-8 text-center text-slate-400">
                              ยังไม่มีส่วนผสมในสูตรนี้ คลิก "เพิ่มส่วนผสม" เพื่อสร้างสูตร
                            </td>
                          </tr>
                        ) : (
                          recipeItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                              <td className="p-3">
                                <select
                                  disabled={!canMaintain}
                                  value={item.ingredient_id}
                                  onChange={(e) => handleRecipeRowChange(idx, 'ingredient_id', e.target.value)}
                                  className="w-full px-3 py-1.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:opacity-80"
                                >
                                  {allAvailableIngredients.map(ing => (
                                    <option key={ing.id} value={ing.id}>
                                      {ing.name} {ing.is_sub_recipe ? '[สูตรย่อย/สินค้า]' : (ing.is_product ? '[สินค้า]' : '[วัตถุดิบ]')} (฿{ing.cost_per_unit}/{ing.unit})
                                    </option>
                                  ))}
                                </select>
                                {item.sub_recipe && item.sub_recipe.items && item.sub_recipe.items.length > 0 && (
                                  <div className="mt-2 p-2 bg-indigo-950/80 border border-indigo-700/60 rounded-lg text-xs space-y-1">
                                    <div className="flex items-center justify-between text-indigo-300 font-bold">
                                      <span className="flex items-center gap-1">
                                        <BeakerIcon className="w-3.5 h-3.5 text-amber-400" />
                                        สูตรย่อย: {item.sub_recipe.name}
                                      </span>
                                      <span className="text-cyan-300">(ต้นทุน ฿{item.sub_recipe.unit_cost}/หน่วย)</span>
                                    </div>
                                    <div className="text-[11px] text-slate-300">
                                      ส่วนผสมย่อย ({item.sub_recipe.items.length} รายการ): {' '}
                                      <span className="text-slate-200 font-semibold">
                                        {item.sub_recipe.items.map(s => `${s.name} ${s.quantity}${s.unit}`).join(', ')}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder="0"
                                  disabled={!canMaintain}
                                  value={item.quantity}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => handleRecipeRowChange(idx, 'quantity', e.target.value)}
                                  className="w-full px-3 py-1.5 border border-slate-600 rounded-lg text-sm text-center font-bold bg-slate-800 text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:opacity-80"
                                />
                              </td>
                              <td className="p-3">
                                <select
                                  disabled={!canMaintain}
                                  value={item.unit}
                                  onChange={(e) => handleRecipeRowChange(idx, 'unit', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-indigo-500/50 rounded-lg text-xs font-bold text-indigo-300 bg-slate-800 focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:opacity-80"
                                >
                                  {getCompatibleUnits(allAvailableIngredients.find(i => i.id === item.ingredient_id)?.unit || item.unit, item.unit).map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-3 text-right font-mono text-xs text-slate-300">
                                ฿{(item.cost_per_unit || 0) < 1 ? Number(item.cost_per_unit || 0).toFixed(4) : Number(item.cost_per_unit || 0).toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-extrabold text-cyan-400">
                                ฿{((item.quantity || 0) * (item.cost_per_unit || 0)).toFixed(2)}
                              </td>
                              <td className="p-3 text-center">
                                {canMaintain ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRecipeRow(idx)}
                                    className="p-1 hover:bg-rose-950/60 text-rose-400 rounded-lg transition-colors"
                                    title="ลบส่วนผสมนี้"
                                  >
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <span className="text-slate-600 text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recipe Deduction on POS Sale (opt-in per product) */}
                <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-4 text-white space-y-3 shadow-lg">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h4 className="text-sm font-extrabold text-amber-300 flex items-center gap-2">
                        <span>🧾</span>
                        <span>Recipe Deduction — ตัดวัตถุดิบอัตโนมัติเมื่อขาย POS</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        เปิดเฉพาะสินค้าที่ต้องการ (ไม่ใช่ทุกเมนู) — สินค้าที่เปิดไว้จะหักสต็อกสำเร็จรูปก่อน ส่วนที่ขาดจึงตัดวัตถุดิบตามสูตร (หารด้วย {portionCount || 1} {portionUnit || 'หน่วย'}/Batch)
                      </p>
                      {deductOnSale ? (
                        <p className="text-[11px] font-bold text-rose-300 mt-1">
                          ✅ เปิดอยู่: ขายเกินสต็อกสำเร็จรูปได้ แต่จะบล็อกการขายเมื่อวัตถุดิบตามสูตรไม่พอ
                        </p>
                      ) : (
                        <p className="text-[11px] font-bold text-slate-500 mt-1">
                          ⬜ ขณะนี้ปิดอยู่: การขายถูกจำกัดตามสต็อกสำเร็จรูป (ขายเกินสต็อกไม่ได้)
                        </p>
                      )}
                    </div>
                    <label className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-extrabold transition-all shrink-0 ${canMaintain ? 'cursor-pointer' : 'opacity-80 cursor-default'} ${deductOnSale ? 'bg-emerald-600/90 border-emerald-400 text-white shadow-md shadow-emerald-950' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'}`}>
                      <input
                        type="checkbox"
                        disabled={!canMaintain}
                        checked={!!deductOnSale}
                        onChange={(e) => { setDeductOnSale(e.target.checked); setIsDirty(true); }}
                        className="w-5 h-5 accent-emerald-500 cursor-pointer"
                      />
                      <span>{deductOnSale ? '✅ เปิดตัดสูตรสินค้านี้' : '⬜ ปิด (ไม่ตัดสูตรสินค้านี้)'}</span>
                    </label>
                  </div>
                  {deductOnSale && recipeItems.length > 0 && (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                      <p className="text-[11px] font-bold text-slate-300 mb-1.5">
                        ขาย 1 {portionUnit || 'หน่วย'} จะตัดวัตถุดิบ:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {recipeItems.map((item, idx) => {
                          const portionQty = Math.max(0.0001, parseFloat(portionCount) || 1);
                          const perUnit = Number(((parseFloat(item.quantity) || 0) / portionQty).toFixed(4));
                          return (
                            <span key={idx} className="text-[11px] font-semibold bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-cyan-300">
                              {item.ingredient_name}: -{perUnit} {item.unit}
                            </span>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1.5">
                        * มีผลกับ “{selectedProduct?.name}” และสินค้าขาย POS ที่ผูกสูตรนี้เมื่อกด “บันทึกสูตร”
                      </p>
                    </div>
                  )}
                </div>

                {/* Mapped Finished POS Sales Products Section */}
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 text-white space-y-3 shadow-lg">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-700/70 pb-2.5">
                    <h4 className="text-xs font-extrabold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                      <ShoppingBagIcon className="w-4 h-4 text-emerald-400" />
                      🔗 ผูกสูตรนี้เข้ากับสินค้าสำเร็จรูปขาย POS (Mapped Finished Sale Products)
                    </h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="🔍 ค้นหาเมนูสินค้า..."
                        value={mappingSearch}
                        onChange={(e) => setMappingSearch(e.target.value)}
                        className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none w-36"
                      />
                      {(() => {
                        const isMainSale = selectedProduct?.is_raw_material === 0 || selectedProduct?.is_raw_material === false;
                        const totalCount = (isMainSale ? 1 : 0) + targetMappedProductIds.filter(id => id !== selectedProduct?.id).length;
                        return (
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${totalCount > 0 ? 'bg-emerald-950 text-emerald-300 border-emerald-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                            {totalCount > 0 ? `ผูกแล้ว ${totalCount} รายการ` : 'ยังไม่ได้ผูกเมนูขาย POS'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    เลือกเมนูสินค้าขายสำเร็จรูปใน POS ที่ต้องการให้ใช้สูตรนี้ (เมื่อบันทึก ระบบจะคัดลอกส่วนผสมและอัปเดตราคาทุน ฿{unitCost.toFixed(2)}/หน่วย ไปยังสินค้าที่เลือกทันที เพื่อให้ POS ตัดสต็อกวัตถุดิบให้อัตโนมัติเมื่อมีการขาย)
                  </p>

                  {/* Active / Primary & Mapped POS Finished Sale Products Badges Container */}
                  <div className="flex flex-wrap gap-2 p-2.5 bg-slate-800/60 rounded-xl border border-emerald-500/40">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1 self-center mr-1">
                      รายการสินค้าขาย POS ที่ผูกสูตรนี้:
                    </span>

                    {/* 1. Primary Selected Product Badge */}
                    {selectedProduct && (
                      (selectedProduct.is_raw_material === 0 || selectedProduct.is_raw_material === false) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-900/90 border border-emerald-400 rounded-lg text-xs font-extrabold text-emerald-200 shadow-sm">
                          <span>⭐ {selectedProduct.name} (เมนูหลัก POS)</span>
                          <span className="text-[10px] text-emerald-300 font-mono">฿{selectedProduct.selling_price || 0}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-950/80 border border-amber-500/60 rounded-lg text-xs font-semibold text-amber-300">
                          <span>📦 {selectedProduct.name} (สูตรเตรียม)</span>
                        </span>
                      )
                    )}

                    {/* 2. Additional Mapped Sale Product Badges */}
                    {targetMappedProductIds.filter(id => id !== selectedProduct?.id).map(id => {
                      const prod = products.find(p => p.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/90 border border-emerald-500 rounded-lg text-xs font-bold text-emerald-300 shadow-xs"
                        >
                          <span>🛍️ {prod ? prod.name : id}</span>
                          {prod && <span className="text-[10px] text-emerald-400 font-mono">฿{prod.selling_price || 0}</span>}
                          {canMaintain && (
                            <button
                              type="button"
                              onClick={() => {
                                setTargetMappedProductIds(prev => prev.filter(pId => pId !== id));
                                setIsDirty(true);
                              }}
                              className="ml-1 text-slate-400 hover:text-rose-400 font-bold focus:outline-none text-sm"
                              title="ยกเลิกการผูกสินค้านี้"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Selectable POS Products Table (1 Recipe -> 1 Finished Goods) */}
                  <div className="overflow-x-auto rounded-xl border border-slate-700 max-h-48 overflow-y-auto shadow-inner">
                    <table className="w-full text-left text-xs bg-slate-900/90 text-slate-200">
                      <thead className="bg-slate-800 text-slate-300 font-bold sticky top-0 border-b border-slate-700">
                        <tr>
                          <th className="p-2 text-center w-12">เลือก</th>
                          <th className="p-2">SKU</th>
                          <th className="p-2">ชื่อสินค้าขาย POS (Product Name)</th>
                          <th className="p-2">ประเภท</th>
                          <th className="p-2 text-right">ราคาขาย</th>
                          <th className="p-2 text-center">สถานะผูกสูตร</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {mappingPaging.paged.map(p => {
                            const activeMappedId = targetMappedProductIds[0] || selectedProduct?.id;
                            const isSelected = activeMappedId === p.id;
                            const isMain = p.id === selectedProduct?.id;
                            return (
                              <tr
                                key={p.id}
                                onClick={() => {
                                  setTargetMappedProductIds([p.id]);
                                  setIsDirty(true);
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isSelected 
                                    ? 'bg-emerald-950/90 text-emerald-200 font-semibold border-l-2 border-emerald-400' 
                                    : 'hover:bg-slate-800/60 text-slate-300'
                                }`}
                              >
                                <td className="p-2 text-center">
                                  <input
                                    type="radio"
                                    name="mapped_product_single_select"
                                    checked={isSelected}
                                    onChange={() => {
                                      setTargetMappedProductIds([p.id]);
                                      setIsDirty(true);
                                    }}
                                    className="w-4 h-4 text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-400 cursor-pointer"
                                  />
                                </td>
                                <td className="p-2 font-mono text-slate-400 text-[11px]">{p.sku || '-'}</td>
                                <td className="p-2 font-bold text-white">
                                  {isMain && <span className="mr-1 text-amber-400">⭐</span>}
                                  {p.name}
                                </td>
                                <td className="p-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${p.is_raw_material === 1 ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'}`}>
                                    {p.is_raw_material === 1 ? '📦 สูตรเตรียม' : '🛍️ ขาย POS'}
                                  </span>
                                </td>
                                <td className="p-2 text-right font-mono text-emerald-400 font-bold">฿{p.selling_price || 0}</td>
                                <td className="p-2 text-center">
                                  {isSelected ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded-md border border-emerald-500/60">
                                      ✓ ผูกสูตรนี้อยู่
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500">ไม่ได้ผูก</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    <Pagination
                      page={mappingPaging.page}
                      totalPages={mappingPaging.totalPages}
                      perPage={mappingPaging.perPage}
                      onPageChange={mappingPaging.setPage}
                      onPerPageChange={mappingPaging.setPerPage}
                      rangeStart={mappingPaging.rangeStart}
                      rangeEnd={mappingPaging.rangeEnd}
                      total={mappingPaging.total}
                    />
                  </div>
                </div>

                {/* Actions Footer (Centered & Compact Button) */}
                <div className="flex justify-center pt-4 border-t border-slate-700">
                  {canMaintain ? (
                    <button
                      type="button"
                      onClick={() => handleSaveRecipe(true)}
                      disabled={savingRecipe || loadingRecipe || recipeLoadedId !== selectedProduct?.id || recipeItems.length === 0}
                      title={recipeLoadedId !== selectedProduct?.id ? 'กำลังโหลดข้อมูลสูตรจากเซิร์ฟเวอร์...' : undefined}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-md shadow-emerald-900/30"
                    >
                      <CurrencyDollarIcon className="w-4 h-4 shrink-0" />
                      <span>{savingRecipe ? 'กำลังบันทึกสูตร...' : (loadingRecipe || recipeLoadedId !== selectedProduct?.id ? 'กำลังโหลดสูตร...' : `บันทึกสูตร + อัปเดตราคาทุน (฿${unitCost.toFixed(2)}/หน่วย)`)}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-400 border border-slate-700 rounded-xl text-xs font-semibold">
                      <span>👁️ โหมดดูสูตรอาหารเท่านั้น (ไม่มีสิทธิ์แก้ไขหรือบันทึกสูตร)</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Ingredient */}
      {showIngredientModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-800">
              {editingIngredient ? 'แก้ไขข้อมูลวัตถุดิบ' : 'เพิ่มวัตถุดิบใหม่'}
            </h3>
            <form onSubmit={handleSaveIngredient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">SKU / รหัสวัตถุดิบ (ไม่บังคับ)</label>
                <input
                  type="text"
                  placeholder="เช่น ING-001"
                  value={ingredientForm.sku}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, sku: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ชื่อวัตถุดิบ *</label>
                <input
                  type="text"
                  placeholder="เช่น เมล็ดกาแฟ, นมสดสด, ไซรัปวานิลลา"
                  value={ingredientForm.name}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">หน่วยนับ *</label>
                  <select
                    value={ingredientForm.unit}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {getAvailableUnits(ingredientForm.unit).map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">ต้นทุนต่อหน่วย (บาท)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={ingredientForm.cost_per_unit}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, cost_per_unit: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <WeightUnitCalculator
                onApplyCost={(cost, targetUnit) => {
                  setIngredientForm(f => ({ ...f, cost_per_unit: cost, unit: targetUnit || f.unit }));
                }}
                defaultUnit={ingredientForm.unit || 'g'}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">สต็อกเริ่มต้น</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={ingredientForm.quantity}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, quantity: e.target.value })}
                    disabled={!!editingIngredient}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">จุดเตือนสต็อกต่ำ</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="50"
                    value={ingredientForm.reorder_level}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, reorder_level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowIngredientModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-indigo-200"
                >
                  บันทึกวัตถุดิบ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Adjust Ingredient Stock */}
      {showAdjustModal && adjustingIngredient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-800">
              ปรับสต็อกวัตถุดิบ: {adjustingIngredient.name}
            </h3>
            <p className="text-xs text-slate-500">
              จำนวนคงเหลือปัจจุบัน: <span className="font-bold text-slate-800">{adjustingIngredient.quantity} {adjustingIngredient.unit}</span>
            </p>
            <form onSubmit={handleSaveStockAdjust} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ประเภทการปรับ</label>
                <select
                  value={adjustForm.type}
                  onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                >
                  <option value="receive">รับเข้าสต็อก (+) / Receive</option>
                  <option value="issue">จ่ายออกสต็อก (-) / Issue</option>
                  <option value="adjust">ปรับปรุงสต็อก (Adjust)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">จำนวนที่ปรับเปลี่ยน ({adjustingIngredient.unit})</label>
                <input
                  type="number"
                  step="any"
                  placeholder="เช่น 100"
                  value={adjustForm.quantity_change}
                  onChange={(e) => setAdjustForm({ ...adjustForm, quantity_change: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">หมายเหตุ / เหตุผลการปรับ</label>
                <input
                  type="text"
                  placeholder="เช่น ซื้อวัตถุดิบเพิ่ม, ของเสีย/หมดอายุ"
                  value={adjustForm.remark}
                  onChange={(e) => setAdjustForm({ ...adjustForm, remark: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-indigo-200"
                >
                  บันทึกการปรับสต็อก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MASTER RECIPE CREATOR MODAL */}
      {showMasterModal && (() => {
        const masterTotalBatchCost = (masterForm.items || []).reduce((sum, item) => {
          const ingMatch = allAvailableIngredients.find(i => i.id === item.ingredient_id);
          if (!ingMatch) return sum;
          const calc = calculateItemCostAndQty(ingMatch, item.unit || ingMatch.unit, ingMatch.unit, parseFloat(item.quantity) || 0);
          return sum + (calc.item_cost || 0);
        }, 0);

        const masterBatchYieldNum = Math.max(0.0001, parseFloat(masterForm.recipe_yield) || 1);
        const masterPortionNum = Math.max(0.0001, parseFloat(masterForm.portion_count) || 1);

        const masterCostPerYieldUnit = masterTotalBatchCost / masterBatchYieldNum;
        const masterUnitCost = masterTotalBatchCost / masterPortionNum;
        const masterSellingPrice = parseFloat(masterForm.selling_price) || 0;
        const masterTotalBatchSales = masterSellingPrice * masterPortionNum;
        const masterProfitPerUnit = masterSellingPrice - masterUnitCost;
        const masterProfitMargin = masterSellingPrice > 0 ? (masterProfitPerUnit / masterSellingPrice) * 100 : 0;

        return (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-slate-900 text-white rounded-2xl max-w-3xl w-full border border-slate-700 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
              {/* Sticky Header */}
              <div className="flex justify-between items-center px-4 sm:px-6 py-3.5 border-b border-slate-800 shrink-0 bg-slate-900/90 backdrop-blur">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <BeakerIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400 shrink-0" />
                  <span>สร้างสูตรอาหารใหม่ (Create Master Recipe)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowMasterModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-xl font-bold transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Body */}
              <form onSubmit={handleSaveMasterRecipe} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      ชื่อสูตรอาหาร <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น สูตรถั่วลูกไก่บดต้ม, สูตรน้ำเต้าหู้สด"
                      value={masterForm.name}
                      onChange={(e) => setMasterForm({ ...masterForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">หมวดหมู่สูตร</label>
                    <input
                      type="text"
                      placeholder="เช่น เบสเตรียมอาหาร, ซอส, เครื่องดื่ม"
                      value={masterForm.category}
                      onChange={(e) => setMasterForm({ ...masterForm, category: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Batch Yield & Selling Portion Configuration */}
                <div className="bg-slate-800/60 p-3 sm:p-4 rounded-xl border border-slate-700 space-y-3">
                  <h4 className="text-xs font-extrabold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📏</span>
                    <span>การตั้งค่าผลผลิต (Yield) & ปริมาณขาย</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        ผลผลิต Batch รวม (Yield Qty)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={masterForm.recipe_yield}
                          onChange={(e) => setMasterForm({ ...masterForm, recipe_yield: e.target.value })}
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                        <select
                          value={masterForm.yield_unit || 'g'}
                          onChange={(e) => setMasterForm({ ...masterForm, yield_unit: e.target.value })}
                          className="w-24 sm:w-28 px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-indigo-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none shrink-0"
                        >
                          {UNITS.map(u => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        แบ่งผลิตได้ (หน่วยขาย)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          placeholder="เช่น 10"
                          value={masterForm.portion_count}
                          onChange={(e) => setMasterForm({ ...masterForm, portion_count: e.target.value })}
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                        <select
                          value={masterForm.portion_unit || 'ถุง'}
                          onChange={(e) => setMasterForm({ ...masterForm, portion_unit: e.target.value })}
                          className="w-24 sm:w-28 px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-indigo-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none shrink-0"
                        >
                          {UNITS.map(u => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        ราคาขายตั้งไว้ / 1 {masterForm.portion_unit || 'หน่วย'} (฿)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={masterForm.selling_price}
                        onChange={(e) => setMasterForm({ ...masterForm, selling_price: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm font-extrabold text-emerald-400 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        ยอดขายรวมทั้ง Batch (฿)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={masterTotalBatchSales > 0 ? Number(masterTotalBatchSales.toFixed(2)) : ''}
                        onChange={(e) => {
                          const batchSalesVal = parseFloat(e.target.value) || 0;
                          const calculatedPricePerUnit = masterPortionNum > 0 ? (batchSalesVal / masterPortionNum).toFixed(2) : '0';
                          setMasterForm({ ...masterForm, selling_price: calculatedPricePerUnit });
                        }}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm font-extrabold text-emerald-300 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Recipe Deduction opt-in (applies to this recipe + mapped POS products) */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs transition-all cursor-pointer ${masterForm.deduct_recipe_on_sale ? 'bg-emerald-950/60 border-emerald-500/60' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}>
                  <input
                    type="checkbox"
                    checked={!!masterForm.deduct_recipe_on_sale}
                    onChange={(e) => setMasterForm({ ...masterForm, deduct_recipe_on_sale: e.target.checked ? 1 : 0 })}
                    className="w-5 h-5 mt-0.5 accent-emerald-500 cursor-pointer shrink-0"
                  />
                  <span>
                    <span className="font-extrabold text-amber-300">🧾 เปิด Recipe Deduction เมื่อขาย POS</span>
                    <span className="block text-[11px] text-slate-400 font-normal mt-0.5">
                      ตัดวัตถุดิบอัตโนมัติตามสูตรเมื่อมีการขาย (หักสต็อกสำเร็จรูปก่อน ส่วนที่ขาดจึงตัดวัตถุดิบ) — มีผลกับสูตรนี้และสินค้าขาย POS ที่ผูกไว้
                    </span>
                  </span>
                </label>

                {/* Financial Live Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center">
                  <div className="bg-slate-900/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
                    <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">ต้นทุนรวม Batch</p>
                    <p className="text-xs sm:text-sm font-extrabold text-white mt-0.5">฿{masterTotalBatchCost.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-900/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
                    <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">ต้นทุน/1 {masterForm.yield_unit || 'หน่วย'}</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-300 mt-0.5">฿{masterCostPerYieldUnit.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-900/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
                    <p className="text-[10px] sm:text-[11px] text-indigo-300 font-bold truncate">ต้นทุน/1 {masterForm.portion_unit || 'หน่วยขาย'}</p>
                    <p className="text-xs sm:text-sm font-extrabold text-cyan-400 mt-0.5">฿{masterUnitCost.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-900/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
                    <p className="text-[10px] sm:text-[11px] text-emerald-400 font-bold truncate">กำไร / % Margin</p>
                    <p className={`text-xs sm:text-sm font-extrabold mt-0.5 ${masterProfitMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ฿{masterProfitPerUnit.toFixed(2)} ({masterProfitMargin.toFixed(1)}%)
                    </p>
                  </div>
                </div>

                {/* Target Finished Sales Product Mapping Section inside Master Modal */}
                <div className="bg-slate-800/60 p-3 sm:p-4 rounded-xl border border-slate-700 space-y-2">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1.5">
                    <h4 className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShoppingBagIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>ผูกสูตรนี้กับสินค้าสำเร็จรูปขาย POS</span>
                    </h4>
                    <span className="text-[11px] text-slate-300 font-bold bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-700 self-start sm:self-auto">
                      {(masterForm.target_product_ids || []).length > 0 ? `เลือกแล้ว ${masterForm.target_product_ids.length} รายการ` : 'ยังไม่ได้เลือก'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    เมื่อบันทึกสูตร ระบบจะคัดลอกส่วนผสมและอัปเดตราคาทุนไปยังสินค้าที่เลือกให้อัตโนมัติ
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pt-1">
                    {products
                      .filter(p => {
                        const isPureRaw = (p.is_raw_material === 1 || p.is_raw_material === true || p.category_name === 'วัตถุดิบ' || (p.category_name && p.category_name.includes('วัตถุดิบ')))
                          && (!p.selling_price || parseFloat(p.selling_price) <= 0)
                          && (!p.sku || !p.sku.startsWith('REC'));
                        return !isPureRaw && p.is_raw_material !== 1 && p.is_raw_material !== true;
                      })
                      .map(p => {
                        const isChecked = (masterForm.target_product_ids || []).includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            isChecked 
                              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-semibold' 
                              : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const currentIds = masterForm.target_product_ids || [];
                              if (e.target.checked) {
                                setMasterForm({ ...masterForm, target_product_ids: [...currentIds, p.id] });
                              } else {
                                setMasterForm({ ...masterForm, target_product_ids: currentIds.filter(id => id !== p.id) });
                              }
                            }}
                            className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-400 cursor-pointer shrink-0"
                          />
                          <span className="truncate flex-1">{p.name}</span>
                          <span className="text-[11px] text-emerald-400 font-mono font-bold shrink-0">฿{p.selling_price}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Ingredients Builder inside Modal */}
                <div className="space-y-3 pt-1">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs sm:text-sm font-bold text-indigo-300 flex items-center gap-1.5">
                      <span>ส่วนผสมในสูตร ({masterForm.items.length} รายการ)</span>
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddMasterItem}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>+ เพิ่มส่วนผสม</span>
                    </button>
                  </div>

                  {/* Responsive Ingredient Items List */}
                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {masterForm.items.map((item, idx) => {
                      const ingMatch = allAvailableIngredients.find(i => i.id === item.ingredient_id);
                      const baseUnit = ingMatch ? ingMatch.unit : item.unit;
                      const compatibleUnits = getCompatibleUnits(baseUnit, item.unit);
                      const calc = ingMatch ? calculateItemCostAndQty(ingMatch, item.unit || baseUnit, ingMatch.unit, parseFloat(item.quantity) || 0) : { item_cost: 0 };

                      return (
                        <div key={idx} className="bg-slate-800/90 p-2.5 sm:p-3 rounded-xl border border-slate-700/80 space-y-2">
                          {/* Top: Select Ingredient & Delete Button */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-slate-400 w-4 text-center shrink-0">#{idx + 1}</span>
                            <select
                              value={item.ingredient_id}
                              onChange={(e) => handleMasterItemChange(idx, 'ingredient_id', e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:ring-1 focus:ring-indigo-400 focus:outline-none"
                            >
                              {allAvailableIngredients.map(ing => (
                                <option key={ing.id} value={ing.id}>
                                  {ing.name} {ing.is_sub_recipe ? '[สูตรย่อย/สินค้า]' : (ing.is_product ? '[สินค้า]' : '[วัตถุดิบ]')} (฿{ing.cost_per_unit}/{ing.unit})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleRemoveMasterItem(idx)}
                              className="p-1.5 text-rose-400 hover:bg-rose-950/80 hover:text-rose-300 rounded-lg transition-colors shrink-0"
                              title="ลบส่วนผสมนี้"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Bottom: Quantity, Unit & Computed Cost */}
                          <div className="flex items-center justify-between gap-2 pl-6">
                            <div className="flex items-center gap-1.5 flex-1">
                              <span className="text-[11px] text-slate-400 font-medium shrink-0">ใช้:</span>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="ปริมาณ"
                                value={item.quantity}
                                onChange={(e) => handleMasterItemChange(idx, 'quantity', e.target.value)}
                                className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-center font-bold text-white focus:outline-none"
                              />
                              <select
                                value={item.unit || baseUnit || 'g'}
                                onChange={(e) => handleMasterItemChange(idx, 'unit', e.target.value)}
                                className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-indigo-300 focus:outline-none shrink-0"
                              >
                                {compatibleUnits.map(u => (
                                  <option key={u.value} value={u.value}>{u.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-extrabold text-amber-300 font-mono">
                                ฿{(calc.item_cost || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sticky Footer */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowMasterModal(false)}
                    className="px-4 py-2 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={savingRecipe}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-md shadow-indigo-900/50"
                  >
                    {savingRecipe ? 'กำลังบันทึก...' : 'บันทึกสูตรอาหาร'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* TAB 4: WORK ORDERS HISTORY & LOGS */}
      {activeTab === 'work_orders' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Header & Controls Bar */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircleIcon className="w-6 h-6 text-amber-500" />
                <span>ประวัติการผลิต & เลขที่ใบสั่งผลิต (Work Orders Log)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                ค้นหา และตรวจสอบประวัติการผลิตย้อนหลัง รายการวัตถุดิบที่ตัดสต็อกจริง และผู้ดำเนินการ
              </p>
            </div>

            {/* Filter Controls: Date Range & Search & Refresh */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
              {/* Date Range Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-600 shadow-sm w-full sm:w-auto">
                <span className="font-semibold text-slate-500 shrink-0">📅 ช่วงวันที่:</span>
                <input
                  type="date"
                  value={woStartDate}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setWoStartDate(newStart);
                    fetchWorkOrders(workOrderSearch, newStart, woEndDate);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  title="วันที่เริ่มต้น"
                />
                <span className="text-slate-400 shrink-0">-</span>
                <input
                  type="date"
                  value={woEndDate}
                  onChange={(e) => {
                    const newEnd = e.target.value;
                    setWoEndDate(newEnd);
                    fetchWorkOrders(workOrderSearch, woStartDate, newEnd);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  title="วันที่สิ้นสุด"
                />
                {(woStartDate || woEndDate) && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const range = getCurrentMonthRange();
                        setWoStartDate(range.start);
                        setWoEndDate(range.end);
                        fetchWorkOrders(workOrderSearch, range.start, range.end);
                      }}
                      className="px-1.5 py-0.5 text-[10px] text-indigo-600 hover:bg-indigo-50 rounded font-medium transition-colors"
                      title="รีเซ็ตเป็นเดือนปัจจุบัน"
                    >
                      เดือนนี้
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWoStartDate('');
                        setWoEndDate('');
                        fetchWorkOrders(workOrderSearch, '', '');
                      }}
                      className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-200 rounded-md transition-colors"
                      title="ดูทั้งหมด (ล้างตัวกรองวันที่)"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Search Input */}
              <div className="relative flex-1 sm:w-56">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหา WO / สินค้า..."
                  value={workOrderSearch}
                  onChange={(e) => {
                    setWorkOrderSearch(e.target.value);
                    fetchWorkOrders(e.target.value, woStartDate, woEndDate);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white shadow-sm"
                />
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => fetchWorkOrders(workOrderSearch, woStartDate, woEndDate)}
                className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shrink-0 shadow-sm cursor-pointer"
                title="รีเฟรชประวัติการผลิต"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loadingWorkOrders ? 'animate-spin' : ''}`} />
              </button>

              {/* Export Excel Button */}
              <button
                type="button"
                disabled={exportingWOExcel}
                onClick={handleExportWorkOrdersExcel}
                className={`px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer ${exportingWOExcel ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="ดาวน์โหลด Excel รายการใบสั่งผลิตและวัตถุดิบที่ใช้จริง (WO Items)"
              >
                <span>📥</span>
                <span>{exportingWOExcel ? 'กำลังส่งออก...' : 'ส่งออก Excel (WO)'}</span>
              </button>
            </div>
          </div>

          {/* Statistics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900 text-white p-4 rounded-xl shadow-inner">
            <div>
              <p className="text-xs text-slate-400 font-semibold">
                จำนวนใบสั่งผลิต {woStartDate || woEndDate ? '(ตามช่วงวันที่)' : 'ทั้งหมด'}
              </p>
              <p className="text-xl font-extrabold text-amber-300 mt-0.5">{sortedWorkOrders.length} รายการ</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">ผลผลิตรวมที่ได้รับเข้าสต็อก</p>
              <p className="text-xl font-extrabold text-cyan-300 mt-0.5">
                +{sortedWorkOrders.reduce((sum, wo) => sum + (parseFloat(wo.produced_yield) || 0), 0).toFixed(2)} หน่วย
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">ต้นทุนวัตถุดิบที่ใช้ผลิตรวม</p>
              <p className="text-xl font-extrabold text-emerald-400 mt-0.5">
                ฿{sortedWorkOrders.reduce((sum, wo) => sum + (parseFloat(wo.total_cost) || 0), 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* 1. Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-800 text-slate-200 font-bold uppercase text-[11px] tracking-wider select-none">
                <tr>
                  <th className="p-3 cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleWoSort('wo_number')}>
                    <div className="flex items-center gap-1.5">
                      <span>เลขที่ WO</span>
                      <span className="text-amber-400 text-xs">{woSortField === 'wo_number' ? (woSortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleWoSort('created_at')}>
                    <div className="flex items-center gap-1.5">
                      <span>วัน-เวลา ที่ผลิต</span>
                      <span className="text-amber-400 text-xs">{woSortField === 'created_at' ? (woSortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleWoSort('product_name')}>
                    <div className="flex items-center gap-1.5">
                      <span>สูตร / สินค้า</span>
                      <span className="text-amber-400 text-xs">{woSortField === 'product_name' ? (woSortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:bg-slate-700 transition-colors text-center" onClick={() => handleWoSort('batch_count')}>
                    <div className="flex items-center justify-center gap-1.5">
                      <span>จำนวน Batch</span>
                      <span className="text-amber-400 text-xs">{woSortField === 'batch_count' ? (woSortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:bg-slate-700 transition-colors text-right" onClick={() => handleWoSort('produced_yield')}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>ผลผลิตที่รับเข้า</span>
                      <span className="text-amber-400 text-xs">{woSortField === 'produced_yield' ? (woSortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:bg-slate-700 transition-colors text-right" onClick={() => handleWoSort('total_cost')}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>ต้นทุนรวม (฿)</span>
                      <span className="text-amber-400 text-xs">{woSortField === 'total_cost' ? (woSortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:bg-slate-700 transition-colors text-center" onClick={() => handleWoSort('user_name')}>
                    <div className="flex items-center justify-center gap-1.5">
                      <span>ผู้ดำเนินการ</span>
                      <span className="text-amber-400 text-xs">{woSortField === 'user_name' ? (woSortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="p-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingWorkOrders ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-400">
                      กำลังโหลดประวัติการผลิต Work Orders...
                    </td>
                  </tr>
                ) : sortedWorkOrders.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-400">
                      ยังไม่มีประวัติการสั่งผลิตในระบบ (กดผลิตสูตรในคลังสูตรอาหารเพื่อสร้าง WO ใหม่)
                    </td>
                  </tr>
                ) : (
                  woPaging.paged.map((wo) => (
                    <tr key={wo.id} className={`hover:bg-slate-50/80 transition-colors ${wo.status === 'cancelled' ? 'opacity-60 bg-rose-50/20' : ''}`}>
                      <td className="p-3 font-mono font-extrabold text-indigo-600">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{wo.wo_number}</span>
                          {wo.status === 'cancelled' && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded-md">
                              ยกเลิกแล้ว
                            </span>
                          )}
                          {(wo.status === 'รออนุมัติ' || wo.status === 'pending_approval') && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-300 px-1.5 py-0.2 rounded-md animate-pulse">
                              ⏳ รออนุมัติ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-slate-500 text-xs">
                        {new Date(wo.created_at).toLocaleString('th-TH')}
                      </td>
                      <td className="p-3 font-bold text-slate-800">
                        <span className={wo.status === 'cancelled' ? 'line-through text-slate-500' : ''}>
                          {wo.product_name}
                        </span>
                      </td>
                      <td className="p-3 text-center font-extrabold text-slate-700">
                        {wo.batch_count} Batch
                      </td>
                      <td className="p-3 text-right font-extrabold text-emerald-600">
                        +{wo.produced_yield} {wo.yield_unit}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">
                        ฿{(parseFloat(wo.total_cost) || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center text-xs text-slate-600 font-semibold">
                        <p>{wo.user_name || wo.user_full_name || 'ผู้ใช้งาน'}</p>
                        {wo.approver_name && (
                          <p className="text-[10px] text-gray-400 font-normal mt-0.5">ผู้อนุมัติ: {wo.approver_name}</p>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenWorkOrderDetail(wo)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                          >
                            🔍 ดูรายการตัดสต็อก
                          </button>
                          {canMaintain && wo.status !== 'cancelled' && wo.status !== 'รออนุมัติ' && wo.status !== 'pending_approval' && (
                            <button
                              type="button"
                              disabled={cancelingWorkOrder}
                              onClick={() => handleCancelWorkOrder(wo)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition-all shadow-2xs hover:border-rose-300 cursor-pointer disabled:opacity-50"
                              title="ยกเลิกใบสั่งผลิตนี้ และคืนสต็อกวัตถุดิบ (เฉพาะกรณีที่ยังไม่มียอดขายสินค้าสำเร็จรูป)"
                            >
                              ✕ ยกเลิก WO
                            </button>
                          )}
                          {(wo.status === 'รออนุมัติ' || wo.status === 'pending_approval') && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg animate-pulse">
                              ⏳ รออนุมัติ
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 2. Mobile / PWA Card List (< md) */}
          <div className="block md:hidden space-y-3">
            {loadingWorkOrders ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                กำลังโหลดประวัติการผลิต Work Orders...
              </div>
            ) : sortedWorkOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                ยังไม่มีประวัติการสั่งผลิตในระบบ (กดผลิตสูตรในคลังสูตรอาหารเพื่อสร้าง WO ใหม่)
              </div>
            ) : (
              woPaging.paged.map((wo) => (
                <div
                  key={wo.id}
                  className={`bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3 ${wo.status === 'cancelled' ? 'opacity-60 bg-rose-50/20' : ''}`}
                >
                  {/* Top: Product Name, WO Number, Date/Time */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-extrabold text-slate-900 text-base leading-snug break-words ${wo.status === 'cancelled' ? 'line-through text-slate-500' : ''}`}>
                        {wo.product_name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          {wo.wo_number}
                        </span>
                        {wo.status === 'รออนุมัติ' || wo.status === 'pending_approval' ? (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md animate-pulse">
                            ⏳ รออนุมัติ
                          </span>
                        ) : wo.status === 'cancelled' ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded-md">
                            ยกเลิกแล้ว
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                            เสร็จสมบูรณ์
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 text-[11px] text-slate-400">
                      {new Date(wo.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>

                  {/* Middle: 3 Key Metrics */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">จำนวน Batch</span>
                      <span className="font-extrabold text-slate-700 text-sm mt-0.5 block">
                        {wo.batch_count} Batch
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">ผลผลิตที่ได้</span>
                      <span className="font-extrabold text-emerald-600 text-sm mt-0.5 block">
                        +{wo.produced_yield} <span className="text-[10px] font-normal">{wo.yield_unit}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">ต้นทุนวัตถุดิบ</span>
                      <span className="font-bold text-slate-800 font-mono text-sm mt-0.5 block">
                        ฿{(parseFloat(wo.total_cost) || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Operator & Action Button */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <div className="text-slate-500 text-[11px]">
                      <div className="flex items-center gap-1">
                        <span>👤</span>
                        <span>{wo.user_name || wo.user_full_name || 'ผู้ใช้งาน'}</span>
                      </div>
                      {wo.approver_name && (
                        <div className="text-[10px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1">
                          <span>🛡️</span>
                          <span>ผู้อนุมัติ: {wo.approver_name}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenWorkOrderDetail(wo)}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer"
                      >
                        <span>🔍</span>
                        <span>ดูรายการตัดสต็อก</span>
                      </button>
                      {canMaintain && (
                        wo.status === 'รออนุมัติ' || wo.status === 'pending_approval' ? (
                          <span className="px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[11px] font-bold flex items-center gap-1">
                            ⏳ รออนุมัติ
                          </span>
                        ) : wo.status !== 'cancelled' ? (
                          <button
                            type="button"
                            disabled={cancelingWorkOrder}
                            onClick={() => handleCancelWorkOrder(wo)}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="ยกเลิกใบสั่งผลิต"
                          >
                            ✕ ยกเลิก
                          </button>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          <div className="pt-2">
            <Pagination
              page={woPaging.page}
              totalPages={woPaging.totalPages}
              perPage={woPaging.perPage}
              onPageChange={woPaging.setPage}
              onPerPageChange={woPaging.setPerPage}
              rangeStart={woPaging.rangeStart}
              rangeEnd={woPaging.rangeEnd}
              total={woPaging.total}
            />
          </div>
        </div>
      )}

      {/* MODAL: Work Order Detail */}
      {selectedWorkOrder && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-700 shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 my-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-700/60 px-2.5 py-0.5 rounded-full font-mono">
                  📋 Work Order: {selectedWorkOrder.wo_number}
                </span>
                <h3 className="text-xl font-extrabold text-white mt-1.5 flex items-center gap-2">
                  <span>รายละเอียดใบสั่งผลิต: {selectedWorkOrder.product_name}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWorkOrder(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
              <div>
                <p className="text-[11px] text-slate-400 font-medium">จำนวนผลิต</p>
                <p className="text-base font-extrabold text-amber-300">{selectedWorkOrder.batch_count} Batch</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">ผลผลิตรับเข้าสต็อก</p>
                <p className="text-base font-extrabold text-cyan-300">+{selectedWorkOrder.produced_yield} {selectedWorkOrder.yield_unit}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">ต้นทุนวัตถุดิบรวม</p>
                <p className="text-base font-extrabold text-emerald-400">฿{(parseFloat(selectedWorkOrder.total_cost) || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">ผู้ดำเนินการ</p>
                <p className="text-xs font-bold text-slate-300 truncate">{selectedWorkOrder.user_name || 'ผู้ใช้งาน'}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">วันหมดอายุ</p>
                <p className={`text-xs font-bold truncate ${selectedWorkOrder.batch_status === 'expired' ? 'text-red-400' : 'text-amber-300'}`}>
                  {selectedWorkOrder.expiry_date
                    ? new Date(selectedWorkOrder.expiry_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : 'ไม่จำกัด'}
                </p>
              </div>
            </div>

            {/* Cancellation & Approver Info */}
            {selectedWorkOrder.status === 'cancelled' && (
              <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs space-y-2.5">
                <div className="flex justify-between items-center text-rose-300 font-bold text-sm pb-2 border-b border-rose-800/40">
                  <span className="flex items-center gap-2 font-black">
                    <span>⚠️</span>
                    <span>ใบสั่งผลิตนี้ถูกยกเลิกแล้ว (Rollback สต็อกแล้ว)</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-900/60 text-rose-300 border border-rose-800">
                    ยกเลิกแล้ว
                  </span>
                </div>

                {/* Grid for Request Time & Approve Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-rose-900/30">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                      <span>⏱️</span>
                      <span>เวลาที่ส่งคำขอยกเลิก:</span>
                    </p>
                    <p className="text-xs font-semibold text-slate-200 font-mono">
                      {selectedWorkOrder.cancel_requested_at ? new Date(selectedWorkOrder.cancel_requested_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : (selectedWorkOrder.created_at ? new Date(selectedWorkOrder.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-')}
                    </p>
                    {selectedWorkOrder.cancel_requester_name && (
                      <p className="text-[10px] text-slate-400">
                        ผู้ส่งคำขอ: <span className="font-medium text-slate-300">{selectedWorkOrder.cancel_requester_name}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-rose-400 flex items-center gap-1">
                      <span>🛡️</span>
                      <span>เวลาที่อนุมัติยกเลิก:</span>
                    </p>
                    <p className="text-xs font-semibold text-rose-300 font-mono">
                      {selectedWorkOrder.approved_at ? new Date(selectedWorkOrder.approved_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </p>
                    {selectedWorkOrder.approver_name && (
                      <p className="text-[10px] text-slate-400">
                        ผู้อนุมัติ: <span className="font-bold text-rose-400">{selectedWorkOrder.approver_name}</span>
                      </p>
                    )}
                  </div>
                </div>

                {selectedWorkOrder.remark && (
                  <p className="text-slate-400 pt-0.5">
                    <b>หมายเหตุ/เหตุผล:</b> {selectedWorkOrder.remark}
                  </p>
                )}
              </div>
            )}

            {(selectedWorkOrder.status === 'รออนุมัติ' || selectedWorkOrder.status === 'pending_approval') && (
              <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs space-y-2 animate-pulse">
                <div className="flex justify-between items-center font-bold text-amber-300 pb-1.5 border-b border-amber-800/40">
                  <span className="flex items-center gap-2 text-sm font-black">
                    <span>⏳</span>
                    <span>กำลังรอผู้จัดการอนุมัติการยกเลิกผ่าน LINE...</span>
                  </span>
                  <span className="text-[10px] bg-amber-900 text-amber-200 px-2 py-0.5 rounded-full font-mono font-bold">
                    PENDING
                  </span>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-amber-900/30 space-y-1">
                  <p className="text-slate-300">
                    <b>เวลาที่ส่งคำขอ:</b> <span className="font-mono">{selectedWorkOrder.cancel_requested_at ? new Date(selectedWorkOrder.cancel_requested_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</span>
                    {selectedWorkOrder.cancel_requester_name && <span className="ml-2 text-slate-400">(โดย {selectedWorkOrder.cancel_requester_name})</span>}
                  </p>
                  <p className="text-amber-200/80">
                    ส่งการแจ้งเตือนไปยัง LINE เรียบร้อยแล้ว ระบบจะอัปเดตสถานะและคืนสต็อกอัตโนมัติเมื่อได้รับการอนุมัติ
                  </p>
                </div>
              </div>
            )}

            {/* Finished Goods Produced Section */}
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3.5 flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-lg">
                  🎁
                </div>
                <div>
                  <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">สินค้าสำเร็จรูปที่รับเข้าสต็อก (Finished Goods Received)</p>
                  <p className="text-sm font-extrabold text-white">{selectedWorkOrder.product_name}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold text-slate-400 block">จำนวนที่เพิ่มเข้าสต็อก</span>
                <span className="text-lg font-black text-emerald-300 font-mono">+{selectedWorkOrder.produced_yield} {selectedWorkOrder.yield_unit}</span>
              </div>
            </div>

            {/* Itemized Raw Material Deductions Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <ScaleIcon className="w-4 h-4 text-indigo-400" />
                <span>รายการวัตถุดิบที่ตัดสต็อกจริง (Itemized Deductions):</span>
              </h4>

              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs bg-slate-950/60">
                  <thead className="bg-slate-800 text-slate-300 font-bold sticky top-0 border-b border-slate-700">
                    <tr>
                      <th className="p-2.5">ชื่อวัตถุดิบ</th>
                      <th className="p-2.5 text-right">ปริมาณที่ตัดสต็อก</th>
                      <th className="p-2.5 text-right">ต้นทุนวัตถุดิบ (฿)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {loadingWorkOrderDetail ? (
                      <tr>
                        <td colSpan="3" className="p-6 text-center text-slate-400">กำลังดึงข้อมูลวัตถุดิบ...</td>
                      </tr>
                    ) : (selectedWorkOrder.items || []).length === 0 ? (
                      <tr>
                        <td colSpan="3" className="p-6 text-center text-slate-400">ไม่พบข้อมูลวัตถุดิบใน WO นี้</td>
                      </tr>
                    ) : (
                      selectedWorkOrder.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-semibold text-white">
                            {item.ingredient_name}
                          </td>
                          <td className="p-2.5 text-right font-extrabold text-cyan-300">
                            -{item.quantity} {item.unit}
                          </td>
                          <td className="p-2.5 text-right font-mono text-emerald-400 font-bold">
                            ฿{(parseFloat(item.cost) || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Remark Box */}
            {selectedWorkOrder.remark && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 text-xs">
                <span className="font-bold text-slate-300">หมายเหตุ: </span>
                <span>{selectedWorkOrder.remark}</span>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div>
                {canMaintain && (selectedWorkOrder.status === 'รออนุมัติ' || selectedWorkOrder.status === 'pending_approval') ? (
                  <span className="text-xs font-bold text-amber-400 bg-amber-950/80 border border-amber-800/80 px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-pulse">
                    <span>⏳</span>
                    <span>รอการอนุมัติผ่าน LINE</span>
                  </span>
                ) : canMaintain && selectedWorkOrder.status !== 'cancelled' ? (
                  <button
                    type="button"
                    disabled={cancelingWorkOrder}
                    onClick={() => handleCancelWorkOrder(selectedWorkOrder)}
                    className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>✕</span>
                    <span>{cancelingWorkOrder ? 'กำลังยกเลิก...' : 'ยกเลิกใบสั่งผลิตนี้ (Rollback สต็อก)'}</span>
                  </button>
                ) : selectedWorkOrder.status === 'cancelled' ? (
                  <span className="text-xs font-bold text-rose-400 bg-rose-950/80 border border-rose-800/80 px-3 py-1 rounded-lg">
                    ⚠️ ใบสั่งผลิตนี้ถูกยกเลิกแล้ว
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedWorkOrder(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Batch Production Summary & Confirmation */}
      <ProductionSummaryModal
        productionModal={productionModal}
        setProductionModal={setProductionModal}
        products={products}
        ingredients={ingredients}
        submittingProduction={submittingProduction}
        handleConfirmProduction={handleConfirmProduction}
      />
    </div>
  );
}

function ProductionSummaryModal({
  productionModal,
  setProductionModal,
  products,
  ingredients,
  submittingProduction,
  handleConfirmProduction
}) {
  if (!productionModal.show || !productionModal.recipe) return null;

  const currentBatchCount = Math.max(1, parseInt(productionModal.batchCount) || 1);
  const prod = products.find(p => p.id === productionModal.recipe.product_id);
  const portionYieldPerBatch = parseFloat(prod?.portion_count) || parseFloat(productionModal.recipe.recipe_yield) || 1;
  const totalYield = Number((portionYieldPerBatch * currentBatchCount).toFixed(2));
  const yieldUnitName = prod?.portion_unit || prod?.unit || 'หน่วย';
  const totalEstimatedCost = Number((productionModal.recipe.calculated_cost * currentBatchCount).toFixed(2));

  const hasAnyDeficit = productionModal.items.some(item => {
    const reqQty = (parseFloat(item.quantity) || 0) * currentBatchCount;
    const ingObj = ingredients.find(i => i.id === item.ingredient_id);
    const rawStock = ingObj ? (parseFloat(ingObj.quantity) || 0) : (parseFloat(item.stock_quantity) || 0);
    const ingBaseUnit = ingObj?.unit || item.ingredient_unit || item.unit || 'g';
    const recipeUnit = item.unit || ingBaseUnit;
    const currStockInRecipeUnit = convertQuantity(rawStock, ingBaseUnit, recipeUnit);
    return currStockInRecipeUnit < reqQty;
  });

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-700 shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 my-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-4">
          <div>
            <span className="text-[11px] font-bold text-amber-300 bg-amber-950/80 border border-amber-700/60 px-2.5 py-0.5 rounded-full">
              🍳 Batch Production Execution
            </span>
            <h3 className="text-xl font-extrabold text-white mt-1.5 flex items-center gap-2">
              <span>ผลิตสูตร: {getValidRecipeName(productionModal.recipe.recipe_name, productionModal.recipe.product_name)}</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setProductionModal({ show: false, recipe: null, batchCount: 1, loadingItems: false, items: [] })}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Batch Counter Selector in Modal */}
        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <p className="text-xs font-bold text-indigo-300">จำนวน Batch ที่ต้องการผลิต</p>
            <p className="text-[11px] text-slate-400">ระบบจะคูณสัดส่วนวัตถุดิบและคำนวณสต็อกล่วงหน้าอัตโนมัติ</p>
          </div>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setProductionModal(prev => ({ ...prev, batchCount: Math.max(1, (parseInt(prev.batchCount) || 1) - 1) }))}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-800 rounded-lg text-sm font-extrabold"
            >
              -
            </button>
            <input
              type="number"
              min="1"
              value={productionModal.batchCount}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setProductionModal(prev => ({ ...prev, batchCount: '' }));
                } else {
                  const parsed = parseInt(val, 10);
                  setProductionModal(prev => ({ ...prev, batchCount: isNaN(parsed) ? '' : Math.max(1, parsed) }));
                }
              }}
              onBlur={() => {
                if (!productionModal.batchCount || productionModal.batchCount < 1) {
                  setProductionModal(prev => ({ ...prev, batchCount: 1 }));
                }
              }}
              className="w-14 text-center bg-transparent text-sm font-extrabold text-cyan-300 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setProductionModal(prev => ({ ...prev, batchCount: (parseInt(prev.batchCount) || 1) + 1 }))}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-800 rounded-lg text-sm font-extrabold"
            >
              +
            </button>
          </div>
        </div>

        {/* Production Yield Impact Summary */}
        <div className="grid grid-cols-2 gap-3 bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-800/60 text-center">
          <div>
            <p className="text-[11px] text-slate-300 font-medium">ผลผลิตสินค้าสำเร็จที่จะได้</p>
            <p className="text-lg font-extrabold text-cyan-300">+{totalYield} {yieldUnitName}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-300 font-medium">ต้นทุนวัตถุดิบรวมประมาณการ</p>
            <p className="text-lg font-extrabold text-emerald-400">฿{totalEstimatedCost}</p>
          </div>
        </div>

        {/* Ingredient Requirements & Stock Check Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <ScaleIcon className="w-4 h-4 text-indigo-400" />
            <span>สรุปการใช้วัตถุดิบและการตรวจสอบสต็อก ({productionModal.items.length} รายการ):</span>
          </h4>

          {/* 1. Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800 max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs bg-slate-950/60">
              <thead className="bg-slate-800 text-slate-300 font-bold sticky top-0 border-b border-slate-700">
                <tr>
                  <th className="p-2.5">วัตถุดิบ</th>
                  <th className="p-2.5 text-right">ต้องใช้ ({currentBatchCount} Batch)</th>
                  <th className="p-2.5 text-right">สต็อกปัจจุบัน</th>
                  <th className="p-2.5 text-center">สถานะวัตถุดิบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {productionModal.loadingItems ? (
                  <tr>
                    <td colSpan="4" className="p-6 text-center text-slate-400">กำลังตรวจสอบข้อมูลวัตถุดิบ...</td>
                  </tr>
                ) : productionModal.items.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-6 text-center text-slate-400">ไม่พบรายการส่วนผสมในสูตรนี้</td>
                  </tr>
                ) : (
                  productionModal.items.map((item, idx) => {
                    const reqQty = Number(((parseFloat(item.quantity) || 0) * currentBatchCount).toFixed(4));
                    const ingObj = ingredients.find(i => i.id === item.ingredient_id);
                    const rawStock = ingObj ? (parseFloat(ingObj.quantity) || 0) : (parseFloat(item.stock_quantity) || 0);
                    const ingBaseUnit = ingObj?.unit || item.ingredient_unit || item.unit || 'g';
                    const recipeUnit = item.unit || ingBaseUnit;

                    const currStockInRecipeUnit = Number(convertQuantity(rawStock, ingBaseUnit, recipeUnit).toFixed(4));
                    const isSufficient = currStockInRecipeUnit >= reqQty;
                    const missing = Number((reqQty - currStockInRecipeUnit).toFixed(4));

                    const displayStockText = (ingBaseUnit && recipeUnit && getUnitFamily(ingBaseUnit) === getUnitFamily(recipeUnit) && ingBaseUnit !== recipeUnit)
                      ? `${currStockInRecipeUnit} ${recipeUnit} (${rawStock} ${ingBaseUnit})`
                      : `${currStockInRecipeUnit} ${recipeUnit}`;

                    return (
                      <tr key={idx} className={isSufficient ? 'hover:bg-slate-800/40' : 'bg-rose-950/40 hover:bg-rose-950/60'}>
                        <td className="p-2.5 font-semibold text-white">
                          {item.ingredient_name || ingObj?.name || 'วัตถุดิบ'}
                        </td>
                        <td className="p-2.5 text-right font-extrabold text-cyan-300">
                          {reqQty} {recipeUnit}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-300">
                          {displayStockText}
                        </td>
                        <td className="p-2.5 text-center">
                          {isSufficient ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-950 text-emerald-300 border border-emerald-700 whitespace-nowrap">
                              ✓ เพียงพอ
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-900 text-rose-200 border border-rose-600 animate-pulse whitespace-nowrap">
                              สต็อกไม่พอ (ขาด {missing} {recipeUnit})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 2. Mobile / PWA Card List (< md) */}
          <div className="block md:hidden space-y-2 max-h-60 overflow-y-auto pr-0.5">
            {productionModal.loadingItems ? (
              <div className="p-6 text-center text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                กำลังตรวจสอบข้อมูลวัตถุดิบ...
              </div>
            ) : productionModal.items.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                ไม่พบรายการส่วนผสมในสูตรนี้
              </div>
            ) : (
              productionModal.items.map((item, idx) => {
                const reqQty = Number(((parseFloat(item.quantity) || 0) * currentBatchCount).toFixed(4));
                const ingObj = ingredients.find(i => i.id === item.ingredient_id);
                const rawStock = ingObj ? (parseFloat(ingObj.quantity) || 0) : (parseFloat(item.stock_quantity) || 0);
                const ingBaseUnit = ingObj?.unit || item.ingredient_unit || item.unit || 'g';
                const recipeUnit = item.unit || ingBaseUnit;

                const currStockInRecipeUnit = Number(convertQuantity(rawStock, ingBaseUnit, recipeUnit).toFixed(4));
                const isSufficient = currStockInRecipeUnit >= reqQty;
                const missing = Number((reqQty - currStockInRecipeUnit).toFixed(4));

                const displayStockText = (ingBaseUnit && recipeUnit && getUnitFamily(ingBaseUnit) === getUnitFamily(recipeUnit) && ingBaseUnit !== recipeUnit)
                  ? `${currStockInRecipeUnit} ${recipeUnit} (${rawStock} ${ingBaseUnit})`
                  : `${currStockInRecipeUnit} ${recipeUnit}`;

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-xs transition-all ${
                      isSufficient
                        ? 'bg-slate-950/80 border-slate-800'
                        : 'bg-rose-950/60 border-rose-700/80'
                    }`}
                  >
                    {/* Item Top: Name & Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-white text-sm leading-tight">
                        {item.ingredient_name || ingObj?.name || 'วัตถุดิบ'}
                      </span>
                      {isSufficient ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1 flex-shrink-0">
                          <span>✓</span>
                          <span>เพียงพอ</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-900 text-rose-200 border border-rose-600 flex items-center gap-1 flex-shrink-0 animate-pulse">
                          <span>✕</span>
                          <span>ขาด {missing} {recipeUnit}</span>
                        </span>
                      )}
                    </div>

                    {/* Item Bottom: Required vs Current Stock */}
                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-400">ต้องใช้: </span>
                        <span className="font-extrabold text-cyan-300 font-mono text-xs">
                          {reqQty} {recipeUnit}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400">สต็อกคงเหลือ: </span>
                        <span className="font-mono text-slate-200">
                          {displayStockText}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Insufficient Stock Warning Banner */}
        {hasAnyDeficit && (
          <div className="p-3 bg-rose-950/90 border border-rose-600 rounded-xl text-rose-200 text-xs font-bold flex items-center gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 shrink-0 animate-bounce" />
            <span>❌ ไม่สามารถยืนยันการผลิตได้ เนื่องจากมีวัตถุดิบบางรายการไม่เพียงพอ กรุณาเพิ่มสต็อกวัตถุดิบหรือลดจำนวน Batch</span>
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setProductionModal({ show: false, recipe: null, batchCount: 1, loadingItems: false, items: [] })}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all w-full sm:w-auto"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={hasAnyDeficit || submittingProduction || productionModal.items.length === 0}
            onClick={handleConfirmProduction}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 w-full sm:w-auto ${
              hasAnyDeficit || productionModal.items.length === 0
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950'
            }`}
          >
            <span>{submittingProduction ? 'กำลังตัดวัตถุดิบ & รับเข้าสต็อก...' : '✅ ยืนยันการผลิต (ตัดวัตถุดิบ & รับเข้าสต็อก)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
