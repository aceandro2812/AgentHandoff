import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir } from '../utils/config.js';
import { InjectionResult, Injector } from './base.js';

const CODEX_INJECTION_FILE = 'codex-handoff.md';

/**
 * Codex injector: writes .agenthandoff/codex-handoff.md
 * Does NOT mutate AGENTS.md or codex.md.
 * User is instructed to reference the file.
 */
export class CodexInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    const injectionPath = join(projectRoot, '.agenthandoff', CODEX_INJECTION_FILE);
    const content = renderPacketAsMarkdown(packet);
    writeFileSync(injectionPath, content, 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .agenthandoff/codex-handoff.md`,
        ``,
        `To inject into Codex, start your session with:`,
        `  codex "Read .agenthandoff/codex-handoff.md first, then continue working on this project."`,
        ``,
        `Or add to your AGENTS.md:`,
        `  ## Active Handoff`,
        `  See .agenthandoff/codex-handoff.md for current context from a previous agent session.`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', CODEX_INJECTION_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
