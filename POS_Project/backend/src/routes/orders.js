const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const { applyPendingCostIfInventoryEmpty } = require("./_productCost");
const batchService = require("../services/batchService");
const { getUnitFactor, planSaleDeduction, ensureRecipeDeductedColumn, formatShortageMessage } = require("../services/recipeDeduction");
const router = express.Router();

/** Parse the per-line recipe deduction snapshot; null when absent/legacy. */
function parseRecipeDeducted(raw) {
  if (!raw) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.filter((l) => l && l.ingredient_id && parseFloat(l.qty) > 0);
  } catch (_) {
    return null;
  }
}

/** Restore exactly one deducted ingredient line inside a transaction. */
async function restoreRecipeIngredient(T, req, orderNo, action, itemSuffix, ingredientId, restoreQty) {
  await T(
    "UPDATE ingredients SET quantity=quantity+?, updated_at=datetime('now', '+7 hours') WHERE id=?",
    [restoreQty, ingredientId],
    { sql: "UPDATE ingredients SET quantity=quantity-? WHERE id=?", params: [restoreQty, ingredientId] }
  );
  await T(
    "UPDATE inventory SET quantity=quantity+?, updated_at=datetime('now', '+7 hours') WHERE product_id=?",
    [restoreQty, ingredientId],
    { sql: "UPDATE inventory SET quantity=quantity-? WHERE product_id=?", params: [restoreQty, ingredientId] }
  );
  const txId = uuidv4();
  await T(
    "INSERT INTO ingredient_stock_transactions (id,ingredient_id,user_id,store_id,type,quantity,remark,created_at) VALUES (?,?,?,?,'return',?,?,datetime('now', '+7 hours'))",
    [txId, ingredientId, req.user.id, req.store_id, restoreQty, `${action} (${orderNo})${itemSuffix}`],
    { sql: "DELETE FROM ingredient_stock_transactions WHERE id = ?", params: [txId] }
  );
  await batchService.restoreToBatches(ingredientId, req.store_id, restoreQty, T);
}

/** Legacy fallback for rows created before recipe_deducted tracking (pre-transaction formula). */
async function restoreRecipeLegacy(T, req, orderNo, action, itemSuffix, item) {
  const recipeItems = await db.all(
    "SELECT ingredient_id, quantity, unit FROM recipes WHERE product_id=? AND (store_id=? OR store_id IS NULL OR store_id='')",
    [item.product_id, req.store_id]
  );
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
    if (!(restoreQty > 0)) continue;
    await restoreRecipeIngredient(T, req, orderNo, action, itemSuffix, rItem.ingredient_id, restoreQty);
  }
}

