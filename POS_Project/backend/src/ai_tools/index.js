/**
 * AI Tools Entry Point
 */
const registry = require('./registry');
const InventoryTool = require('./tools/InventoryTool');
const SalesTool = require('./tools/SalesTool');
const ImpactAnalysisTool = require('./tools/ImpactAnalysisTool');
const {
  AgentMemoryWriteTool,
  AgentMemoryReadTool,
  AgentMemoryListTool,
  AgentMemorySearchTool,
  AgentMemoryDeleteTool,
} = require('./tools/AgentMemoryTool');
const { AgentInvokeTool, AgentListTool } = require('./tools/AgentInvokeTool');

// Register POS tools
registry.register(InventoryTool);
registry.register(SalesTool);
registry.register(ImpactAnalysisTool);

// Register shared agent memory tools
registry.register(AgentMemoryWriteTool);
registry.register(AgentMemoryReadTool);
registry.register(AgentMemoryListTool);
registry.register(AgentMemorySearchTool);
registry.register(AgentMemoryDeleteTool);

// Register agent invoke tools
registry.register(AgentInvokeTool);
registry.register(AgentListTool);

// Export registry
module.exports = registry;
