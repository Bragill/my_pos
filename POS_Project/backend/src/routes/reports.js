const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const router = express.Router();

// Sales = based on actual payments received (Cash Basis)
router.get("/daily-sales", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const rows = await db.all(`
      SELECT DATE(p.created_at, '+7 hours') as date,
             COUNT(DISTINCT o.id) as total_orders,
             SUM(p.amount) as total_sales,
             SUM(o.discount * (p.amount / o.total_amount)) as total_discount,
             SUM(o.tax * (p.amount / o.total_amount)) as total_tax
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE p.created_at >= datetime('now', '+7 hours', '-' || ? || ' days')
        AND o.status NOT IN ('refunded', 'ยกเลิกแล้ว')
        AND o.store_id = ?
      GROUP BY DATE(p.created_at, '+7 hours')
      ORDER BY date DESC
    `, [parseInt(days), req.store_id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.get("/top-products", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { limit = 10, days = 30 } = req.query;
    const rows = await db.all(`
      SELECT p.id, p.name, p.sku,
             SUM(oi.quantity) as total_quantity,
             SUM(oi.total_price) as total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status NOT IN ('refunded', 'ยกเลิกแล้ว')
        AND o.store_id = ?
        AND EXISTS (SELECT 1 FROM payments pay WHERE pay.order_id = o.id AND pay.created_at >= datetime('now', '+7 hours', '-' || ? || ' days'))
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_quantity DESC LIMIT ?
    `, [req.store_id, parseInt(days), parseInt(limit)]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.get("/cashier-performance", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const rows = await db.all(`
      SELECT u.id, u.full_name,
             COUNT(DISTINCT o.id) as total_orders,
             SUM(p.amount) as total_sales,
             AVG(p.amount) as avg_order_value
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN users u ON o.user_id = u.id
      WHERE p.created_at >= datetime('now', '+7 hours', '-' || ? || ' days')
        AND o.status NOT IN ('refunded', 'ยกเลิกแล้ว')
        AND o.store_id = ?
      GROUP BY u.id, u.full_name
      ORDER BY total_sales DESC
    `, [parseInt(days), req.store_id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.get("/stock-value", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const rows = await db.all("SELECT p.id, p.name, p.sku, p.cost_price, p.selling_price, i.quantity, (p.cost_price * i.quantity) as stock_cost_value, (p.selling_price * i.quantity) as stock_retail_value FROM inventory i JOIN products p ON i.product_id = p.id WHERE p.is_active = 1 AND i.quantity > 0 AND i.store_id = ? ORDER BY stock_cost_value DESC", [req.store_id]);
    const totalCost = rows.reduce((sum, r) => sum + r.stock_cost_value, 0);
    const totalRetail = rows.reduce((sum, r) => sum + r.stock_retail_value, 0);
    res.json({ success: true, data: { items: rows, summary: { total_cost_value: totalCost, total_retail_value: totalRetail } } });
  } catch (err) { next(err); }
});

router.get("/dashboard", authenticate, async (req, res, next) => {
  try {
    console.log(`[Dashboard] Fetching stats for store: ${req.store_id}`);
    const [today, monthSales, lowStock] = await Promise.all([
      db.get(`
        SELECT COUNT(DISTINCT o.id) as orders,
               COALESCE(SUM(p.amount), 0) as sales
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE DATE(p.created_at, '+7 hours') = DATE('now', '+7 hours')
          AND o.status NOT IN ('refunded', 'ยกเลิกแล้ว')
          AND o.store_id = ?
      `, [req.store_id]),
      db.get(`
        SELECT COALESCE(SUM(p.amount), 0) as sales, COUNT(DISTINCT o.id) as orders
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE strftime('%Y-%m', p.created_at, '+7 hours') = strftime('%Y-%m', 'now', '+7 hours')
          AND o.status NOT IN ('refunded', 'ยกเลิกแล้ว')
          AND o.store_id = ?
      `, [req.store_id]),
      db.get("SELECT COUNT(*) as count FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.quantity <= i.reorder_level AND p.is_active = 1 AND i.store_id = ?", [req.store_id])
    ]);
    
    console.log(`[Dashboard] Store: ${req.store_id}, Today Orders: ${today?.orders}, Today Sales: ${today?.sales}`);
    
    res.json({ success: true, data: {
      today_orders: today?.orders || 0,
      today_sales:  today?.sales  || 0,
      month_sales:  monthSales?.sales || 0,
      month_orders: monthSales?.orders || 0,
      low_stock_count: lowStock?.count || 0,
    }});
  } catch (err) { next(err); }
});

// Monthly summary: revenue, cost, profit for last 12 months
router.get("/monthly-summary", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const rows = await db.all(`
      SELECT 
        m.month,
        COALESCE(pay.revenue, 0) as revenue,
        COALESCE(pay.total_orders, 0) as total_orders,
        COALESCE(cogs.cost, 0) as cost,
        COALESCE(pay.revenue, 0) - COALESCE(cogs.cost, 0) as profit
      FROM (
        SELECT DISTINCT strftime('%Y-%m', created_at, '+7 hours') as month 
        FROM orders 
        WHERE store_id = ? AND created_at >= datetime('now', '+7 hours', '-12 months')
          AND status NOT IN ('refunded', 'ยกเลิกแล้ว')
      ) m
      LEFT JOIN (
        SELECT 
          strftime('%Y-%m', p.created_at, '+7 hours') as month,
          SUM(p.amount) as revenue,
          COUNT(DISTINCT p.order_id) as total_orders
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE o.status NOT IN ('refunded', 'ยกเลิกแล้ว') AND o.store_id = ?
        GROUP BY 1
      ) pay ON m.month = pay.month
      LEFT JOIN (
        SELECT 
          strftime('%Y-%m', o.created_at, '+7 hours') as month,
          SUM(oi.quantity * p.cost_price) as cost
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        WHERE o.status NOT IN ('refunded', 'ยกเลิกแล้ว') AND o.store_id = ?
        GROUP BY 1
      ) cogs ON m.month = cogs.month
      ORDER BY m.month DESC
    `, [req.store_id, req.store_id, req.store_id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Purchase transactions for a month (NOT COGS)
router.get("/month-purchases", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month) return next(new AppError("กรุณาระบุเดือน", 400));
    const rows = await db.all(`
      SELECT st.id, st.created_at, st.quantity, st.remark,
             p.name as product_name, p.sku, p.cost_price,
             u.full_name as user_name,
             (st.quantity * p.cost_price) as total_cost
      FROM stock_transactions st
      JOIN products p ON p.id = st.product_id
      LEFT JOIN users u ON u.id = st.user_id
      WHERE st.type IN ('receive','adjust') AND st.quantity > 0
        AND st.store_id = ?
        AND strftime('%Y-%m', st.created_at) = ?
      ORDER BY st.created_at DESC
    `, [req.store_id, month]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Single month detail: daily breakdown
router.get("/month-detail", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month) return next(new AppError("กรุณาระบุเดือน", 400));

    // Revenue: all non-voided orders (including outstanding/unpaid)
    const revenueRows = await db.all(`
      SELECT DATE(o.created_at, '+7 hours') as date,
             COALESCE(SUM(o.total_amount), 0) as revenue,
             COUNT(DISTINCT o.id) as total_orders
      FROM orders o
      WHERE o.status NOT IN ('refunded', 'ยกเลิกแล้ว', 'parked', 'pending')
        AND o.store_id = ?
        AND strftime('%Y-%m', o.created_at, '+7 hours') = ?
      GROUP BY DATE(o.created_at, '+7 hours')
    `, [req.store_id, month]);

    // Cost: Proportionally calculate COGS for paid amounts (to avoid loss on unpaid orders)
    // For simplicity and user request, we use COGS of items sold in that day
    // Cost of Goods Sold (COGS)
    const costRows = await db.all(`
      SELECT DATE(COALESCE(pay.created_at, o.created_at), '+7 hours') as date,
             COALESCE(SUM(oi.quantity * p.cost_price), 0) as cost
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN (
        SELECT order_id, MIN(created_at) as created_at 
        FROM payments 
        GROUP BY order_id
      ) pay ON pay.order_id = o.id
      WHERE o.status NOT IN ('refunded', 'ยกเลิกแล้ว') 
        AND o.store_id = ? 
        AND strftime('%Y-%m', COALESCE(pay.created_at, o.created_at), '+7 hours') = ?
      GROUP BY 1
    `, [req.store_id, month]);

    // Merge by date
    const costMap = {};
    costRows.forEach(r => { costMap[r.date] = r.cost; });
    const allDates = [...new Set([...revenueRows.map(r=>r.date), ...Object.keys(costMap)])].sort();
    const rows = allDates.map(date => {
      const rev = revenueRows.find(r => r.date === date) || { revenue: 0, total_orders: 0 };
      const cost = costMap[date] || 0;
      return { date, revenue: rev.revenue, cost, profit: rev.revenue - cost, total_orders: rev.total_orders };
    });

    const totals = {
      revenue:      rows.reduce((s,r) => s+r.revenue, 0),
      cost:         rows.reduce((s,r) => s+r.cost, 0),
      profit:       rows.reduce((s,r) => s+r.profit, 0),
      total_orders: rows.reduce((s,r) => s+r.total_orders, 0),
    };
    res.json({ success: true, data: { rows, totals, month } });
  } catch (err) { next(err); }
});

// Year detail: monthly breakdown — cost = stock received that month × cost_price
router.get("/year-detail", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { year } = req.query;
    if (!year) return next(new AppError("กรุณาระบุปี", 400));
    const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

    const revenueRows = await db.all(`
      SELECT strftime('%Y-%m', o.created_at, '+7 hours') as month,
             COALESCE(SUM(o.total_amount), 0) as revenue,
             COUNT(DISTINCT o.id) as total_orders
      FROM orders o
      WHERE o.status NOT IN ('refunded', 'ยกเลิกแล้ว', 'parked', 'pending')
        AND o.store_id = ?
        AND strftime('%Y', o.created_at, '+7 hours') = ?
        AND strftime('%Y-%m', o.created_at, '+7 hours') <= strftime('%Y-%m', 'now', '+7 hours')
      GROUP BY strftime('%Y-%m', o.created_at, '+7 hours')
    `, [req.store_id, year]);

    const costRows = await db.all(`
      SELECT strftime('%Y-%m', st.created_at, '+7 hours') as month,
             COALESCE(SUM(st.quantity * p.cost_price), 0) as cost
      FROM stock_transactions st
      JOIN products p ON p.id = st.product_id
      WHERE st.quantity > 0
        AND st.type IN ('receive', 'adjust')
        AND st.store_id = ?
        AND strftime('%Y', st.created_at, '+7 hours') = ?
        AND strftime('%Y-%m', st.created_at, '+7 hours') <= strftime('%Y-%m', 'now', '+7 hours')
      GROUP BY strftime('%Y-%m', st.created_at, '+7 hours')
    `, [req.store_id, year]);

    const revenueMap = {};
    revenueRows.forEach(r => { revenueMap[r.month] = { revenue: r.revenue, total_orders: r.total_orders }; });
    const costMap = {};
    costRows.forEach(r => { costMap[r.month] = r.cost; });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based
    const selectedYear = parseInt(year);
    const maxMonth = selectedYear === currentYear ? currentMonth : 12;

    const rows = [];
    for (let m = 1; m <= maxMonth; m++) {
      const monthStr = `${selectedYear}-${String(m).padStart(2, '0')}`;
      const rev = revenueMap[monthStr] || { revenue: 0, total_orders: 0 };
      const cost = costMap[monthStr] || 0;
      rows.push({
        month: monthStr,
        revenue: rev.revenue,
        cost,
        profit: rev.revenue - cost,
        total_orders: rev.total_orders,
        label: `${THAI_MONTHS[m - 1]} ${selectedYear + 543}`,
      });
    }

    const totals = {
      revenue:      rows.reduce((s,r) => s+r.revenue, 0),
      cost:         rows.reduce((s,r) => s+r.cost, 0),
      profit:       rows.reduce((s,r) => s+r.profit, 0),
      total_orders: rows.reduce((s,r) => s+r.total_orders, 0),
    };
    res.json({ success: true, data: { rows, totals, year } });
  } catch (err) { next(err); }
});

// GET /export-items - Export SO, PO, and WO items with date filtering for Excel
router.get("/export-items", authenticate, async (req, res, next) => {
  try {
    const storeId = req.store_id || req.user?.store_id || 'store-1';
    const { type = 'all', startDate, endDate, status } = req.query;

    const result = {};

    // 1. Sales Order (SO) Items
    if (type === 'so' || type === 'all') {
      let soQuery = `
        SELECT 
          o.order_no,
          DATE(o.created_at, '+7 hours') as order_date,
          datetime(o.created_at, '+7 hours') as order_datetime,
          o.status as order_status,
          o.payment_method,
          COALESCE(u.full_name, u.username, 'แคชเชียร์') as cashier_name,
          COALESCE(c.name, o.debtor_name, 'ลูกค้าทั่วไป') as customer_name,
          p.sku,
          p.name as product_name,
          COALESCE(p.unit, 'ชิ้น') as unit,
          oi.quantity,
          oi.unit_price,
          COALESCE(oi.discount, 0) as item_discount,
          oi.total_price as item_total,
          o.total_amount as order_total_amount
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.store_id = ?
      `;
      const soParams = [storeId];

      if (startDate) {
        soQuery += " AND (DATE(o.created_at, '+7 hours') >= DATE(?) OR DATE(o.created_at) >= DATE(?))";
        soParams.push(startDate, startDate);
      }
      if (endDate) {
        soQuery += " AND (DATE(o.created_at, '+7 hours') <= DATE(?) OR DATE(o.created_at) <= DATE(?))";
        soParams.push(endDate, endDate);
      }
      if (status && status !== 'all') {
        soQuery += " AND o.status = ?";
        soParams.push(status);
      }

      soQuery += " ORDER BY o.created_at DESC, oi.id ASC LIMIT 5000";
      result.so = await db.all(soQuery, soParams);
    }

    // 2. Purchase Order (PO) Items
    if (type === 'po' || type === 'all') {
      let poQuery = `
        SELECT 
          po.po_number,
          COALESCE(po.received_date, DATE(po.created_at, '+7 hours')) as po_date,
          datetime(po.created_at, '+7 hours') as po_datetime,
          po.status as po_status,
          po.payment_method,
          po.bank_name,
          COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name,
          po.remark as po_notes,
          CASE 
            WHEN p.id IS NOT NULL THEN 'สินค้าสำเร็จรูป'
            WHEN ing.id IS NOT NULL THEN 'วัตถุดิบ'
            ELSE 'อื่นๆ'
          END as item_type,
          COALESCE(p.sku, ing.sku, '') as sku,
          COALESCE(p.name, ing.name, 'สินค้า/วัตถุดิบ') as item_name,
          COALESCE(p.unit, ing.unit, 'ชิ้น') as unit,
          poi.quantity,
          poi.unit_cost_price,
          poi.total_price as item_total,
          po.total_amount as po_grand_total
        FROM purchase_orders po
        JOIN purchase_order_items poi ON po.id = poi.po_id
        LEFT JOIN products p ON poi.product_id = p.id
        LEFT JOIN ingredients ing ON poi.product_id = ing.id
        LEFT JOIN users u ON po.user_id = u.id
        WHERE (po.store_id = ? OR po.store_id IS NULL OR po.store_id = '')
      `;
      const poParams = [storeId];

      if (startDate) {
        poQuery += " AND (po.received_date >= ? OR DATE(po.created_at, '+7 hours') >= DATE(?))";
        poParams.push(startDate, startDate);
      }
      if (endDate) {
        poQuery += " AND (po.received_date <= ? OR DATE(po.created_at, '+7 hours') <= DATE(?))";
        poParams.push(endDate, endDate);
      }
      if (status && status !== 'all') {
        poQuery += " AND po.status = ?";
        poParams.push(status);
      }

      poQuery += " ORDER BY po.created_at DESC, poi.id ASC LIMIT 5000";
      result.po = await db.all(poQuery, poParams);
    }

    // 3. Work Order (WO) Items
    if (type === 'wo' || type === 'all') {
      let woQuery = `
        SELECT 
          wo.wo_number,
          DATE(wo.created_at, '+7 hours') as production_date,
          datetime(wo.created_at, '+7 hours') as production_datetime,
          wo.status as wo_status,
          COALESCE(wo.user_name, u.full_name, 'ผู้ใช้งาน') as user_name,
          wo.remark as wo_remark,
          p.sku as output_product_sku,
          wo.product_name as output_product_name,
          wo.batch_count,
          wo.produced_yield,
          wo.yield_unit,
          wo.total_cost as wo_total_cost,
          ROUND(wo.total_cost / NULLIF(wo.produced_yield, 0), 4) as wo_unit_cost,
          pb.expiry_date as batch_expiry_date,
          COALESCE(ing.sku, ing_p.sku, '') as ingredient_sku,
          woi.ingredient_name,
          woi.quantity as ingredient_used_quantity,
          woi.unit as ingredient_unit,
          woi.cost as ingredient_total_cost,
          ROUND(woi.cost / NULLIF(woi.quantity, 0), 4) as ingredient_unit_cost
        FROM work_orders wo
        JOIN work_order_items woi ON wo.id = woi.wo_id
        LEFT JOIN products p ON wo.product_id = p.id
        LEFT JOIN product_batches pb ON wo.id = pb.wo_id
        LEFT JOIN ingredients ing ON woi.ingredient_id = ing.id
        LEFT JOIN products ing_p ON woi.ingredient_id = ing_p.id
        LEFT JOIN users u ON wo.user_id = u.id
        WHERE (wo.store_id = ? OR wo.store_id IS NULL OR wo.store_id = '')
      `;
      const woParams = [storeId];

      if (startDate) {
        woQuery += " AND DATE(wo.created_at, '+7 hours') >= DATE(?)";
        woParams.push(startDate);
      }
      if (endDate) {
        woQuery += " AND DATE(wo.created_at, '+7 hours') <= DATE(?)";
        woParams.push(endDate);
      }
      if (status && status !== 'all') {
        woQuery += " AND wo.status = ?";
        woParams.push(status);
      }

      woQuery += " ORDER BY wo.created_at DESC, woi.id ASC LIMIT 5000";
      result.wo = await db.all(woQuery, woParams);
    }

    res.json({
      success: true,
      data: result,
      filters: { type, startDate, endDate, status }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