router.post("/", authenticate, async (req, res, next) => {
  try {
    console.log("POST /orders body:", JSON.stringify(req.body));
    const { items, customer_id, debtor_name, debtor_id, payment_method, discount = 0, remark, is_outstanding = false, status: customStatus } = req.body;
    const store = await db.get("SELECT vat_rate FROM stores WHERE id = ?", [req.store_id]);
    const vatRate = parseFloat(store?.vat_rate ?? 7) / 100;
    let subTotal = 0; const orderItems = [];
    
    // Process items sequentially to ensure consistency, or parallelize product fetching
    for (const item of items) {
      const product = await db.get("SELECT id,selling_price,name FROM products WHERE id=? AND is_active=1 AND store_id=?", [item.product_id, req.store_id]);
      if (!product) throw new AppError("Product not found: " + item.product_id, 400);

      // Check if product has pending stock adjust approval
      const prodPending = await db.get(
        "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
        [req.store_id, `%"product_id":"${item.product_id}"%`, item.product_id]
      );
      if (prodPending) {
        throw new AppError(`สินค้า "${product.name}" มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${prodPending.document_id}) ไม่สามารถขายสินค้าได้จนกว่าจะได้รับอนุมัติ`, 400);
      }

      // Check if any recipe ingredient has pending stock adjust approval
      const recipeIngredients = await db.all(
        "SELECT r.ingredient_id, COALESCE(i.name, p.name) as name FROM recipes r LEFT JOIN ingredients i ON r.ingredient_id = i.id LEFT JOIN products p ON r.ingredient_id = p.id WHERE r.product_id=? AND (r.store_id=? OR r.store_id IS NULL OR r.store_id='')",
        [item.product_id, req.store_id]
      );
      for (const rItem of recipeIngredients) {
        const ingPending = await db.get(
          "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
          [req.store_id, `%"product_id":"${rItem.ingredient_id}"%`, rItem.ingredient_id]
        );
        if (ingPending) {
          throw new AppError(`วัตถุดิบ "${rItem.name || rItem.ingredient_id}" ในสูตรสินค้า "${product.name}" มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${ingPending.document_id}) ไม่สามารถขายได้จนกว่าจะได้รับอนุมัติ`, 400);
        }
      }

      const unitPrice = item.unit_price || product.selling_price;
      const itemDiscount = item.discount || 0;
      const totalPrice = (unitPrice * item.quantity) - itemDiscount;
      orderItems.push({ product_id: product.id, product_name: product.name, quantity: item.quantity, unit_price: unitPrice, discount: itemDiscount, total_price: totalPrice });
      subTotal += totalPrice;
    }
    
    const taxableAmount = subTotal - discount;
    const tax = Math.round(taxableAmount * vatRate * 100) / 100;
    const totalAmount = taxableAmount + tax;
    const status = customStatus || (is_outstanding ? 'outstanding' : 'completed');
    const pm = is_outstanding ? 'outstanding' : payment_method;

    // Generate Order Number: Prefix-YYYYMMDDXXXX
    const prefixes = {
      'cash': 'CSH',
      'qr_promptpay': 'PMP',
      'outstanding': 'DBT'
    };
    // Map custom status "รอชำระพร้อมเพย์" to PMP
    let prefix = prefixes[pm] || 'POS';
    if (status === 'รอชำระพร้อมเพย์') prefix = 'PMP';

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()).replace(/-/g, ''); // YYYYMMDD
    const lastOrder = await db.get(
      "SELECT order_no FROM orders WHERE order_no LIKE ? AND store_id = ? ORDER BY order_no DESC LIMIT 1",
      [`${prefix}-${today}%`, req.store_id]
    );
    
    let sequence = 1;
    if (lastOrder && lastOrder.order_no) {
      try {
        const parts = lastOrder.order_no.split('-');
        if (parts.length > 1) {
          const lastSeqStr = parts[1].slice(8);
          if (lastSeqStr) {
            sequence = parseInt(lastSeqStr) + 1;
          }
        }
      } catch (e) {
        console.error("Error parsing last order sequence:", e);
      }
    }
    const orderNo = `${prefix}-${today}${String(sequence).padStart(4, '0')}`;
    const orderId = uuidv4();

    // resolve debtor display name
    let resolvedDebtorName = debtor_name || null;
    let resolvedDebtorId = debtor_id || null;
    if (debtor_id) {
      const debtor = await db.get("SELECT name FROM debtors WHERE id=? AND store_id=?", [debtor_id, req.store_id]);
      if (debtor) resolvedDebtorName = debtor.name;
    }
    
    await ensureRecipeDeductedColumn();

    // ---- Recipe Deduction planning (READ phase, finished-stock-first) ----
    // finished deduct = full saleQty; ingredients deduct only for the shortfall
    // (saleQty beyond on-hand finished stock). Shortages WARN but never block.
    const deductionPlan = await planSaleDeduction(
      orderItems.map((o) => ({ product_id: o.product_id, quantity: o.quantity, product_name: o.product_name })),
      req.store_id
    );
    const stockWarnings = deductionPlan.warnings || [];

    // Hard block: insufficient raw materials reject the sale BEFORE any write.
    // (Finished-stock shortfall alone is fine — it is the normal make-to-order path.)
    const shortageMsg = formatShortageMessage(stockWarnings);
    if (shortageMsg) {
      return next(new AppError(shortageMsg, 400));
    }

    // ---- WRITE phase: everything inside a strict transaction ----
    // Native D1 binding: one atomic DB.batch(). REST mode: sequential writes
    // with compensating rollback on error (see db.runTransaction).
    await db.runTransaction(async (tx) => {
      const T = (sql, params, undo) => tx.run(sql, params, undo);

      await T(
        `INSERT INTO orders (id,order_no,user_id,customer_id,debtor_name,debtor_id,sub_total,discount,tax,total_amount,payment_method,status,remark,store_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))`,
        [orderId, orderNo, req.user.id, customer_id||null, resolvedDebtorName, resolvedDebtorId, subTotal, discount, tax, totalAmount, pm, status, remark||null, req.store_id],
        { sql: "DELETE FROM orders WHERE id = ?", params: [orderId] }
      );

      for (const item of orderItems) {
        const planLine = deductionPlan.lines.find((l) => l.product_id === item.product_id);
        const lineLeaves = planLine ? planLine.recipe_leaves : [];
        const recipeDeductedJson = lineLeaves.length > 0 ? JSON.stringify(lineLeaves) : null;
        const orderItemId = uuidv4();

        // 1. Calculate how many units come from finished stock vs made-to-order from ingredients
        const finishedDeductQty = (planLine && planLine.deduct_enabled)
          ? Math.max(0, item.quantity - (planLine.shortfall || 0))
          : item.quantity;
        const makeToOrderQty = (planLine && planLine.deduct_enabled)
          ? (planLine.shortfall || 0)
          : 0;

        await T(
          "INSERT INTO order_items (id,order_id,product_id,quantity,unit_price,discount,total_price,recipe_deducted,finished_deducted) VALUES (?,?,?,?,?,?,?,?,?)",
          [orderItemId, orderId, item.product_id, item.quantity, item.unit_price, item.discount, item.total_price, recipeDeductedJson, finishedDeductQty],
          { sql: "DELETE FROM order_items WHERE id = ?", params: [orderItemId] }
        );

        // 2. Finished goods stock: ONLY deduct what actually came from finished goods stock
        if (finishedDeductQty > 0) {
          await T(
            "UPDATE inventory SET quantity=quantity-?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?",
            [finishedDeductQty, item.product_id, req.store_id],
            { sql: "UPDATE inventory SET quantity=quantity+? WHERE product_id=? AND store_id=?", params: [finishedDeductQty, item.product_id, req.store_id] }
          );
          await batchService.deductFromBatches(item.product_id, req.store_id, finishedDeductQty, T);
        }

        const stockTxId = uuidv4();
        const remarkSuffix = makeToOrderQty > 0
          ? ` (ตัดสต๊อก ${finishedDeductQty}/${item.quantity}, ผลิตสด ${makeToOrderQty})`
          : "";
        await T(
          "INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,created_at) VALUES (?,?,?,'sale',?,?,?,datetime('now', '+7 hours'))",
          [stockTxId, item.product_id, req.user.id, -finishedDeductQty, (is_outstanding ? "Outstanding - " : "Sale - ") + orderNo + remarkSuffix, req.store_id],
          { sql: "DELETE FROM stock_transactions WHERE id = ?", params: [stockTxId] }
        );

        // 2. Recipe ingredients for the shortfall portion only (finished-stock-first).
        //    Per-sale-unit scaling + nested sub-recipe explosion already applied in plan.
        if (lineLeaves.length > 0) {
          const itemSuffix = item.product_name ? ` (${item.product_name})` : '';
          const perIng = new Map();
          for (const leaf of lineLeaves) {
            if (!perIng.has(leaf.ingredient_id)) perIng.set(leaf.ingredient_id, { qty: 0, unit: leaf.unit, name: leaf.name });
            const acc = perIng.get(leaf.ingredient_id);
            acc.qty = Number((acc.qty + leaf.qty).toFixed(4));
          }
          for (const [ingId, acc] of perIng) {
            await T(
              "UPDATE ingredients SET quantity=quantity-?, updated_at=datetime('now', '+7 hours') WHERE id=? AND (store_id=? OR store_id IS NULL OR store_id='')",
              [acc.qty, ingId, req.store_id],
              { sql: "UPDATE ingredients SET quantity=quantity+? WHERE id=?", params: [acc.qty, ingId] }
            );
            await T(
              "UPDATE inventory SET quantity=quantity-?, updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?",
              [acc.qty, ingId, req.store_id],
              { sql: "UPDATE inventory SET quantity=quantity+? WHERE product_id=? AND store_id=?", params: [acc.qty, ingId, req.store_id] }
            );
            const ingTxId = uuidv4();
            await T(
              "INSERT INTO ingredient_stock_transactions (id,ingredient_id,user_id,store_id,type,quantity,remark,created_at) VALUES (?,?,?,?,'sale',?,?,datetime('now', '+7 hours'))",
              [ingTxId, ingId, req.user.id, req.store_id, -acc.qty, `Sale (${orderNo}) - ${item.quantity}x${itemSuffix}`],
              { sql: "DELETE FROM ingredient_stock_transactions WHERE id = ?", params: [ingTxId] }
            );
            await batchService.deductFromBatches(ingId, req.store_id, acc.qty, T);
          }
        }
      }

      if (!is_outstanding) {
        const payId = uuidv4();
        await T(
          "INSERT INTO payments (id,order_id,payment_type,amount) VALUES (?,?,?,?)",
          [payId, orderId, payment_method, totalAmount],
          { sql: "DELETE FROM payments WHERE id = ?", params: [payId] }
        );
        if (customer_id) {
          const pts = Math.floor(totalAmount / 100);
          if (pts > 0) await T(
            "UPDATE customers SET points=points+?,updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
            [pts, customer_id, req.store_id],
            { sql: "UPDATE customers SET points=points-? WHERE id=? AND store_id=?", params: [pts, customer_id, req.store_id] }
          );
        }
      }
    });

    // Post-commit cost rollover (best-effort; never fails the sale).
    // Uses computed post-sale finished qty so it works in every DB mode.
    for (const item of orderItems) {
      try {
        const planLine = deductionPlan.lines.find((l) => l.product_id === item.product_id);
        const postQty = planLine ? Number((planLine.finished_before - item.quantity).toFixed(4)) : 0;
        await applyPendingCostIfInventoryEmpty(item.product_id, req.store_id, postQty, req.user.id);
      } catch (costErr) {
        console.error("[orders] post-commit cost rollover failed:", costErr.message);
      }
    }

    const order = await db.get("SELECT * FROM orders WHERE id=? AND store_id=?", [orderId, req.store_id]);
    order.items = await db.all("SELECT * FROM order_items WHERE order_id=?", [orderId]);
    res.status(201).json({ success: true, data: order, stock_warnings: stockWarnings });
  } catch (err) { next(err); }
});

