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
  _projectRoot: string,
  server: { command: string; args: string[] },
): string[] {
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
  const written: string[] = [];

  // VS Code Copilot reads MCP from .vscode/mcp.json (per-workspace)
  const vscodePath = join(projectRoot, '.vscode', 'mcp.json');
  mkdirSync(join(projectRoot, '.vscode'), { recursive: true });

  let vscodeExisting: MCPConfig = { mcpServers: {} };
  if (existsSync(vscodePath)) {
    try { vscodeExisting = JSON.parse(readFileSync(vscodePath, 'utf8')); } catch { /**/ }
  }
  vscodeExisting.mcpServers['agenthandoff'] = server;
  writeFileSync(vscodePath, JSON.stringify(vscodeExisting, null, 2), 'utf8');
  written.push(vscodePath);

  // Copilot CLI reads MCP from ~/.copilot/mcp-config.json (persistent)
  const copilotDir = join(homedir(), '.copilot');
  const copilotPath = join(copilotDir, 'mcp-config.json');
  mkdirSync(copilotDir, { recursive: true });

  let copilotExisting: MCPConfig = { mcpServers: {} };
  if (existsSync(copilotPath)) {
    try { copilotExisting = JSON.parse(readFileSync(copilotPath, 'utf8')); } catch { /**/ }
  }
  copilotExisting.mcpServers['agenthandoff'] = server;
  writeFileSync(copilotPath, JSON.stringify(copilotExisting, null, 2), 'utf8');
  written.push(copilotPath);

  return written;
}
