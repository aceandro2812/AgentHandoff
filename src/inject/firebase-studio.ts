import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir } from '../utils/config.js';
import { InjectionResult, Injector } from './base.js';

const FIREBASE_INJECTION_FILE = 'firebase-studio-handoff.md';

/**
 * Firebase Studio (formerly Project IDX / Antigravity) injector.
 * Writes .agenthandoff/firebase-studio-handoff.md.
 * Does NOT mutate .idx/airules.md.
 */
export class FirebaseStudioInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    const injectionPath = join(projectRoot, '.agenthandoff', FIREBASE_INJECTION_FILE);
    writeFileSync(injectionPath, renderPacketAsMarkdown(packet), 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .agenthandoff/${FIREBASE_INJECTION_FILE}`,
        ``,
        `To use with Firebase Studio (Gemini in IDX):`,
        `  Open a new Gemini chat in Firebase Studio and send:`,
        `  "Read .agenthandoff/${FIREBASE_INJECTION_FILE} before continuing work."`,
        ``,
        `Or add to .idx/airules.md (temporary, remove after session):`,
        `  ## Active Handoff`,
        `  See .agenthandoff/${FIREBASE_INJECTION_FILE} for context from a previous agent.`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', FIREBASE_INJECTION_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
