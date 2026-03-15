import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir } from '../utils/config.js';
import { InjectionResult, Injector } from './base.js';

const CLAUDE_INJECTION_FILE = 'claude-handoff.md';

/**
 * Claude Code injector: writes .agenthandoff/claude-handoff.md
 * Does NOT mutate CLAUDE.md.
 * Claude Code will pick it up if referenced in CLAUDE.md or via --context flag.
 */
export class ClaudeCodeInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    const injectionPath = join(projectRoot, '.agenthandoff', CLAUDE_INJECTION_FILE);
    const content = renderPacketAsMarkdown(packet);
    writeFileSync(injectionPath, content, 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .agenthandoff/claude-handoff.md`,
        ``,
        `To inject into Claude Code, start your session with:`,
        `  claude "Read .agenthandoff/claude-handoff.md first, then continue working on this project."`,
        ``,
        `Or add this to your CLAUDE.md:`,
        `  ## Active Handoff`,
        `  See .agenthandoff/claude-handoff.md for current context from a previous agent session.`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', CLAUDE_INJECTION_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
