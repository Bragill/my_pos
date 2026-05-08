const { BaseTool, ToolResult } = require('../base');
const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.resolve(__dirname, '../../../../../.claude/agents');

const AGENTS = [
  'backend-dev',
  'frontend-dev',
  'system-architect',
  'qa-engineer',
  'devops-engineer',
  'project-manager',
  'product-owner',
  'ui-ux-designer',
];

function readAgentMarkdown(agentName) {
  const filePath = path.join(AGENTS_DIR, `${agentName}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const bodyMatch = raw.match(/^---[\s\S]*?---\s*([\s\S]*)$/m);
  return bodyMatch ? bodyMatch[1].trim() : raw.trim();
}

function parseAgentMeta(agentName) {
  const filePath = path.join(AGENTS_DIR, `${agentName}.md`);
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return {};
  const meta = {};
  frontmatterMatch[1].split(/\r?\n/).forEach(line => {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return meta;
}

class AgentInvokeTool extends BaseTool {
  static toolName = 'invoke_agent';
  static description =
    'Invoke one of the 8 POS project sub-agents by name. Returns the agent system prompt and metadata so the caller can act in that agent role. Agents: backend-dev, frontend-dev, system-architect, qa-engineer, devops-engineer, project-manager, product-owner, ui-ux-designer.';
  static inputSchema = {
    type: 'object',
    properties: {
      agent_name: {
        type: 'string',
        enum: AGENTS,
        description: 'The agent to invoke',
      },
      task: {
        type: 'string',
        description: 'The task or question to pass to the agent',
      },
    },
    required: ['agent_name', 'task'],
  };

  async execute(params) {
    const { agent_name, task } = params;
    const systemPrompt = readAgentMarkdown(agent_name);
    if (!systemPrompt) {
      return ToolResult.error(`Agent "${agent_name}" not found at ${AGENTS_DIR}`);
    }
    const meta = parseAgentMeta(agent_name);
    const md = [
      `## Agent: ${agent_name}`,
      meta.model ? `**Model:** ${meta.model}` : '',
      '',
      '### System Prompt',
      systemPrompt,
      '',
      '### Task',
      task,
    ]
      .filter(l => l !== null)
      .join('\n');

    return ToolResult.success(md, { agent_name, meta, task });
  }
}

class AgentListTool extends BaseTool {
  static toolName = 'list_agents';
  static description =
    'List all available POS project sub-agents with their names, models, and descriptions.';
  static inputSchema = {
    type: 'object',
    properties: {},
  };

  async execute() {
    const rows = AGENTS.map(name => {
      const meta = parseAgentMeta(name);
      const exists = fs.existsSync(path.join(AGENTS_DIR, `${name}.md`));
      return `| ${name} | ${meta.model || '-'} | ${meta.color || '-'} | ${exists ? 'available' : 'missing'} |`;
    });

    const md = [
      '## POS Sub-Agents',
      '',
      '| Agent | Model | Color | Status |',
      '|-------|-------|-------|--------|',
      ...rows,
    ].join('\n');

    return ToolResult.success(md, { agents: AGENTS });
  }
}

module.exports = { AgentInvokeTool, AgentListTool };
