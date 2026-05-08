const { BaseTool, ToolResult } = require('../base');
const db = require('../../database/dbHelper');

class SalesTool extends BaseTool {
  static toolName = 'get_sales_insights';
  static description = 'Retrieve sales summaries, top products, and performance metrics for the store.';
  static inputSchema = {
    type: 'object',
    properties: {
      type: { 
        type: 'string', 
        enum: ['daily', 'top_products', 'dashboard', 'monthly_summary'],
        description: 'Type of sales insight to retrieve'
      },
      days: { type: 'number', description: 'Number of days to look back (default 30)' },
      limit: { type: 'number', description: 'Limit for top products (default 10)' },
      store_id: { type: 'string', description: 'Optional store filter' }
    },
    required: ['type']
  };

  async execute(params, context) {
    const storeId = params.store_id || context.store_id || 'default_store';
    const days = params.days || 30;
    const limit = params.limit || 10;

    switch (params.type) {
      case 'dashboard':
        return await this.getDashboard(storeId);
      case 'daily':
        return await this.getDailySales(storeId, days);
      case 'top_products':
        return await this.getTopProducts(storeId, days, limit);
      case 'monthly_summary':
        return await this.getMonthlySummary(storeId);
      default:
        return ToolResult.error("Invalid insight type");
    }
  }

  async getDashboard(storeId) {
    const [data, month] = await Promise.all([
      db.get(`
        SELECT COUNT(DISTINCT o.id) as orders,
               COALESCE(SUM(p.amount), 0) as sales
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE DATE(p.created_at, '+7 hours') = DATE('now', '+7 hours')
          AND o.status != 'refunded'
          AND o.store_id = ?
      `, [storeId]),
      db.get(`
        SELECT COALESCE(SUM(p.amount), 0) as sales
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE strftime('%Y-%m', p.created_at, '+7 hours') = strftime('%Y-%m', 'now', '+7 hours')
          AND o.status != 'refunded'
          AND o.store_id = ?
      `, [storeId])
    ]);

    let markdown = "### Sales Dashboard (Today)\n\n";
    markdown += `- **Orders Today:** ${data.orders}\n`;
    markdown += `- **Revenue Today:** ฿${data.sales.toLocaleString()}\n`;
    markdown += `- **Revenue This Month:** ฿${month.sales.toLocaleString()}\n`;

    return ToolResult.success(markdown, { today: data, month: month });
  }

  async getDailySales(storeId, days) {
    const rows = await db.all(`
      SELECT DATE(p.created_at, '+7 hours') as date,
             SUM(p.amount) as revenue,
             COUNT(DISTINCT o.id) as orders
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE p.created_at >= datetime('now', '+7 hours', '-' || ? || ' days')
        AND o.status != 'refunded'
        AND o.store_id = ?
      GROUP BY date ORDER BY date DESC
    `, [days, storeId]);

    if (rows.length === 0) return ToolResult.success("No sales data for this period.");

    let markdown = `### Daily Sales (Last ${days} Days)\n\n`;
    markdown += "| Date | Revenue | Orders |\n";
    markdown += "|------|---------|--------|\n";
    rows.forEach(r => {
      markdown += `| ${r.date} | ฿${r.revenue.toLocaleString()} | ${r.orders} |\n`;
    });

    return ToolResult.success(markdown, { history: rows });
  }

  async getTopProducts(storeId, days, limit) {
    const rows = await db.all(`
      SELECT p.name, p.sku,
             SUM(oi.quantity) as qty,
             SUM(oi.total_price) as revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'refunded'
        AND o.store_id = ?
        AND EXISTS (SELECT 1 FROM payments pay WHERE pay.order_id = o.id AND pay.created_at >= datetime('now', '+7 hours', '-' || ? || ' days'))
      GROUP BY p.id ORDER BY qty DESC LIMIT ?
    `, [storeId, days, limit]);

    let markdown = `### Top ${limit} Products (Last ${days} Days)\n\n`;
    markdown += "| Product | SKU | Qty Sold | Revenue |\n";
    markdown += "|---------|-----|----------|---------|\n";
    rows.forEach(r => {
      markdown += `| ${r.name} | ${r.sku} | ${r.qty} | ฿${r.revenue.toLocaleString()} |\n`;
    });

    return ToolResult.success(markdown, { top_products: rows });
  }

  async getMonthlySummary(storeId) {
    const rows = await db.all(`
      SELECT strftime('%Y-%m', p.created_at, '+7 hours') as month,
             SUM(p.amount) as revenue,
             COUNT(DISTINCT p.order_id) as orders
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE o.status != 'refunded' AND o.store_id = ?
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, [storeId]);

    let markdown = "### Monthly Sales Summary\n\n";
    markdown += "| Month | Revenue | Orders |\n";
    markdown += "|-------|---------|--------|\n";
    rows.forEach(r => {
      markdown += `| ${r.month} | ฿${r.revenue.toLocaleString()} | ${r.orders} |\n`;
    });

    return ToolResult.success(markdown, { monthly: rows });
  }
}

module.exports = SalesTool;
