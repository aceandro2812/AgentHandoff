import { writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { InjectionResult, Injector } from './base.js';

const GITHUB_DIR    = '.github';
const HANDOFF_FILE  = 'agenthandoff-context.md';

/**
 * Copilot injector: writes .github/agenthandoff-context.md
 *
 * Does NOT modify .github/copilot-instructions.md.
 * Copilot does not auto-read arbitrary files, so we give the developer
 * a one-line snippet to paste into their instructions file, or they can
 * reference it in a Copilot chat with @workspace.
 */
export class CopilotInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    const githubDir = join(projectRoot, GITHUB_DIR);
    if (!existsSync(githubDir)) mkdirSync(githubDir, { recursive: true });

    const injectionPath = join(githubDir, HANDOFF_FILE);
    writeFileSync(injectionPath, renderPacketAsMarkdown(packet), 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .github/${HANDOFF_FILE}`,
        ``,
        `Option 1 — Add to .github/copilot-instructions.md:`,
        `  ## Active Handoff`,
        `  See .github/${HANDOFF_FILE} for context from a previous agent session.`,
        ``,
        `Option 2 — Reference in Copilot Chat:`,
        `  "@workspace Read .github/${HANDOFF_FILE} before starting."`,
        ``,
        `Option 3 — Copilot Workspace (issue-based):`,
        `  Include the file path in your issue description.`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, GITHUB_DIR, HANDOFF_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
