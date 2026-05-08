const { BaseTool, ToolResult } = require('../base');
const db = require('../../database/dbHelper');

class ImpactAnalysisTool extends BaseTool {
  static toolName = 'analyze_impact';
  static description = 'Analyze the impact of a product change (price or stock) on pending orders, revenue, and customer commitments.';
  static inputSchema = {
    type: 'object',
    properties: {
      product_id: { type: 'string', description: 'The ID of the product being changed' },
      new_selling_price: { type: 'number', description: 'Proposed new selling price' },
      new_quantity: { type: 'number', description: 'Proposed new inventory quantity' },
      store_id: { type: 'string', description: 'Optional store filter' }
    },
    required: ['product_id']
  };

  async execute(params, context) {
    const storeId = params.store_id || context.store_id || 'default_store';
    
    // 1. Get current product info and orders in parallel
    const [product, inventory, orders] = await Promise.all([
      db.get("SELECT name, sku, selling_price FROM products WHERE id = ?", [params.product_id]),
      db.get("SELECT quantity FROM inventory WHERE product_id = ? AND store_id = ?", [params.product_id, storeId]),
      db.all(`
        SELECT o.id, o.customer_id, c.name as customer_name, oi.quantity, oi.unit_price, o.status, o.created_at
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE oi.product_id = ? AND o.status IN ('pending', 'processing', 'unpaid') AND o.store_id = ?
      `, [params.product_id, storeId])
    ]);

    if (!product) return ToolResult.error("Product not found");

    const currentQty = inventory ? inventory.quantity : 0;

    let markdown = `## Impact Analysis for: ${product.name} (${product.sku})\n\n`;
    
    // Price Impact
    if (params.new_selling_price !== undefined) {
      const diff = params.new_selling_price - product.selling_price;
      const totalPotentialRevenueDiff = orders.reduce((sum, o) => sum + (diff * o.quantity), 0);
      
      markdown += `### Price Change Impact (฿${product.selling_price} -> ฿${params.new_selling_price})\n`;
      markdown += `- **Price Difference:** ฿${diff.toLocaleString()}\n`;
      markdown += `- **Affected Pending Orders:** ${orders.length}\n`;
      markdown += `- **Total Revenue Variance (if applied to pending):** ฿${totalPotentialRevenueDiff.toLocaleString()}\n\n`;
    }

    // Stock Impact
    if (params.new_quantity !== undefined) {
      const pendingQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      const remainingAfterChange = params.new_quantity - pendingQty;
      
      markdown += `### Inventory Change Impact (${currentQty} -> ${params.new_quantity})\n`;
      markdown += `- **Total Units Committed (Pending):** ${pendingQty}\n`;
      if (remainingAfterChange < 0) {
        markdown += `- **⚠️ CRITICAL:** New quantity is **insufficient** to cover pending orders. Shortfall: ${Math.abs(remainingAfterChange)} units.\n\n`;
      } else {
        markdown += `- **Available after commitments:** ${remainingAfterChange} units.\n\n`;
      }
    }

    if (orders.length > 0) {
      markdown += "### Affected Pending Orders\n\n";
      markdown += "| Order ID | Customer | Qty | Status |\n";
      markdown += "|----------|----------|-----|--------|\n";
      orders.forEach(o => {
        markdown += `| ${o.id.substring(0,8)}... | ${o.customer_name || 'Guest'} | ${o.quantity} | ${o.status} |\n`;
      });
    } else {
      markdown += "No pending orders will be affected by this change.";
    }

    return ToolResult.success(markdown, { 
      product, 
      affected_orders_count: orders.length,
      pending_commitment: orders.reduce((sum, o) => sum + o.quantity, 0)
    });
  }
}

module.exports = ImpactAnalysisTool;
