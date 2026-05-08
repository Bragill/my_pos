const { BaseTool, ToolResult } = require('../base');
const db = require('../../database/dbHelper');

class InventoryTool extends BaseTool {
  static toolName = 'check_inventory';
  static description = 'Check stock levels, find low stock items, or look up specific product inventory.';
  static inputSchema = {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'Search by SKU' },
      name: { type: 'string', description: 'Search by product name fragment' },
      low_stock: { type: 'boolean', description: 'If true, only returns items at or below reorder level' },
      store_id: { type: 'string', description: 'Optional store filter' }
    }
  };

  async execute(params, context) {
    let q = `
      SELECT p.sku, p.name, i.quantity, i.reorder_level, c.name as category 
      FROM inventory i 
      JOIN products p ON i.product_id = p.id 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = 1
    `;
    const sqlParams = [];

    if (params.low_stock) {
      q += " AND i.quantity <= i.reorder_level";
    }
    if (params.sku) {
      q += " AND p.sku = ?";
      sqlParams.push(params.sku);
    }
    if (params.name) {
      q += " AND p.name LIKE ?";
      sqlParams.push(`%${params.name}%`);
    }
    if (params.store_id) {
      q += " AND i.store_id = ?";
      sqlParams.push(params.store_id);
    }

    q += " ORDER BY i.quantity ASC LIMIT 20";

    const rows = await db.all(q, sqlParams);

    if (rows.length === 0) {
      return ToolResult.success("No matching inventory items found.");
    }

    let markdown = "### Inventory Status\n\n";
    markdown += "| SKU | Name | Stock | Status |\n";
    markdown += "|-----|------|-------|--------|\n";
    
    rows.forEach(row => {
      const status = row.quantity <= row.reorder_level ? "⚠️ LOW" : "✅ OK";
      markdown += `| ${row.sku} | ${row.name} | ${row.quantity} | ${status} |\n`;
    });

    return ToolResult.success(markdown, { items: rows });
  }
}

module.exports = InventoryTool;
