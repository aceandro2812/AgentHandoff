import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type AgentTarget = 'claude-code' | 'cursor' | 'codex' | 'all';

interface MCPConfig {
  mcpServers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

/**
 * Returns the path to the globally-installed agenthandoff binary
 * (or falls back to `node <dist path>` for dev use).
 */
function getMCPCommand(): { command: string; args: string[] } {
  try {
    const { execSync } = require('child_process');
    const which = execSync('which agenthandoff 2>/dev/null || where agenthandoff 2>nul', {
      encoding: 'utf8',
    }).trim().split('\n')[0] ?? '';
    if (which) return { command: which, args: ['mcp', 'start'] };
  } catch {
    // ignore
  }
  // Dev fallback
  return { command: 'node', args: [`${process.cwd()}/dist/cli/index.js`, 'mcp', 'start'] };
}

export function generateMCPConfig(projectRoot: string, target: AgentTarget): string[] {
  const written: string[] = [];
  const { command, args } = getMCPCommand();

  const serverEntry = {
    command,
    args,
  };

  if (target === 'claude-code' || target === 'all') {
    written.push(...writeClaudeCodeConfig(projectRoot, serverEntry));
  }

  if (target === 'cursor' || target === 'all') {
    written.push(...writeCursorConfig(projectRoot, serverEntry));
  }

  if (target === 'codex' || target === 'all') {
    written.push(...writeCodexConfig(projectRoot, serverEntry));
  }

  return written;
}

function writeClaudeCodeConfig(
  projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
  const configPath = join(projectRoot, '.claude', 'settings.json');
  mkdirSync(join(projectRoot, '.claude'), { recursive: true });

  let existing: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(configPath)) {
    try { existing = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /**/ }
  }

  existing.mcpServers = { ...existing.mcpServers, agenthandoff: server };
  writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf8');
  return [configPath];
}

function writeCursorConfig(
  projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
  const configPath = join(projectRoot, '.cursor', 'mcp.json');
  mkdirSync(join(projectRoot, '.cursor'), { recursive: true });

  let existing: MCPConfig = { mcpServers: {} };
  if (existsSync(configPath)) {
    try { existing = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /**/ }
  }

  existing.mcpServers['agenthandoff'] = server;
  writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf8');
  return [configPath];
}

function writeCodexConfig(
  projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
  // Codex reads MCP config from ~/.codex/config.json
  const { homedir } = require('os');
  const configPath = join(homedir(), '.codex', 'config.json');
  mkdirSync(join(homedir(), '.codex'), { recursive: true });

  let existing: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(configPath)) {
    try { existing = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /**/ }
  }

  existing.mcpServers = { ...existing.mcpServers, agenthandoff: server };
  writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf8');
  return [configPath];
}
