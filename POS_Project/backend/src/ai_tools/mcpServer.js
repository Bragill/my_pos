const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const registry = require("./index");
const { init: initDb } = require("../database/dbHelper");

async function main() {
  // Ensure DB is initialized
  await initDb();

  const server = new Server(
    {
      name: "pos-ai-bridge",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * Handler that lists available tools.
   * Exposes tools from our internal registry.
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: registry.listTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  /**
   * Handler for tool execution.
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = registry.getTool(request.params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${request.params.name}`);
    }

    try {
      // Create a mock context for now (can be expanded with user/store info)
      const context = {
        store_id: 'default_store' 
      };

      const result = await tool.instance.run(request.params.arguments, context);

      return {
        content: [
          {
            type: "text",
            text: result.content,
          },
        ],
        isError: result.isError,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing tool: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("POS MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
