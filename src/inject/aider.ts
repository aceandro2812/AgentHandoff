import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { InjectionResult, Injector } from './base.js';

const AIDER_HANDOFF_FILE = '.aider.handoff.md';

/**
 * Aider injector: writes .aider.handoff.md at project root.
 * Does NOT touch CONVENTIONS.md or .aider.chat.history.md.
 *
 * Usage: aider --read .aider.handoff.md
 * Or add to .aiderignore negation: !.aider.handoff.md
 */
export class AiderInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    const injectionPath = join(projectRoot, AIDER_HANDOFF_FILE);
    writeFileSync(injectionPath, renderPacketAsMarkdown(packet), 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: ${AIDER_HANDOFF_FILE}`,
        ``,
        `To use with Aider:`,
        `  aider --read ${AIDER_HANDOFF_FILE}`,
        ``,
        `Or start Aider and add it as a read-only file:`,
        `  /read ${AIDER_HANDOFF_FILE}`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, AIDER_HANDOFF_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
