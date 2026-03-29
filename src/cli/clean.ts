import chalk from 'chalk';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  getProjectRoot,
  getHandoffDir,
  appendAuditLog,
  PACKET_JSON,
} from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';
import { CodexInjector } from '../inject/codex.js';
import { ClaudeCodeInjector } from '../inject/claude-code.js';
import { CursorInjector } from '../inject/cursor.js';
import { AiderInjector } from '../inject/aider.js';
import { CopilotInjector } from '../inject/copilot.js';
import { WindsurfInjector } from '../inject/windsurf.js';
import { GeminiInjector } from '../inject/gemini.js';
import { FirebaseStudioInjector } from '../inject/firebase-studio.js';
import { AntigravityInjector } from '../inject/antigravity.js';
import { GenericInjector } from '../inject/generic.js';
import { Injector } from '../inject/base.js';

export async function runClean(): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);

  if (!existsSync(jsonPath)) {
    console.log(chalk.yellow('No handoff packet to clean.'));
    return;
  }

  const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const removed: string[] = [];

  // Clean injection artifacts for target agent
  const injectors: Injector[] = [
    new CodexInjector(),
    new ClaudeCodeInjector(),
    new CursorInjector(),
    new AiderInjector(),
    new CopilotInjector(),
    new WindsurfInjector(),
    new GeminiInjector(),
    new FirebaseStudioInjector(),
    new AntigravityInjector(),
    new GenericInjector(),
  ];

  for (const injector of injectors) {
    const files = await injector.clean(projectRoot);
    removed.push(...files);
  }

  // Remove packet files
  const packetFiles = ['current-handoff.json', 'current-handoff.md'];
  for (const f of packetFiles) {
    const p = join(dir, f);
    if (existsSync(p)) {
      unlinkSync(p);
      removed.push(p);
    }
  }

  appendAuditLog(projectRoot, `clean: removed ${removed.length} file(s)`);

  if (removed.length === 0) {
    console.log(chalk.yellow('Nothing to clean.'));
    return;
  }

  console.log(chalk.green('\n✓ Cleaned handoff artifacts'));
  for (const f of removed) {
    console.log(`  ${chalk.dim('✗')} ${f}`);
  }
  console.log('');
}
