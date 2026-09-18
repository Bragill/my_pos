const { v4: uuidv4 } = require('uuid');
const db = require('../database/dbHelper');
const batchService = require('./batchService');

function getUnitFactor(unitStr) {
  if (!unitStr) return 1;
  const u = String(unitStr).trim().toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล'].includes(u)) return 1000;
  if (['g', 'กรัม', 'ก.'].includes(u)) return 1;
  if (['mg', 'มิลลิกรัม'].includes(u)) return 0.001;
  if (['l', 'ลิตร'].includes(u)) return 1000;
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล'].includes(u)) return 1;
  if (['oz', 'ออนซ์'].includes(u)) return 28.3495;
  if (['lb', 'ปอนด์'].includes(u)) return 453.592;
  return 1;
}

function convertQuantity(qty, fromUnit, toUnit) {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return Number(qty) || 0;
  const fromFactor = getUnitFactor(fromUnit);
  const toFactor = getUnitFactor(toUnit);
  const qtyInBase = (Number(qty) || 0) * fromFactor;
  return qtyInBase / toFactor;
}

/**
 * Check if LINE approval is required for a store
 */
async function isLineApprovalRequired(storeId) {
  if (!storeId) return false;
  const settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [storeId]);
  if (!settings) return false;
  if (!settings.enable_approval_notifications) return false;
  if (!settings.channel_access_token || !settings.target_group_id) return false;
  return true;
}

/**
 * Cancel / Void a Sales Order (SO)
 */
