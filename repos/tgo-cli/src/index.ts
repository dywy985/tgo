import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerConversationCommands } from './commands/conversation.js';
import { registerChatCommands } from './commands/chat.js';
import { registerVisitorCommands } from './commands/visitor.js';
import { registerAgentCommands } from './commands/agent.js';
import { registerProviderCommands } from './commands/provider.js';
import { registerKnowledgeCommands } from './commands/knowledge.js';
import { registerWorkflowCommands } from './commands/workflow.js';
import { registerStaffCommands } from './commands/staff.js';
import { registerPlatformCommands } from './commands/platform.js';
import { registerTagCommands } from './commands/tag.js';
import { registerSystemCommands } from './commands/system.js';

const program = new Command();

program
  .name('tgo')
  .description('TGO CLI - AI Agent customer service operations tool')
  .version('0.1.0')
  .option('-s, --server <url>', 'API server URL')
  .option('-t, --token <token>', 'Auth token')
  .option('-o, --output <format>', 'Output format: json, table, compact', 'json')
  .option('-v, --verbose', 'Verbose output');

// Register all command groups
registerAuthCommands(program);
registerConversationCommands(program);
registerChatCommands(program);
registerVisitorCommands(program);
registerAgentCommands(program);
registerProviderCommands(program);
registerKnowledgeCommands(program);
registerWorkflowCommands(program);
registerStaffCommands(program);
registerPlatformCommands(program);
registerTagCommands(program);
registerSystemCommands(program);

// MCP serve command
program
  .command('mcp')
  .description('MCP Server commands')
  .command('serve')
  .description('Start MCP Server (stdio transport)')
  .action(async () => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer();
  });

program.parse();
