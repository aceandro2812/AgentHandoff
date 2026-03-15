import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir } from '../utils/config.js';
import { InjectionResult, Injector } from './base.js';

const WINDSURF_HANDOFF_FILE = 'windsurf-handoff.md';

/**
 * Windsurf injector: writes .agenthandoff/windsurf-handoff.md
 *
 * Does NOT modify .windsurfrules (durable instruction file).
 * Windsurf's Cascade context can be primed by including the file in chat.
 */
export class WindsurfInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    const injectionPath = join(projectRoot, '.agenthandoff', WINDSURF_HANDOFF_FILE);
    writeFileSync(injectionPath, renderPacketAsMarkdown(packet), 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .agenthandoff/${WINDSURF_HANDOFF_FILE}`,
        ``,
        `To use with Windsurf Cascade:`,
        `  Open a new Cascade session and send:`,
        `  "Read .agenthandoff/${WINDSURF_HANDOFF_FILE} before continuing work."`,
        ``,
        `Or add to .windsurfrules (temporary, remove after session):`,
        `  ## Active Handoff`,
        `  See .agenthandoff/${WINDSURF_HANDOFF_FILE} for context from a previous agent.`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', WINDSURF_HANDOFF_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