async function cancelSaleOrder({ orderId, storeId, requesterId = 'system', approverName = 'Manager', reason = '' }) {
  const order = await db.get(
    'SELECT * FROM orders WHERE (id = ? OR order_no = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "")',
    [orderId, orderId, storeId]
  );

  if (!order) {
    throw new Error(`ไม่พบรายการคำสั่งซื้อ #${orderId}`);
  }

  if (order.status === 'ยกเลิกแล้ว' || order.status === 'refunded' || order.status === 'voided') {
    return { success: true, message: 'รายการนี้ได้รับการยกเลิกไปแล้ว', alreadyCancelled: true };
  }

  // 1. Mark order status as 'ยกเลิกแล้ว' with approver info first to guarantee status change
  try { await db.run("ALTER TABLE orders ADD COLUMN approver_name TEXT"); } catch (_) {}
  try { await db.run("ALTER TABLE orders ADD COLUMN approved_at TEXT"); } catch (_) {}
  try { await db.run("ALTER TABLE orders ADD COLUMN cancel_requested_at TEXT"); } catch (_) {}
  try { await db.run("ALTER TABLE orders ADD COLUMN cancel_requester_name TEXT"); } catch (_) {}

  const finalRemark = reason ? `${order.remark ? order.remark + ' | ' : ''}[ยกเลิกโดย ${approverName}: ${reason}]` : order.remark;
  await db.run(
    `UPDATE orders SET 
      status = 'ยกเลิกแล้ว', 
      remark = ?, 
      approver_name = ?, 
      approved_at = datetime('now', '+7 hours'),
      cancel_requested_at = COALESCE(cancel_requested_at, datetime('now', '+7 hours')),
      updated_at = datetime('now', '+7 hours') 
    WHERE id = ?`,
    [finalRemark, approverName, order.id]
  );

  const currentStore = storeId || order.store_id;

  // 2. Return finished goods and recipe ingredients
  const items = await db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  for (const item of items) {
    const finishedToRestore = (item.finished_deducted !== null && item.finished_deducted !== undefined)
      ? (parseFloat(item.finished_deducted) || 0)
      : (parseFloat(item.quantity) || 0);

    // 2.1 Restore finished goods
    if (finishedToRestore > 0) {
      try {
        await db.run(
          "UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [finishedToRestore, item.product_id, currentStore]
        );
        await db.run(
          "UPDATE ingredients SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [finishedToRestore, item.product_id, item.product_id, currentStore]
        ).catch(() => {});

        await batchService.restoreToBatches(item.product_id, currentStore, finishedToRestore);

        await db.run(
          "INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark, created_at) VALUES (?, ?, ?, ?, 'return', ?, ?, datetime('now', '+7 hours'))",
          [uuidv4(), item.product_id, requesterId, currentStore, finishedToRestore, `ยกเลิกรายการขาย ${order.order_no}: ${reason}`]
        );
      } catch (err) {
        console.error(`[cancelSaleOrder] Finished goods restore error for ${item.product_id}:`, err.message);
      }
    }

    // 2.2 Restore recipe ingredients (snapshot-based first, legacy fallback second)
    let recipeRestored = false;
    if (item.recipe_deducted) {
      try {
        const deducted = typeof item.recipe_deducted === 'string' ? JSON.parse(item.recipe_deducted) : item.recipe_deducted;
        if (Array.isArray(deducted) && deducted.length > 0) {
          const prodObj = await db.get('SELECT name FROM products WHERE id = ?', [item.product_id]);
          const prodName = prodObj?.name || item.name || '';
          const itemSuffix = prodName ? ` - ${item.quantity}x (${prodName})` : ` - ${item.quantity}x`;
          const perIng = new Map();
          for (const leaf of deducted) {
            if (!leaf || !leaf.ingredient_id) continue;
            perIng.set(leaf.ingredient_id, (perIng.get(leaf.ingredient_id) || 0) + (parseFloat(leaf.qty) || 0));
          }
          for (const [ingId, restoreQty] of perIng) {
            if (restoreQty <= 0) continue;
            try {
              await db.run(
                "UPDATE ingredients SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
                [restoreQty, ingId, ingId, currentStore]
              );
              await db.run(
                "UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
                [restoreQty, ingId, currentStore]
              );
              await batchService.restoreToBatches(ingId, currentStore, restoreQty);
              await db.run(
                "INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark, created_at) VALUES (?, ?, ?, ?, 'return', ?, ?, datetime('now', '+7 hours'))",
                [uuidv4(), ingId, requesterId, currentStore, restoreQty, `ยกเลิกบิล ${order.order_no}${itemSuffix}`]
              );
            } catch (ingErr) {
              console.error(`[cancelSaleOrder] Recipe restore error for ing ${ingId}:`, ingErr.message);
            }
          }
          recipeRestored = true;
        }
      } catch (parseErr) {
        console.error('[cancelSaleOrder] recipe_deducted parse error:', parseErr.message);
      }
    }

    // Legacy fallback: restore recipe ingredients ONLY IF product was Make-to-Order and not restored via snapshot
    if (!recipeRestored) {
      try {
        const hasWorkOrders = await db.get(
          'SELECT id FROM work_orders WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = "") LIMIT 1',
          [item.product_id, currentStore]
        );
        if (!hasWorkOrders) {
          const recipeItems = await db.all(
            'SELECT ingredient_id, quantity, unit FROM recipes WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = "")',
            [item.product_id, currentStore]
          );
          const prodObj = await db.get('SELECT name FROM products WHERE id = ?', [item.product_id]);
          const prodName = prodObj?.name || item.name || '';
          const itemSuffix = prodName ? ` - ${item.quantity}x (${prodName})` : ` - ${item.quantity}x`;

          for (const rItem of recipeItems) {
            const ing = await db.get("SELECT unit FROM ingredients WHERE id=? UNION SELECT unit FROM products WHERE id=?", [rItem.ingredient_id, rItem.ingredient_id]);
            let multiplier = 1;
            if (ing && ing.unit) {
              const rFactor = getUnitFactor(rItem.unit);
              const iFactor = getUnitFactor(ing.unit);
              if (rFactor > 0 && iFactor > 0 && rFactor !== iFactor) {
                multiplier = rFactor / iFactor;
              }
            }
            const restoreQty = rItem.quantity * multiplier * item.quantity;
            if (restoreQty <= 0) continue;
            try {
              await db.run(
                "UPDATE ingredients SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
                [restoreQty, rItem.ingredient_id, rItem.ingredient_id, currentStore]
              );
              await db.run(
                "UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
                [restoreQty, rItem.ingredient_id, currentStore]
              );
              await batchService.restoreToBatches(rItem.ingredient_id, currentStore, restoreQty);
              await db.run(
                "INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark, created_at) VALUES (?, ?, ?, ?, 'return', ?, ?, datetime('now', '+7 hours'))",
                [uuidv4(), rItem.ingredient_id, requesterId, currentStore, restoreQty, `ยกเลิกบิล ${order.order_no}${itemSuffix}`]
              );
            } catch (rErr) {
              console.error(`[cancelSaleOrder] Legacy recipe restore error for ${rItem.ingredient_id}:`, rErr.message);
            }
          }
        }
      } catch (legErr) {
        console.error('[cancelSaleOrder] Legacy fallback error:', legErr.message);
      }
    }
  }

  // 3. Log sales transaction
  try {
    await db.run(
      "INSERT INTO sales_transaction_logs (id, order_id, user_id, action_type, original_value, reason) VALUES (?, ?, ?, 'void', ?, ?)",
      [uuidv4(), order.id, requesterId, typeof order === 'object' ? JSON.stringify(order) : String(order), reason]
    );
  } catch (logErr) {
    console.warn(`[cancelSaleOrder] Log insertion warning for order #${order.order_no}:`, logErr.message);
  }

  return {
    success: true,
    message: `บิล #${order.order_no} ได้รับการยกเลิกและคืนสต็อกเรียบร้อยแล้ว`,
    order_no: order.order_no
  };
}

