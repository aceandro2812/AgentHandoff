import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { getProjectRoot } from '../utils/config.js';
import { generateMCPConfig, AgentTarget } from '../mcp/config-generator.js';
import { runInit } from './init.js';

// ── Agent detection ─────────────────────────────────────────────────────────

interface DetectedAgent {
  id: string;
  label: string;
  detected: boolean;
  how: string;             // what we found
  mcpSupported: boolean;
  slashCommandSupported: boolean;
}

function commandExists(cmd: string): boolean {
  try {
    const shell = platform() === 'win32'
      ? `where ${cmd} 2>nul`
      : `which ${cmd} 2>/dev/null`;
    execSync(shell, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function dirExists(...parts: string[]): boolean {
  return existsSync(join(...parts));
}

function globExists(dir: string, prefix: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some(f => f.startsWith(prefix));
  } catch {
    return false;
  }
}

function detectAgents(): DetectedAgent[] {
  const home = homedir();
  const os = platform();

  const agents: DetectedAgent[] = [
    {
      id: 'claude-code',
      label: 'Claude Code',
      detected: false,
      how: '',
      mcpSupported: true,
      slashCommandSupported: true,
    },
    {
      id: 'codex',
      label: 'OpenAI Codex CLI',
      detected: false,
      how: '',
      mcpSupported: true,
      slashCommandSupported: true,
    },
    {
      id: 'cursor',
      label: 'Cursor',
      detected: false,
      how: '',
      mcpSupported: true,
      slashCommandSupported: true,
    },
    {
      id: 'aider',
      label: 'Aider',
      detected: false,
      how: '',
      mcpSupported: false,
      slashCommandSupported: false,
    },
    {
      id: 'windsurf',
      label: 'Windsurf',
      detected: false,
      how: '',
      mcpSupported: false,
      slashCommandSupported: false,
    },
    {
      id: 'copilot',
      label: 'GitHub Copilot (VS Code)',
      detected: false,
      how: '',
      mcpSupported: true,
      slashCommandSupported: false,
    },
    {
      id: 'gemini',
      label: 'Google Gemini CLI',
      detected: false,
      how: '',
      mcpSupported: true,
      slashCommandSupported: true,
    },
    {
      id: 'firebase-studio',
      label: 'Firebase Studio (IDX)',
      detected: false,
      how: '',
      mcpSupported: false,
      slashCommandSupported: false,
    },
    {
      id: 'antigravity',
      label: 'Google Antigravity',
      detected: false,
      how: '',
      mcpSupported: false,
      slashCommandSupported: false,
    },
  ];

  // Claude Code
  const claudeAgent = agents.find(a => a.id === 'claude-code')!;
  if (commandExists('claude')) {
    claudeAgent.detected = true;
    claudeAgent.how = '`claude` binary found in PATH';
  } else if (dirExists(home, '.claude')) {
    claudeAgent.detected = true;
    claudeAgent.how = `~/.claude/ directory found`;
  }

  // Codex
  const codexAgent = agents.find(a => a.id === 'codex')!;
  if (commandExists('codex')) {
    codexAgent.detected = true;
    codexAgent.how = '`codex` binary found in PATH';
  } else if (dirExists(home, '.codex')) {
    codexAgent.detected = true;
    codexAgent.how = `~/.codex/ directory found`;
  }

  // Cursor
  const cursorAgent = agents.find(a => a.id === 'cursor')!;
  if (commandExists('cursor')) {
    cursorAgent.detected = true;
    cursorAgent.how = '`cursor` binary found in PATH';
  } else if (os === 'darwin' && existsSync('/Applications/Cursor.app')) {
    cursorAgent.detected = true;
    cursorAgent.how = '/Applications/Cursor.app found';
  } else if (os === 'win32') {
    const localApp = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local');
    if (existsSync(join(localApp, 'Programs', 'cursor', 'Cursor.exe'))) {
      cursorAgent.detected = true;
      cursorAgent.how = 'Cursor.exe found in AppData/Local';
    }
  } else if (os === 'linux') {
    if (existsSync('/usr/bin/cursor') || existsSync('/opt/cursor/cursor') ||
        dirExists(home, '.config', 'Cursor')) {
      cursorAgent.detected = true;
      cursorAgent.how = 'Cursor installation found';
    }
  }

  // Aider
  const aiderAgent = agents.find(a => a.id === 'aider')!;
  if (commandExists('aider')) {
    aiderAgent.detected = true;
    aiderAgent.how = '`aider` binary found in PATH';
  }

  // Windsurf
  const windsurfAgent = agents.find(a => a.id === 'windsurf')!;
  if (commandExists('windsurf')) {
    windsurfAgent.detected = true;
    windsurfAgent.how = '`windsurf` binary found in PATH';
  } else if (os === 'darwin' && existsSync('/Applications/Windsurf.app')) {
    windsurfAgent.detected = true;
    windsurfAgent.how = '/Applications/Windsurf.app found';
  } else if (os === 'win32') {
    const localApp = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local');
    if (existsSync(join(localApp, 'Programs', 'windsurf', 'Windsurf.exe'))) {
      windsurfAgent.detected = true;
      windsurfAgent.how = 'Windsurf.exe found in AppData/Local';
    }
  } else if (os === 'linux') {
    if (existsSync('/usr/bin/windsurf') || existsSync('/opt/windsurf/windsurf') ||
        dirExists(home, '.config', 'windsurf')) {
      windsurfAgent.detected = true;
      windsurfAgent.how = 'Windsurf installation found';
    }
  }

  // Copilot — detect VS Code extension, Copilot CLI, or gh copilot
  const copilotAgent = agents.find(a => a.id === 'copilot')!;
  const vscodeExtDir = join(home, '.vscode', 'extensions');
  if (dirExists(home, '.copilot')) {
    copilotAgent.detected = true;
    copilotAgent.how = '~/.copilot/ directory found (Copilot CLI)';
  } else if (globExists(vscodeExtDir, 'github.copilot-')) {
    copilotAgent.detected = true;
    copilotAgent.how = 'GitHub Copilot extension found in ~/.vscode/extensions';
  } else if (commandExists('gh')) {
    try {
      execSync('gh copilot --version', { stdio: 'pipe' });
      copilotAgent.detected = true;
      copilotAgent.how = '`gh copilot` CLI extension found';
    } catch { /* gh copilot not installed */ }
  }

  // Gemini CLI
  const geminiAgent = agents.find(a => a.id === 'gemini')!;
  if (commandExists('gemini')) {
    geminiAgent.detected = true;
    geminiAgent.how = '`gemini` binary found in PATH';
  } else if (dirExists(home, '.gemini')) {
    geminiAgent.detected = true;
    geminiAgent.how = '~/.gemini/ directory found';
  }

  // Firebase Studio (IDX)
  const firebaseAgent = agents.find(a => a.id === 'firebase-studio')!;
  if (dirExists('.idx')) {
    firebaseAgent.detected = true;
    firebaseAgent.how = '.idx/ directory found in project (Firebase Studio project)';
  }

  // Google Antigravity
  const antigravityAgent = agents.find(a => a.id === 'antigravity')!;
  // Antigravity is web-based; detect if project has .antigravity config or marker
  if (dirExists('.antigravity') || dirExists(home, '.antigravity')) {
    antigravityAgent.detected = true;
    antigravityAgent.how = '.antigravity/ directory found';
  }

  return agents;
}

// ── Setup logic ─────────────────────────────────────────────────────────────

interface SetupResult {
  agent: DetectedAgent;
  mcpDone: boolean;
  slashDone: boolean;
  errors: string[];
}

export async function runSetup(opts: { force?: boolean; dryRun?: boolean }): Promise<void> {
  const projectRoot = getProjectRoot();

  console.log('');
  console.log(chalk.bold('AgentHandoff Setup'));
  console.log(chalk.dim('Detecting installed agents and configuring everything automatically...\n'));

  // Detect
  const agents = detectAgents();
  const detected = agents.filter(a => a.detected);
  const notDetected = agents.filter(a => !a.detected);

  console.log(chalk.bold('Detected agents:'));
  if (detected.length === 0) {
    console.log(chalk.yellow('  No agents detected automatically.'));
    console.log(chalk.dim('  Use --force to configure anyway, or run `agenthandoff init --agent <name>`'));
  } else {
    for (const a of detected) {
      console.log(`  ${chalk.green('✓')} ${chalk.cyan(a.label.padEnd(26))} ${chalk.dim(a.how)}`);
    }
  }

  if (notDetected.length > 0) {
    console.log(chalk.dim('\nNot detected (skipped):'));
    for (const a of notDetected) {
      console.log(`  ${chalk.dim('○')} ${chalk.dim(a.label)}`);
    }
  }

  const toSetup = opts.force ? agents : detected;
  if (toSetup.length === 0) {
    console.log('\nNothing to configure. Install an agent first, then re-run `agenthandoff setup`.');
    return;
  }

  if (opts.dryRun) {
    console.log(chalk.dim('\n[dry-run] Would configure:'));
    for (const a of toSetup) {
      console.log(`  ${a.label}: ${a.mcpSupported ? 'MCP + ' : ''}${a.slashCommandSupported ? 'slash commands' : 'file injection only'}`);
    }
    return;
  }

  console.log('');
  console.log(chalk.bold('Configuring...'));
  console.log('');

  const results: SetupResult[] = [];

  for (const agent of toSetup) {
    const result: SetupResult = { agent, mcpDone: false, slashDone: false, errors: [] };

    // MCP config
    if (agent.mcpSupported) {
      try {
        generateMCPConfig(projectRoot, agent.id as AgentTarget);
        result.mcpDone = true;
      } catch (e) {
        result.errors.push(`MCP config failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Slash commands
    if (agent.slashCommandSupported) {
      try {
        runInit({ agent: agent.id });
        result.slashDone = true;
      } catch (e) {
        result.errors.push(`Slash command install failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    results.push(result);
  }

  // Summary
  console.log('');
  console.log(chalk.bold('Setup complete'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log('');

  for (const { agent, mcpDone, slashDone, errors } of results) {
    const tags: string[] = [];
    if (mcpDone)    tags.push(chalk.green('MCP'));
    if (slashDone)  tags.push(chalk.green('slash commands'));
    if (!mcpDone && !slashDone && errors.length === 0) tags.push(chalk.yellow('file injection (no MCP/commands for this agent)'));

    const status = errors.length > 0 ? chalk.red('✗') : chalk.green('✓');
    console.log(`  ${status} ${chalk.cyan(agent.label)}: ${tags.join(' + ')}`);
    for (const e of errors) {
      console.log(`      ${chalk.red(e)}`);
    }
  }

  console.log('');
  printUsageGuide(results);
}

function printUsageGuide(results: SetupResult[]): void {
  const configured = results.filter(r => r.slashDone || r.mcpDone);
  if (configured.length === 0) return;

  console.log(chalk.bold('How to use'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log('');

  const hasClaudeCode = configured.some(r => r.agent.id === 'claude-code');
  const hasCodex      = configured.some(r => r.agent.id === 'codex');
  const hasCursor     = configured.some(r => r.agent.id === 'cursor');

  if (hasClaudeCode) {
    console.log(chalk.bold('  Claude Code → any agent'));
    console.log(`    At the end of your session, run inside Claude Code:`);
    console.log(`    ${chalk.cyan('/project:handoff codex')}  ${chalk.dim('(or cursor, aider, etc.)')}`);
    console.log(`    Claude writes the handoff packet from its own context — zero API cost.`);
    console.log('');
  }

  if (hasCodex) {
    console.log(chalk.bold('  Codex → any agent'));
    console.log(`    At the end of your Codex session:`);
    console.log(`    ${chalk.cyan('/handoff claude-code')}  ${chalk.dim('(or cursor, aider, etc.)')}`);
    console.log('');
  }

  if (hasCursor) {
    console.log(chalk.bold('  Cursor → any agent'));
    console.log(`    Ask Cursor in any chat:`);
    console.log(`    ${chalk.cyan('"generate handoff for claude-code"')}`);
    console.log('');
  }

  console.log(chalk.bold('  Receiving the handoff (any agent)'));
  console.log(`    Option A — MCP  ${chalk.dim('(recommended, on-demand, fewest tokens):')}`);
  console.log(`    ${chalk.cyan('agenthandoff mcp start')}  ${chalk.dim('# run in background — agent queries what it needs')}`);
  console.log('');
  console.log(`    Option B — Inline paste ${chalk.dim('(~68 tokens, fastest for quick switches):')}`);
  console.log(`    ${chalk.cyan('agenthandoff inline')}  ${chalk.dim('# copy output, paste as first message in new session')}`);
  console.log('');
  console.log(`    Option C — File injection ${chalk.dim('(fallback for agents without MCP):')}`);
  console.log(`    ${chalk.cyan('agenthandoff inject --to <agent>')}`);
  console.log('');
  console.log(chalk.dim('  Run `agenthandoff --help` for the full command reference.'));
  console.log('');
}
