import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir } from '../utils/config.js';
import { InjectionResult, Injector } from './base.js';

const ANTIGRAVITY_INJECTION_FILE = 'antigravity-handoff.md';

/**
 * Google Antigravity injector.
 * Antigravity is a web-based agentic development platform — no local config files to write MCP to.
 * Writes .agenthandoff/antigravity-handoff.md for reference in the Antigravity agent view.
 */
export class AntigravityInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    const injectionPath = join(projectRoot, '.agenthandoff', ANTIGRAVITY_INJECTION_FILE);
    writeFileSync(injectionPath, renderPacketAsMarkdown(packet), 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .agenthandoff/${ANTIGRAVITY_INJECTION_FILE}`,
        ``,
        `To use with Google Antigravity:`,
        `  In the Agent View, start a new task with:`,
        `  "Read .agenthandoff/${ANTIGRAVITY_INJECTION_FILE} first, then continue working."`,
        ``,
        `Or use the inline paste (~68 tokens):`,
        `  agenthandoff inline  →  paste output into Antigravity chat`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', ANTIGRAVITY_INJECTION_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