/**
 * Cancel a Purchase Order (PO) / Goods Receipt
 */
async function cancelPurchaseOrder({ poId, storeId, requesterId = 'system', approverName = 'Manager', reason = '' }) {
  const po = await db.get(
    'SELECT * FROM purchase_orders WHERE (id = ? OR po_number = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "")',
    [poId, poId, storeId]
  );

  if (!po) {
    throw new Error(`ไม่พบเอกสารใบสั่งซื้อ/รับสินค้า #${poId}`);
  }

  if (po.status === 'cancelled' || (po.remark && po.remark.includes('[ยกเลิกเมื่อ'))) {
    return { success: true, message: 'เอกสารนี้ได้รับการยกเลิกไปแล้ว', alreadyCancelled: true };
  }

  // 1. Update PO status / remark with approver info first
  try {
    await db.run("ALTER TABLE purchase_orders ADD COLUMN status TEXT DEFAULT 'completed'");
  } catch (_) {}
  try { await db.run("ALTER TABLE purchase_orders ADD COLUMN approver_name TEXT"); } catch (_) {}
  try { await db.run("ALTER TABLE purchase_orders ADD COLUMN approved_at TEXT"); } catch (_) {}

  const cancelNotice = `[ยกเลิกเมื่อ ${new Date().toISOString().slice(0, 19).replace('T', ' ')} โดย ${approverName}: ${reason || 'ยกเลิกเอกสารรับเข้า'}]`;
  await db.run(
    `UPDATE purchase_orders SET status = 'cancelled', remark = COALESCE(remark || ' | ', '') || ?, approver_name = ?, approved_at = datetime('now', '+7 hours') WHERE id = ?`,
    [cancelNotice, approverName, po.id]
  );

  // 2. Rollback inventory for each received item
  try {
    const items = await db.all('SELECT * FROM purchase_order_items WHERE po_id = ?', [po.id]);
    for (const item of items) {
      const deductQty = parseFloat(item.quantity) || 0;

      // Deduct from inventory
      await db.run(
        "UPDATE inventory SET quantity = MAX(0, quantity - ?), updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [deductQty, item.product_id, storeId]
      );

      // If item is also in ingredients table, deduct there too
      const ing = await db.get(
        "SELECT id FROM ingredients WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [item.product_id, item.product_id, storeId]
      );
      if (ing) {
        await db.run(
          "UPDATE ingredients SET quantity = MAX(0, quantity - ?), updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [deductQty, ing.id]
        );
        await db.run(
          "INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark, created_at) VALUES (?, ?, ?, ?, 'adjust', ?, ?, datetime('now', '+7 hours'))",
          [uuidv4(), ing.id, requesterId, storeId, -deductQty, `ยกเลิกใบรับสินค้า ${po.po_number}: หักคืน -${deductQty}`]
        );
      }

      // Deduct from batches if batch-tracked
      await batchService.deductFromBatches(item.product_id, storeId, deductQty);

      // Record reverse stock transaction
      await db.run(
        "INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark, po_number, created_at) VALUES (?, ?, ?, ?, 'adjust', ?, ?, ?, datetime('now', '+7 hours'))",
        [uuidv4(), item.product_id, requesterId, storeId, -deductQty, `ยกเลิกใบรับสินค้า ${po.po_number}: หักคืน -${deductQty} (${reason})`, po.po_number]
      );
    }
  } catch (stockErr) {
    console.error(`[cancelPurchaseOrder] Stock deduct warning for PO #${po.po_number}:`, stockErr.message);
  }

  return {
    success: true,
    message: `ยกเลิกใบรับสินค้า ${po.po_number} สำเร็จ และหักคืนยอดสต็อกเรียบร้อยแล้ว`,
    po_number: po.po_number
  };
}

