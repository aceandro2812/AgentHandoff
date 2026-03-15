import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir, INJECTION_MD } from '../utils/config.js';
import { InjectionResult, Injector } from './base.js';

/**
 * Generic injector: writes .agenthandoff/injection.md
 * Does NOT mutate any durable instruction files.
 */
export class GenericInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    const injectionPath = join(projectRoot, '.agenthandoff', INJECTION_MD);
    const content = renderPacketAsMarkdown(packet);
    writeFileSync(injectionPath, content, 'utf8');

    return {
      files_written: [injectionPath],
      instructions: `Context written to .agenthandoff/injection.md\n\nTo use with your agent, reference this file at the start of your session:\n  "Read .agenthandoff/injection.md for project handoff context before starting."`,
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', INJECTION_MD);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}
