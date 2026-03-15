import chalk from 'chalk';
import { getProjectRoot } from '../utils/config.js';
import { generateMCPConfig, AgentTarget } from '../mcp/config-generator.js';

interface MCPStartOptions {
  // no options — stdio transport is always used
}

interface MCPConfigOptions {
  for: string;
}

export async function runMCPStart(_opts: MCPStartOptions): Promise<void> {
  // Dynamically import to avoid loading MCP SDK unless needed
  const { startMCPServer } = await import('../mcp/server.js');
  await startMCPServer();
}

export async function runMCPConfig(opts: MCPConfigOptions): Promise<void> {
  const projectRoot = getProjectRoot();
  const target = opts.for as AgentTarget;

  const valid: AgentTarget[] = ['claude-code', 'cursor', 'codex', 'gemini', 'copilot', 'all'];
  if (!valid.includes(target)) {
    console.error(chalk.red(`Unknown target: ${target}. Use: ${valid.join(' | ')}`));
    process.exit(1);
  }

  console.log(chalk.bold(`\nConfiguring MCP server for: ${target}\n`));

  const written = generateMCPConfig(projectRoot, target);

  if (written.length === 0) {
    console.log(chalk.yellow('No config files written.'));
    return;
  }

  console.log(chalk.green('✓ MCP config written to:'));
  for (const f of written) {
    console.log(`  ${chalk.cyan(f)}`);
  }

  console.log('');
  console.log('The MCP server exposes these tools to your agent:');
  const tools = [
    ['get_current_handoff',   'Full handoff packet as markdown'],
    ['get_task_state',        'Current goal, step, blockers, next action'],
    ['get_decisions',         'Architectural decisions + rationale'],
    ['get_warnings',          'Warnings and failed approaches'],
    ['get_related_files',     'Key files for the current task'],
    ['get_summary',           'Brief packet overview'],
    ['add_note',              'Add a note from within an agent session'],
    ['push_decision',         'Record an architectural decision in real-time'],
    ['push_warning',          'Record a warning in real-time'],
    ['push_failed_attempt',   'Record a failed approach in real-time'],
    ['set_task_state',        'Update goal, current step, next action'],
  ];
  for (const [name, desc] of tools) {
    console.log(`  ${chalk.cyan(name!.padEnd(24))} ${chalk.dim(desc)}`);
  }

  console.log('');
  console.log('Usage in your agent:');
  console.log(chalk.dim('  "Use get_current_handoff to understand what was worked on previously."'));
  console.log(chalk.dim('  "Use get_task_state to see where we left off."'));
  console.log('');
  console.log(`Start the server manually: ${chalk.bold('agenthandoff mcp start')}`);
  console.log('');
}