/**
 * Cancel a Production Work Order (WO)
 */
async function cancelWorkOrder({ woId, storeId, requesterId = 'system', approverName = 'Manager', reason = '' }) {
  const wo = await db.get(
    'SELECT * FROM work_orders WHERE (id = ? OR wo_number = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "")',
    [woId, woId, storeId]
  );

  if (!wo) {
    throw new Error(`ไม่พบข้อมูลใบสั่งผลิต #${woId}`);
  }

  if (wo.status === 'cancelled') {
    return { success: true, message: 'ใบสั่งผลิตนี้ถูกยกเลิกไปแล้ว', alreadyCancelled: true };
  }

  const producedQty = parseFloat(wo.produced_yield) || 0;

  // 1. Check Product Batches remaining
  const batch = await db.get(
    'SELECT id, qty_produced, qty_remaining, status FROM product_batches WHERE wo_id = ? OR wo_number = ?',
    [wo.id, wo.wo_number]
  );

  if (batch) {
    const remainingInBatch = parseFloat(batch.qty_remaining) || 0;
    if (remainingInBatch < producedQty - 0.0001) {
      const soldOrConsumed = Number((producedQty - remainingInBatch).toFixed(4));
      throw new Error(`ไม่สามารถยกเลิกใบสั่งผลิต (${wo.wo_number}) ได้ เนื่องจากสินค้าล็อตนี้ถูกขายหรือใช้งานไปแล้ว ${soldOrConsumed} ${wo.yield_unit || 'หน่วย'}`);
    }
  }

  // 2. Check current Finished Goods Inventory Stock
  const currentInv = await db.get(
    'SELECT quantity FROM inventory WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = "")',
    [wo.product_id, storeId]
  );
  const currentProdStock = currentInv ? (parseFloat(currentInv.quantity) || 0) : 0;

  if (currentProdStock < producedQty - 0.0001) {
    const soldQty = Number((producedQty - currentProdStock).toFixed(4));
    throw new Error(`ไม่สามารถยกเลิกใบสั่งผลิต (${wo.wo_number}) ได้ เนื่องจากสต็อกคงเหลือเพียง ${currentProdStock} ${wo.yield_unit || 'หน่วย'} (มียอดตัดไปแล้ว ${soldQty} ${wo.yield_unit || 'หน่วย'})`);
  }

  // 3. Deduct Finished Goods from Inventory
  const newProdStock = Math.max(0, Number((currentProdStock - producedQty).toFixed(4)));
  await db.run(
    "UPDATE inventory SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
    [newProdStock, wo.product_id, storeId]
  );

  const syncedPrep = await db.get(
    "SELECT id FROM ingredients WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
    [wo.product_id, wo.product_id, storeId]
  );
  if (syncedPrep) {
    await db.run(
      "UPDATE ingredients SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
      [newProdStock, syncedPrep.id]
    );
  }

  if (batch) {
    await db.run(
      "UPDATE product_batches SET qty_remaining = 0, status = 'cancelled', updated_at = datetime('now', '+7 hours') WHERE id = ?",
      [batch.id]
    );
  }

  const cancelRemark = reason || `ยกเลิกใบสั่งผลิต ${wo.wo_number} (${wo.product_name})`;
  await db.run(
    "INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark, gi_number, created_at) VALUES (?, ?, ?, ?, 'adjust', ?, ?, ?, datetime('now', '+7 hours'))",
    [uuidv4(), wo.product_id, requesterId, storeId, -producedQty, `ยกเลิก WO ${wo.wo_number}: หักคืนสินค้าสำเร็จรูป -${producedQty} ${wo.yield_unit || 'หน่วย'}`, wo.wo_number]
  );

  // 4. Return deducted raw ingredients back to stock
  const woItems = await db.all('SELECT * FROM work_order_items WHERE wo_id = ?', [wo.id]);
  for (const item of woItems) {
    const ingQtyInRecipeUnit = parseFloat(item.quantity) || 0;
    const ingRow = await db.get(
      "SELECT id, unit, quantity FROM ingredients WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '') UNION SELECT id, unit, cost_price as quantity FROM products WHERE id = ?",
      [item.ingredient_id, item.ingredient_id, storeId, item.ingredient_id]
    );
    const ingBaseUnit = ingRow?.unit || item.unit;
    const returnQtyInIngUnit = Number(convertQuantity(ingQtyInRecipeUnit, item.unit, ingBaseUnit).toFixed(4));

    await db.run(
      "UPDATE ingredients SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [returnQtyInIngUnit, item.ingredient_id, item.ingredient_id, storeId]
    );

    await db.run(
      "UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [returnQtyInIngUnit, item.ingredient_id, storeId]
    );

    // If item is a batch-tracked sub-recipe item, restore to its batches
    await batchService.restoreToBatches(item.ingredient_id, storeId, returnQtyInIngUnit);

    await db.run(
      "INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark, gr_number, created_at) VALUES (?, ?, ?, ?, 'receive', ?, ?, ?, datetime('now', '+7 hours'))",
      [uuidv4(), item.ingredient_id, requesterId, storeId, returnQtyInIngUnit, `คืนสต็อกวัตถุดิบจากการยกเลิก WO ${wo.wo_number} (+${returnQtyInIngUnit} ${ingBaseUnit})`, wo.wo_number]
    );

    await db.run(
      "INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark, gr_number, created_at) VALUES (?, ?, ?, ?, 'receive', ?, ?, ?, datetime('now', '+7 hours'))",
      [uuidv4(), item.ingredient_id, requesterId, storeId, returnQtyInIngUnit, `คืนสต็อกวัตถุดิบจากการยกเลิก WO ${wo.wo_number} (+${returnQtyInIngUnit} ${ingBaseUnit})`, wo.wo_number]
    );
  }

  // 5. Update Work Order status to cancelled with approver info
  try {
    await db.run("ALTER TABLE work_orders ADD COLUMN status TEXT DEFAULT 'completed'");
  } catch (_) {}
  try { await db.run("ALTER TABLE work_orders ADD COLUMN approver_name TEXT"); } catch (_) {}
  try { await db.run("ALTER TABLE work_orders ADD COLUMN approved_at TEXT"); } catch (_) {}
  try { await db.run("ALTER TABLE work_orders ADD COLUMN cancel_requested_at TEXT"); } catch (_) {}
  try { await db.run("ALTER TABLE work_orders ADD COLUMN cancel_requester_name TEXT"); } catch (_) {}

  await db.run(
    `UPDATE work_orders SET 
      status = 'cancelled', 
      remark = COALESCE(remark || ' | ', '') || ?, 
      approver_name = ?, 
      approved_at = datetime('now', '+7 hours'),
      cancel_requested_at = COALESCE(cancel_requested_at, datetime('now', '+7 hours'))
    WHERE id = ?`,
    [`[ยกเลิกเมื่อ ${new Date().toISOString().slice(0, 19).replace('T', ' ')} โดย ${approverName}: ${cancelRemark}]`, approverName, wo.id]
  );

  return {
    success: true,
    message: `ยกเลิกใบสั่งผลิต ${wo.wo_number} สำเร็จ: คืนวัตถุดิบ ${woItems.length} รายการ และหักคืนสินค้าสำเร็จรูป -${producedQty} ${wo.yield_unit || 'หน่วย'} เรียบร้อยแล้ว`,
    wo_number: wo.wo_number
  };
}

