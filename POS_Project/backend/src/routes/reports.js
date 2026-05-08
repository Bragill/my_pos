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

module.exports = router;

