/**
 * Base classes for POS AI Tools
 * Inspired by future-agi's modular tool system
 */

class ToolResult {
  constructor(content, data = null, isError = false, errorCode = null) {
    this.content = content;
    this.data = data;
    this.isError = isError;
    this.errorCode = errorCode;
  }

  static success(content, data = null) {
    return new ToolResult(content, data);
  }

  static error(message, errorCode = 'INTERNAL_ERROR', data = null) {
    return new ToolResult(`**Error:** ${message}`, data, true, errorCode);
  }
}

class BaseTool {
  /**
   * name: snake_case identifier
   * description: what the tool does (shown to LLM)
   * inputSchema: JSON Schema for validation
   */
  static name = 'base_tool';
  static description = 'Base tool description';
  static inputSchema = {
    type: 'object',
    properties: {}
  };

  /**
   * Execute the tool logic
   * @param {Object} params - Validated input parameters
   * @param {Object} context - Auth and DB context
   * @returns {Promise<ToolResult>}
   */
  async execute(params, context) {
    throw new Error('Execute method not implemented');
  }

  async run(params, context) {
    try {
      // Basic validation could happen here
      return await this.execute(params, context);
    } catch (error) {
      console.error(`Tool ${this.constructor.name} failed:`, error);
      return ToolResult.error(error.message);
    }
  }
}

module.exports = { BaseTool, ToolResult };
