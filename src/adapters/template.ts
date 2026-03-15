/**
 * Community Adapter Template
 * ─────────────────────────────────────────────────────────────────────────
 * Use this template to add support for a new AI coding agent.
 * An "adapter" consists of two parts:
 *
 *   1. SOURCE READER  (src/capture/<agent-name>.ts)
 *      Reads context FROM the agent (Tier 1 or Tier 2).
 *
 *   2. INJECTOR       (src/inject/<agent-name>.ts)
 *      Writes context INTO the agent.
 *
 * After implementing both, register them in:
 *   - src/packet/schema.ts  → add to SUPPORTED_SOURCE_AGENTS / SUPPORTED_TARGET_AGENTS
 *   - src/packet/builder.ts → call your source reader in the agent-specific block
 *   - src/cli/inject.ts     → add your injector to getInjector()
 *   - src/cli/clean.ts      → add your injector to the injectors array
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TIER GUIDELINES
 * ─────────────────────────────────────────────────────────────────────────
 * Tier 1 (preferred): files the user controls and that have stable formats.
 *   Examples: *.md, *.json config, *.yaml, .env.example, git output
 *
 * Tier 2 (opt-in via --sessions): documented but potentially unstable.
 *   Examples: session JSONL, chat history logs
 *
 * Tier 3 (experimental plugin only): private app databases, undocumented
 *   internal state. Do NOT use Tier 3 in the default build path.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════════════
// PART 1: SOURCE READER  (copy to src/capture/my-agent.ts)
// ══════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface MyAgentContext {
  /** Human-readable label for audit/provenance */
  source: string;
  /** The raw text content extracted */
  content: string;
  /** True if this came from a Tier 1 (stable) source */
  isTier1: boolean;
}

/**
 * Capture context from MyAgent.
 *
 * @param projectRoot  Absolute path to the project root
 * @returns  Extracted context, or null if nothing found
 */
export function captureMyAgent(projectRoot: string): MyAgentContext | null {
  // ── Example: read a Tier 1 instruction file ──────────────────────────
  const configPath = join(projectRoot, 'my-agent.md'); // adjust to actual filename
  if (!existsSync(configPath)) return null;

  const content = readFileSync(configPath, 'utf8').trim();
  if (!content) return null;

  return {
    source: 'my-agent.md',
    content,
    isTier1: true,
  };
}

/**
 * Format captured context for inclusion in the raw context string
 * that gets passed to the LLM compressor or rule-based extractor.
 */
export function formatMyAgentContext(ctx: MyAgentContext): string {
  return `[${ctx.source}]\n${ctx.content}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PART 2: INJECTOR  (copy to src/inject/my-agent.ts)
// ══════════════════════════════════════════════════════════════════════════

import { writeFileSync, unlinkSync } from 'fs';
import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import { ensureHandoffDir } from '../utils/config.js';
import { InjectionResult, Injector } from '../inject/base.js';

const MY_AGENT_HANDOFF_FILE = 'my-agent-handoff.md';

export class MyAgentInjector implements Injector {
  async inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult> {
    ensureHandoffDir(projectRoot);

    // Write to .agenthandoff/ — NEVER mutate durable instruction files
    const injectionPath = join(projectRoot, '.agenthandoff', MY_AGENT_HANDOFF_FILE);
    writeFileSync(injectionPath, renderPacketAsMarkdown(packet), 'utf8');

    return {
      files_written: [injectionPath],
      instructions: [
        `Handoff context written to: .agenthandoff/${MY_AGENT_HANDOFF_FILE}`,
        ``,
        // Provide agent-specific usage instructions here:
        `To use with MyAgent:`,
        `  my-agent --context .agenthandoff/${MY_AGENT_HANDOFF_FILE}`,
      ].join('\n'),
    };
  }

  async clean(projectRoot: string): Promise<string[]> {
    const removed: string[] = [];
    const injectionPath = join(projectRoot, '.agenthandoff', MY_AGENT_HANDOFF_FILE);
    if (existsSync(injectionPath)) {
      unlinkSync(injectionPath);
      removed.push(injectionPath);
    }
    return removed;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CHECKLIST
// ══════════════════════════════════════════════════════════════════════════
//
//  [ ] Rename captureMyAgent → captureYourAgent, MyAgentInjector → YourAgentInjector
//  [ ] Replace 'my-agent' with your agent's name throughout
//  [ ] Add 'your-agent' to SUPPORTED_SOURCE_AGENTS and SUPPORTED_TARGET_AGENTS in schema.ts
//  [ ] Call captureYourAgent in builder.ts inside the agent-specific block
//  [ ] Register YourAgentInjector in getInjector() in cli/inject.ts
//  [ ] Add YourAgentInjector to the injectors array in cli/clean.ts
//  [ ] Add AGENT_DESCRIPTIONS entry in schema.ts
//  [ ] Write a test: does inject produce a readable file? does clean remove it?
//  [ ] Submit a PR — community contributions welcome!
