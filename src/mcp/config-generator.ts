import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

export type AgentTarget = 'claude-code' | 'cursor' | 'codex' | 'gemini' | 'copilot' | 'all';

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
    const which = execSync('which agenthandoff 2>/dev/null || where agenthandoff 2>nul', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split(/\r?\n/)[0]?.replace(/\r/g, '') ?? '';
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

  const serverEntry = { command, args };
  const all = target === 'all';

  if (target === 'claude-code' || all) {
    written.push(...writeClaudeCodeConfig(projectRoot, serverEntry));
  }
  if (target === 'cursor' || all) {
    written.push(...writeCursorConfig(projectRoot, serverEntry));
  }
  if (target === 'codex' || all) {
    written.push(...writeCodexConfig(projectRoot, serverEntry));
  }
  if (target === 'gemini' || all) {
    written.push(...writeGeminiConfig(projectRoot, serverEntry));
  }
  if (target === 'copilot' || all) {
    written.push(...writeCopilotConfig(projectRoot, serverEntry));
  }

  return written;
}

function writeClaudeCodeConfig(
  projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
  // Claude Code reads project-scoped MCP servers from .mcp.json at the project root.
  // It does NOT read mcpServers from .claude/settings.json.
  const configPath = join(projectRoot, '.mcp.json');

  let existing: MCPConfig = { mcpServers: {} };
  if (existsSync(configPath)) {
    try { existing = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /**/ }
  }

  existing.mcpServers['agenthandoff'] = server;
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
  _projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
  // Codex CLI uses TOML format at ~/.codex/config.toml with [mcp_servers.<name>] tables.
  // It does NOT read from config.json.
  const configPath = join(homedir(), '.codex', 'config.toml');
  mkdirSync(join(homedir(), '.codex'), { recursive: true });

  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  writeFileSync(configPath, upsertTomlMcpServer(existing, 'agenthandoff', server), 'utf8');
  return [configPath];
}

/**
 * Upsert an [mcp_servers.<name>] section in a TOML string.
 * Replaces an existing section if found, otherwise appends it.
 */
function upsertTomlMcpServer(
  toml: string,
  name: string,
  server: { command: string; args: string[] },
): string {
  const argsToml = '[' + server.args.map(a => JSON.stringify(a)).join(', ') + ']';
  const newSection = `[mcp_servers.${name}]\ncommand = ${JSON.stringify(server.command)}\nargs = ${argsToml}`;

  // Match the section header through to the next section header (or EOF)
  const sectionRe = new RegExp(
    `\\[mcp_servers\\.${name}\\][^\\[]*`,
    's',
  );

  if (sectionRe.test(toml)) {
    return toml.replace(sectionRe, newSection + '\n');
  }

  return toml.trimEnd() + (toml.trim() ? '\n\n' : '') + newSection + '\n';
}

function writeGeminiConfig(
  projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
  // Gemini CLI reads MCP config from .gemini/settings.json (project-level)
  const configPath = join(projectRoot, '.gemini', 'settings.json');
  mkdirSync(join(projectRoot, '.gemini'), { recursive: true });

  let existing: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(configPath)) {
    try { existing = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /**/ }
  }

  existing.mcpServers = { ...existing.mcpServers, agenthandoff: server };
  writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf8');
  return [configPath];
}

function writeCopilotConfig(
  projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
  // VS Code Copilot reads MCP from .vscode/mcp.json (per-workspace).
  // The top-level key is "servers" (not "mcpServers"), and each entry requires "type": "stdio".
  const vscodePath = join(projectRoot, '.vscode', 'mcp.json');
  mkdirSync(join(projectRoot, '.vscode'), { recursive: true });

  let existing: { servers?: Record<string, unknown> } = { servers: {} };
  if (existsSync(vscodePath)) {
    try { existing = JSON.parse(readFileSync(vscodePath, 'utf8')); } catch { /**/ }
  }

  existing.servers = {
    ...existing.servers,
    agenthandoff: { type: 'stdio', ...server },
  };
  writeFileSync(vscodePath, JSON.stringify(existing, null, 2), 'utf8');
  return [vscodePath];
}
