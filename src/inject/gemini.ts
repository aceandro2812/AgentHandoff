import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir } from '../utils/config.js';
import { InjectionResult, Injector } from './base.js';

const GEMINI_INJECTION_FILE = 'gemini-handoff.md';

/**
 * Gemini CLI injector: writes .agenthandoff/gemini-handoff.md
 * Does NOT mutate GEMINI.md.
 */
export class GeminiInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    const injectionPath = join(projectRoot, '.agenthandoff', GEMINI_INJECTION_FILE);
    writeFileSync(injectionPath, renderPacketAsMarkdown(packet), 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .agenthandoff/${GEMINI_INJECTION_FILE}`,
        ``,
        `To use with Gemini CLI, start your session with:`,
        `  gemini < "Read .agenthandoff/${GEMINI_INJECTION_FILE} first, then continue working."`,
        ``,
        `Or reference it via MCP (if configured):`,
        `  The Gemini CLI will auto-connect to the agenthandoff MCP server.`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', GEMINI_INJECTION_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