// GET outstanding orders
router.get("/outstanding", authenticate, async (req, res, next) => {
  try {
    const rows = await db.all("SELECT o.*,u.full_name as cashier_name,d.name as debtor_display_name,d.phone as debtor_phone FROM orders o LEFT JOIN users u ON o.user_id=u.id LEFT JOIN debtors d ON o.debtor_id=d.id WHERE o.status IN ('outstanding', 'รอชำระพร้อมเพย์') AND o.store_id=? ORDER BY o.created_at DESC", [req.store_id]);
    
    await Promise.all(rows.map(async (o) => {
      o.items = await db.all("SELECT oi.*,p.name as product_name FROM order_items oi JOIN products p ON oi.product_id=p.id WHERE oi.order_id=?", [o.id]);
      o.debtor_name = o.debtor_display_name || o.debtor_name;
    }));
    
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// PAY outstanding order (full)
router.post("/:id/pay-outstanding", authenticate, async (req, res, next) => {
  try {
    const { payment_method } = req.body;
    const order = await db.get("SELECT * FROM orders WHERE id=? AND status IN ('outstanding', 'รอชำระพร้อมเพย์') AND store_id=?", [req.params.id, req.store_id]);
    if (!order) return next(new AppError("ไม่พบรายการค้างชำระ", 404));
    await db.run("UPDATE orders SET status='completed', payment_method=?, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [payment_method, req.params.id, req.store_id]);
    await db.run("INSERT INTO payments (id,order_id,payment_type,amount) VALUES (?,?,?,?)", [uuidv4(), req.params.id, payment_method, order.total_amount]);
    if (order.customer_id) {
      const pts = Math.floor(order.total_amount / 100);
      if (pts > 0) await db.run("UPDATE customers SET points=points+?,updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [pts, order.customer_id, req.store_id]);
    }
    res.json({ success: true, data: await db.get("SELECT * FROM orders WHERE id=? AND store_id=?", [req.params.id, req.store_id]) });
  } catch (err) { next(err); }
});

// PAY partial amount against a debtor (splits across outstanding orders oldest first)
router.post("/pay-partial", authenticate, async (req, res, next) => {
  try {
    const { debtor_id, payment_method, amount } = req.body;
    if (!debtor_id || !amount || amount <= 0) return next(new AppError("ข้อมูลไม่ครบ", 400));
    
    const orders = await db.all("SELECT * FROM orders WHERE debtor_id=? AND status IN ('outstanding', 'รอชำระพร้อมเพย์') AND store_id=? ORDER BY created_at ASC", [debtor_id, req.store_id]);
    if (!orders.length) return next(new AppError("ไม่พบรายการค้างชำระ", 404));
    
    let remaining = parseFloat(amount);
    const paid = [];
    
    for (const o of orders) {
      if (remaining <= 0) break;
      
      const paidResult = await db.get("SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE order_id = ?", [o.id]);
      const alreadyPaid = paidResult?.total_paid || 0;
      const balance = o.total_amount - alreadyPaid;
      
      if (balance <= 0) continue;

      if (remaining >= balance) {
        await db.run("UPDATE orders SET status='completed', payment_method=?, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [payment_method, o.id, req.store_id]);
        await db.run("INSERT INTO payments (id,order_id,payment_type,amount) VALUES (?,?,?,?)", [uuidv4(), o.id, payment_method, balance]);
        remaining -= balance;
        paid.push({ order_no: o.order_no, paid: balance, status: 'completed' });
      } else {
        await db.run("INSERT INTO payments (id,order_id,payment_type,amount) VALUES (?,?,?,?)", [uuidv4(), o.id, payment_method, remaining]);
        paid.push({ order_no: o.order_no, paid: remaining, status: 'partial' });
        remaining = 0;
      }
    }
    res.json({ success: true, data: { paid, remaining_balance: remaining } });
  } catch (err) { next(err); }
});

router.get("/parked", authenticate, async (req, res, next) => {
  try {
    const orders = await db.all("SELECT * FROM orders WHERE status='parked' AND user_id=? AND store_id=? ORDER BY created_at DESC", [req.user.id, req.store_id]);
    for (const o of orders) { o.items = await db.all("SELECT * FROM order_items WHERE order_id=?", [o.id]); }
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

router.post("/:id/park", authenticate, async (req, res, next) => {
  try {
    const r = await db.run("UPDATE orders SET status='parked',updated_at=datetime('now', '+7 hours') WHERE id=? AND status='pending' AND store_id=?", [req.params.id, req.store_id]);
    if (r.changes === 0) return next(new AppError("Bill not found", 404));
    res.json({ success: true, data: await db.get("SELECT * FROM orders WHERE id=? AND store_id=?", [req.params.id, req.store_id]) });
  } catch (err) { next(err); }
});

router.post("/:id/refund", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const order = await db.get("SELECT * FROM orders WHERE id=? AND status='completed' AND store_id=?", [req.params.id, req.store_id]);
    if (!order) throw new AppError("Bill not found", 404);
    await ensureRecipeDeductedColumn();
    const items = await db.all("SELECT * FROM order_items WHERE order_id=?", [req.params.id]);

    // Symmetric restore: only return what the sale actually deducted
    // (recorded per line in order_items.recipe_deducted). Legacy rows with
    // NULL fall back to the pre-transaction recompute path.
    await db.runTransaction(async (tx) => {
      const T = (sql, params, undo) => tx.run(sql, params, undo);
      for (const item of items) {
        const finishedToRestore = (item.finished_deducted !== null && item.finished_deducted !== undefined)
          ? (parseFloat(item.finished_deducted) || 0)
          : item.quantity;

        if (finishedToRestore > 0) {
          await T(
            "UPDATE inventory SET quantity=quantity+?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?",
            [finishedToRestore, item.product_id, req.store_id],
            { sql: "UPDATE inventory SET quantity=quantity-? WHERE product_id=? AND store_id=?", params: [finishedToRestore, item.product_id, req.store_id] }
          );
          const retTxId = uuidv4();
          await T(
            "INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,created_at) VALUES (?,?,?,'return',?,?,?,datetime('now', '+7 hours'))",
            [retTxId, item.product_id, req.user.id, finishedToRestore, "Refund - " + order.order_no, req.store_id],
            { sql: "DELETE FROM stock_transactions WHERE id = ?", params: [retTxId] }
          );
          await batchService.restoreToBatches(item.product_id, req.store_id, finishedToRestore, T);
        }

        const deducted = parseRecipeDeducted(item.recipe_deducted);
        const prodName = item.product_name || (await db.get("SELECT name FROM products WHERE id=?", [item.product_id]))?.name || '';
        const itemSuffix = prodName ? ` - ${item.quantity}x (${prodName})` : ` - ${item.quantity}x`;
        if (deducted) {
          const perIng = new Map();
          for (const leaf of deducted) {
            if (!perIng.has(leaf.ingredient_id)) perIng.set(leaf.ingredient_id, 0);
            perIng.set(leaf.ingredient_id, Number((perIng.get(leaf.ingredient_id) + (parseFloat(leaf.qty) || 0)).toFixed(4)));
          }
          for (const [ingId, restoreQty] of perIng) {
            if (!(restoreQty > 0)) continue;
            await restoreRecipeIngredient(T, req, order.order_no, 'Refund', itemSuffix, ingId, restoreQty);
          }
        } else {
          // Legacy fallback (rows created before recipe_deducted tracking)
          await restoreRecipeLegacy(T, req, order.order_no, 'Refund', itemSuffix, item);
        }
      }
      await T(
        "UPDATE orders SET status='refunded',updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
        [req.params.id, req.store_id],
        { sql: "UPDATE orders SET status='completed' WHERE id=?", params: [req.params.id] }
      );
    });
    res.json({ success: true, message: "Refund successful" });
  } catch (err) { next(err); }
});

router.get("/", authenticate, async (req, res, next) => {
  try {
    const { status, date_from, date_to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = "WHERE o.store_id=?"; const params = [req.store_id];
    if (status) { where += " AND o.status=?"; params.push(status); }
    if (date_from) { where += " AND o.created_at>=?"; params.push(date_from); }
    if (date_to) { where += " AND o.created_at<=?"; params.push(date_to); }
    params.push(parseInt(limit), parseInt(offset));
    const rows = await db.all("SELECT o.*,u.full_name as cashier_name,c.name as customer_name FROM orders o LEFT JOIN users u ON o.user_id=u.id LEFT JOIN customers c ON o.customer_id=c.id " + where + " ORDER BY o.created_at DESC LIMIT ? OFFSET ?", params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// DELETE order (void) — admin/manager only
router.delete("/:id", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const order = await db.get("SELECT * FROM orders WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    if (!order) return next(new AppError("ไม่พบรายการ", 404));
    if (order.status === "refunded") return next(new AppError("รายการนี้ถูกยกเลิกไปแล้ว", 400));
    await ensureRecipeDeductedColumn();
    // Restore stock (symmetric: only what the sale deducted, see refund handler)
    const items = await db.all("SELECT * FROM order_items WHERE order_id=?", [req.params.id]);
    await db.runTransaction(async (tx) => {
      const T = (sql, params, undo) => tx.run(sql, params, undo);
      for (const item of items) {
        const finishedToRestore = (item.finished_deducted !== null && item.finished_deducted !== undefined)
          ? (parseFloat(item.finished_deducted) || 0)
          : item.quantity;

        if (finishedToRestore > 0) {
          await T(
            "UPDATE inventory SET quantity=quantity+?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?",
            [finishedToRestore, item.product_id, req.store_id],
            { sql: "UPDATE inventory SET quantity=quantity-? WHERE product_id=? AND store_id=?", params: [finishedToRestore, item.product_id, req.store_id] }
          );
          const voidTxId = uuidv4();
          await T(
            "INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,created_at) VALUES (?,?,?,'return',?,?,?,datetime('now', '+7 hours'))",
            [voidTxId, item.product_id, req.user.id, finishedToRestore, "Void - " + order.order_no, req.store_id],
            { sql: "DELETE FROM stock_transactions WHERE id = ?", params: [voidTxId] }
          );
          await batchService.restoreToBatches(item.product_id, req.store_id, finishedToRestore, T);
        }

        const deducted = parseRecipeDeducted(item.recipe_deducted);
        const prodName = item.product_name || (await db.get("SELECT name FROM products WHERE id=?", [item.product_id]))?.name || '';
        const itemSuffix = prodName ? ` - ${item.quantity}x (${prodName})` : ` - ${item.quantity}x`;
        if (deducted) {
          const perIng = new Map();
          for (const leaf of deducted) {
            if (!perIng.has(leaf.ingredient_id)) perIng.set(leaf.ingredient_id, 0);
            perIng.set(leaf.ingredient_id, Number((perIng.get(leaf.ingredient_id) + (parseFloat(leaf.qty) || 0)).toFixed(4)));
          }
          for (const [ingId, restoreQty] of perIng) {
            if (!(restoreQty > 0)) continue;
            await restoreRecipeIngredient(T, req, order.order_no, 'Void', itemSuffix, ingId, restoreQty);
          }
        } else {
          await restoreRecipeLegacy(T, req, order.order_no, 'Void', itemSuffix, item);
        }
      }
      await T("DELETE FROM order_items WHERE order_id=?", [req.params.id], null);
      await T("DELETE FROM payments WHERE order_id=?", [req.params.id], null);
      await T("DELETE FROM orders WHERE id=? AND store_id=?", [req.params.id, req.store_id], null);
    });
    res.json({ success: true, message: "ลบรายการสำเร็จ" });
  } catch (err) { next(err); }
});

// PUT update order discount/remark — admin/manager only
router.put("/:id", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { discount, remark, payment_method } = req.body;
    const order = await db.get("SELECT * FROM orders WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    if (!order) return next(new AppError("ไม่พบรายการ", 404));
    if (order.status === "refunded") return next(new AppError("ไม่สามารถแก้ไขรายการที่ยกเลิกแล้ว", 400));
    const store = await db.get("SELECT vat_rate FROM stores WHERE id = ?", [req.store_id]);
    const vatRate = parseFloat(store?.vat_rate ?? 7) / 100;
    const newDiscount = discount !== undefined ? parseFloat(discount) : order.discount;
    const newPayment = payment_method || order.payment_method;
    const newRemark = remark !== undefined ? remark : order.remark;
    const taxable = order.sub_total - newDiscount;
    const newTax = Math.round(taxable * vatRate * 100) / 100;
    const newTotal = taxable + newTax;
    await db.run("UPDATE orders SET discount=?,tax=?,total_amount=?,payment_method=?,remark=?,updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
      [newDiscount, newTax, newTotal, newPayment, newRemark, req.params.id, req.store_id]);
    const updated = await db.get("SELECT o.*,u.full_name as cashier_name,c.name as customer_name FROM orders o LEFT JOIN users u ON o.user_id=u.id LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=? AND o.store_id=?", [req.params.id, req.store_id]);
    updated.items = await db.all("SELECT oi.*,p.name as product_name,p.sku FROM order_items oi JOIN products p ON oi.product_id=p.id WHERE oi.order_id=?", [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const order = await db.get("SELECT o.*,u.full_name as cashier_name,c.name as customer_name FROM orders o LEFT JOIN users u ON o.user_id=u.id LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=? AND o.store_id=?", [req.params.id, req.store_id]);
    if (!order) return next(new AppError("Order not found", 404));
    order.items = await db.all("SELECT oi.*,p.name as product_name,p.sku FROM order_items oi JOIN products p ON oi.product_id=p.id WHERE oi.order_id=?", [order.id]);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

module.exports = router;
