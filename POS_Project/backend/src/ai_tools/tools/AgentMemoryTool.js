const { BaseTool, ToolResult } = require('../base');
const db = require('../../database/dbHelper');

async function ensureTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS agent_memories (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(agent_name, key)
  )`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_name)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(memory_type)`);
}

class AgentMemoryWriteTool extends BaseTool {
  static toolName = 'agent_memory_write';
  static description = 'Write or update a persistent memory entry for an agent. All agents share the same memory store and can read each other\'s memories. Use this to persist insights, decisions, patterns, or any cross-conversation knowledge.';
  static inputSchema = {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Name of the agent writing the memory (e.g. backend-dev, system-architect)' },
      key: { type: 'string', description: 'Unique key for this memory within the agent namespace (e.g. "auth_pattern", "db_schema_notes")' },
      memory_type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference', 'decision', 'pattern'], description: 'Category of memory' },
      content: { type: 'string', description: 'The memory content in markdown format' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for cross-agent search (e.g. ["auth", "jwt", "security"])' }
    },
    required: ['agent_name', 'key', 'memory_type', 'content']
  };

  async execute(params) {
    await ensureTable();
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const tags = JSON.stringify(params.tags || []);

    const now = new Date(Date.now() + 7 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
    await db.run(`
      INSERT INTO agent_memories (id, agent_name, memory_type, key, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_name, key) DO UPDATE SET
        content = excluded.content,
        memory_type = excluded.memory_type,
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `, [id, params.agent_name, params.memory_type, params.key, params.content, tags, now, now]);

    return ToolResult.success(`Memory saved: [${params.agent_name}] ${params.key}`);
  }
}

class AgentMemoryReadTool extends BaseTool {
  static toolName = 'agent_memory_read';
  static description = 'Read a specific memory entry by agent name and key. Can read any agent\'s memories, enabling cross-agent knowledge sharing.';
  static inputSchema = {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Agent whose memory to read' },
      key: { type: 'string', description: 'Memory key to retrieve' }
    },
    required: ['agent_name', 'key']
  };

  async execute(params) {
    await ensureTable();
    const row = await db.get(
      `SELECT * FROM agent_memories WHERE agent_name = ? AND key = ?`,
      [params.agent_name, params.key]
    );
    if (!row) return ToolResult.error(`No memory found for [${params.agent_name}] key: ${params.key}`);

    const tags = JSON.parse(row.tags || '[]');
    const md = `## Memory: ${row.key}\n**Agent:** ${row.agent_name} | **Type:** ${row.memory_type} | **Updated:** ${row.updated_at}\n${tags.length ? `**Tags:** ${tags.join(', ')}\n` : ''}\n${row.content}`;
    return ToolResult.success(md, row);
  }
}

class AgentMemoryListTool extends BaseTool {
  static toolName = 'agent_memory_list';
  static description = 'List memory entries. Can filter by agent, type, or tags. Returns summaries of all matching memories across all agents.';
  static inputSchema = {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Filter by agent name (optional — omit to see all agents)' },
      memory_type: { type: 'string', description: 'Filter by type: user, feedback, project, reference, decision, pattern' },
      tag: { type: 'string', description: 'Filter by tag' }
    }
  };

  async execute(params) {
    await ensureTable();
    let q = `SELECT agent_name, key, memory_type, tags, updated_at FROM agent_memories WHERE 1=1`;
    const sqlParams = [];

    if (params.agent_name) { q += ` AND agent_name = ?`; sqlParams.push(params.agent_name); }
    if (params.memory_type) { q += ` AND memory_type = ?`; sqlParams.push(params.memory_type); }
    if (params.tag) { q += ` AND tags LIKE ?`; sqlParams.push(`%"${params.tag}"%`); }

    q += ` ORDER BY agent_name, updated_at DESC`;
    const rows = await db.all(q, sqlParams);

    if (rows.length === 0) return ToolResult.success('No memories found matching the filter.');

    let md = `### Agent Memories (${rows.length} entries)\n\n`;
    md += `| Agent | Key | Type | Tags | Updated |\n`;
    md += `|-------|-----|------|------|---------|\n`;
    rows.forEach(r => {
      const tags = JSON.parse(r.tags || '[]').join(', ') || '-';
      md += `| ${r.agent_name} | ${r.key} | ${r.memory_type} | ${tags} | ${r.updated_at} |\n`;
    });
    return ToolResult.success(md, { memories: rows });
  }
}

class AgentMemorySearchTool extends BaseTool {
  static toolName = 'agent_memory_search';
  static description = 'Full-text search across all agent memories. Use this to find relevant knowledge before starting a task — searches content, keys, and tags.';
  static inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text to search for in memory content, keys, and tags' },
      agent_name: { type: 'string', description: 'Optional: restrict search to a specific agent' }
    },
    required: ['query']
  };

  async execute(params) {
    await ensureTable();
    const like = `%${params.query}%`;
    let q = `SELECT agent_name, key, memory_type, content, tags, updated_at
             FROM agent_memories
             WHERE (content LIKE ? OR key LIKE ? OR tags LIKE ?)`;
    const sqlParams = [like, like, like];

    if (params.agent_name) { q += ` AND agent_name = ?`; sqlParams.push(params.agent_name); }
    q += ` ORDER BY updated_at DESC LIMIT 10`;

    const rows = await db.all(q, sqlParams);
    if (rows.length === 0) return ToolResult.success(`No memories found matching: "${params.query}"`);

    let md = `### Search Results for: "${params.query}" (${rows.length} found)\n\n`;
    rows.forEach(r => {
      const tags = JSON.parse(r.tags || '[]').join(', ');
      const preview = r.content.slice(0, 200).replace(/\n/g, ' ');
      md += `#### [${r.agent_name}] ${r.key} *(${r.memory_type})*\n`;
      if (tags) md += `Tags: ${tags}\n`;
      md += `> ${preview}${r.content.length > 200 ? '...' : ''}\n\n`;
    });
    return ToolResult.success(md, { results: rows });
  }
}

class AgentMemoryDeleteTool extends BaseTool {
  static toolName = 'agent_memory_delete';
  static description = 'Delete a specific memory entry by agent name and key.';
  static inputSchema = {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Agent whose memory to delete' },
      key: { type: 'string', description: 'Memory key to delete' }
    },
    required: ['agent_name', 'key']
  };

  async execute(params) {
    await ensureTable();
    const result = await db.run(
      `DELETE FROM agent_memories WHERE agent_name = ? AND key = ?`,
      [params.agent_name, params.key]
    );
    return ToolResult.success(`Deleted memory [${params.agent_name}] ${params.key}`);
  }
}

module.exports = {
  AgentMemoryWriteTool,
  AgentMemoryReadTool,
  AgentMemoryListTool,
  AgentMemorySearchTool,
  AgentMemoryDeleteTool,
};