/**
 * Execute Stock Adjustment when approved via LINE
 */
async function executeStockAdjustment({
  storeId,
  productId,
  diff,
  targetQuantity,
  reason = '',
  requesterId = 'system',
  approverName = 'LINE Manager'
}) {
  const inv = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [productId, storeId]);
  if (!inv) {
    throw new Error(`ไม่พบสินค้าในสต็อก #${productId}`);
  }
  const currentQty = parseFloat(inv.quantity) || 0;
  let newQty;
  if (targetQuantity !== undefined && targetQuantity !== null && !Number.isNaN(Number(targetQuantity))) {
    newQty = Number(targetQuantity);
  } else {
    newQty = currentQty + (Number(diff) || 0);
  }
  newQty = Math.round(newQty * 10000) / 10000;
  if (newQty < 0) {
    throw new Error(`สต็อกคงเหลือไม่เพียงพอ (คงเหลือ ${currentQty})`);
  }
  const actualDiff = Math.round((newQty - currentQty) * 10000) / 10000;

  await db.run("UPDATE inventory SET quantity=?, updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [newQty, productId, storeId]);

  const finalRemark = `ปรับสต็อก ${reason || ''} (${currentQty} → ${newQty}) [อนุมัติผ่าน LINE โดย ${approverName}]`;
  await db.run("INSERT INTO stock_transactions (id, product_id, user_id, type, quantity, remark, store_id, created_at) VALUES (?,?,?, 'adjust', ?, ?, ?, datetime('now', '+7 hours'))", [
    uuidv4(), productId, requesterId, actualDiff, finalRemark, storeId
  ]);

  // Sync to ingredients table if raw material
  try {
    const prd = await db.get("SELECT * FROM products WHERE id=? AND store_id=?", [productId, storeId]);
    if (prd && (prd.is_raw_material || prd.is_raw_material === 1)) {
      const netWeight = parseFloat(prd.net_weight) || 1;
      const ing = await db.get("SELECT id, quantity FROM ingredients WHERE (id = ? OR sku = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')", [prd.id, prd.sku, storeId]);
      if (ing) {
        const factor = getUnitFactor(prd.unit || 'g') / getUnitFactor(ing.unit || 'g');
        const targetIngQty = newQty * netWeight * factor;
        await db.run("UPDATE ingredients SET quantity=?, updated_at=datetime('now', '+7 hours') WHERE id=?", [targetIngQty, ing.id]);
        await db.run("INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark, created_at) VALUES (?,?,?,?,'adjust',?,?, datetime('now', '+7 hours'))", [
          uuidv4(), ing.id, requesterId, storeId, actualDiff * netWeight * factor, `ปรับสต็อกตามสินค้า ${prd.name} [อนุมัติผ่าน LINE โดย ${approverName}]`
        ]);
      }
    }
  } catch (syncErr) {
    console.warn('[executeStockAdjustment] ingredient sync failed:', syncErr.message);
  }

  if (actualDiff < 0) {
    try {
      await batchService.deductFromBatches(productId, storeId, -actualDiff);
    } catch (batchErr) {
      console.warn('[executeStockAdjustment] batch deduct failed:', batchErr.message);
    }
  } else if (actualDiff > 0) {
    try {
      await batchService.restoreToBatches(productId, storeId, actualDiff);
    } catch (batchErr) {
      console.warn('[executeStockAdjustment] batch restore failed:', batchErr.message);
    }
  }

  return {
    success: true,
    message: `อนุมัติปรับสต็อกสำเร็จ (${currentQty} → ${newQty})`,
    previous_quantity: currentQty,
    new_quantity: newQty,
    diff: actualDiff
  };
}

module.exports = {
  isLineApprovalRequired,
  cancelSaleOrder,
  cancelPurchaseOrder,
  cancelWorkOrder,
  executeStockAdjustment
};
