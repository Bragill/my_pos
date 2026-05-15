const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const { applyPendingCostIfInventoryEmpty } = require("./_productCost");
const router = express.Router();

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
      const unitPrice = item.unit_price || product.selling_price;
      const itemDiscount = item.discount || 0;
      const totalPrice = (unitPrice * item.quantity) - itemDiscount;
      orderItems.push({ product_id: product.id, quantity: item.quantity, unit_price: unitPrice, discount: itemDiscount, total_price: totalPrice });
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
    
    await db.run("INSERT INTO orders (id,order_no,user_id,customer_id,debtor_name,debtor_id,sub_total,discount,tax,total_amount,payment_method,status,remark,store_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [orderId, orderNo, req.user.id, customer_id||null, resolvedDebtorName, resolvedDebtorId, subTotal, discount, tax, totalAmount, pm, status, remark||null, req.store_id]);
    
    for (const item of orderItems) {
      await db.run("INSERT INTO order_items (id,order_id,product_id,quantity,unit_price,discount,total_price) VALUES (?,?,?,?,?,?,?)", [uuidv4(), orderId, item.product_id, item.quantity, item.unit_price, item.discount, item.total_price]);
      await db.run("UPDATE inventory SET quantity=quantity-?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [item.quantity, item.product_id, req.store_id]);
      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'sale',?,?,?)", [uuidv4(), item.product_id, req.user.id, -item.quantity, (is_outstanding ? "Outstanding - " : "Sale - ") + orderNo, req.store_id]);
      const invAfter = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [item.product_id, req.store_id]);
      await applyPendingCostIfInventoryEmpty(item.product_id, req.store_id, invAfter ? invAfter.quantity : 0);
    }
    
    if (!is_outstanding) {
      await db.run("INSERT INTO payments (id,order_id,payment_type,amount) VALUES (?,?,?,?)", [uuidv4(), orderId, payment_method, totalAmount]);
      if (customer_id) {
        const pts = Math.floor(totalAmount / 100);
        if (pts > 0) await db.run("UPDATE customers SET points=points+?,updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [pts, customer_id, req.store_id]);
      }
    }
    
    const order = await db.get("SELECT * FROM orders WHERE id=? AND store_id=?", [orderId, req.store_id]);
    order.items = await db.all("SELECT * FROM order_items WHERE order_id=?", [orderId]);
    res.status(201).json({ success: true, data: order });
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
      
      // Calculate how much is already paid for this order
      const paidResult = await db.get("SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE order_id = ?", [o.id]);
      const alreadyPaid = paidResult?.total_paid || 0;
      const balance = o.total_amount - alreadyPaid;
      
      if (balance <= 0) continue;

      if (remaining >= balance) {
        // This payment covers the full remaining balance of this order
        await db.run("UPDATE orders SET status='completed', payment_method=?, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [payment_method, o.id, req.store_id]);
        await db.run("INSERT INTO payments (id,order_id,payment_type,amount) VALUES (?,?,?,?)", [uuidv4(), o.id, payment_method, balance]);
        remaining -= balance;
        paid.push({ order_no: o.order_no, paid: balance, status: 'completed' });
      } else {
        // Partial on this order — record payment but order stays outstanding
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
    const items = await db.all("SELECT * FROM order_items WHERE order_id=?", [req.params.id]);
    for (const item of items) {
      await db.run("UPDATE inventory SET quantity=quantity+?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [item.quantity, item.product_id, req.store_id]);
      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'return',?,?,?)", [uuidv4(), item.product_id, req.user.id, item.quantity, "Refund - " + order.order_no, req.store_id]);
    }
    await db.run("UPDATE orders SET status='refunded',updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
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
    // Restore stock
    const items = await db.all("SELECT * FROM order_items WHERE order_id=?", [req.params.id]);
    for (const item of items) {
      await db.run("UPDATE inventory SET quantity=quantity+?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [item.quantity, item.product_id, req.store_id]);
      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'return',?,?,?)", [uuidv4(), item.product_id, req.user.id, item.quantity, "Void - " + order.order_no, req.store_id]);
    }
    await db.run("DELETE FROM order_items WHERE order_id=?", [req.params.id]);
    await db.run("DELETE FROM payments WHERE order_id=?", [req.params.id]);
    await db.run("DELETE FROM orders WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
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
