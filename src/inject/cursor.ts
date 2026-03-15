import { writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { InjectionResult, Injector } from './base.js';

const CURSOR_RULES_DIR = '.cursor/rules';
const CURSOR_HANDOFF_FILE = 'agenthandoff.mdc';

/**
 * Cursor injector: writes .cursor/rules/agenthandoff.mdc
 * Uses Cursor's .mdc format with frontmatter for always-on loading.
 * Does NOT touch existing .cursorrules or other .mdc files.
 */
export class CursorInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    const rulesDir = join(projectRoot, CURSOR_RULES_DIR);
    if (!existsSync(rulesDir)) {
      mkdirSync(rulesDir, { recursive: true });
    }

    const injectionPath = join(rulesDir, CURSOR_HANDOFF_FILE);

    // .mdc format: YAML frontmatter + markdown body
    const frontmatter = [
      '---',
      'description: AgentHandoff cross-agent context (auto-generated, do not edit)',
      'alwaysApply: true',
      `updated: ${new Date().toISOString()}`,
      '---',
    ].join('\n');

    const body = renderPacketAsMarkdown(packet);
    writeFileSync(injectionPath, `${frontmatter}\n\n${body}`, 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: ${CURSOR_RULES_DIR}/${CURSOR_HANDOFF_FILE}`,
        ``,
        `This rule is set to alwaysApply: true — Cursor will automatically`,
        `include it in every chat and Composer session for this project.`,
        ``,
        `No further action needed. Open Cursor and continue working.`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, CURSOR_RULES_DIR, CURSOR_HANDOFF_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
