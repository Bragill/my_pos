/**
 * Tool Registry for POS AI Tools
 */

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(toolClass) {
    const instance = new toolClass();
    const name = toolClass.toolName || instance.constructor.name.toLowerCase();
    this.tools.set(name, {
      class: toolClass,
      instance: instance,
      description: toolClass.description,
      inputSchema: toolClass.inputSchema
    });
    console.log(`Registered AI Tool: ${name}`);
  }

  getTool(name) {
    return this.tools.get(name);
  }

  listTools() {
    const list = [];
    this.tools.forEach((val, key) => {
      list.push({
        name: key,
        description: val.description,
        inputSchema: val.inputSchema
      });
    });
    return list;
  }
}

const registry = new ToolRegistry();

module.exports = registry;
