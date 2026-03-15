import { callLLM, LLMConfig } from '../utils/llm.js';
import { HandoffPacket, Decision, Fact, Warning, FailedAttempt } from './schema.js';

const COMPRESSION_PROMPT = (rawContext: string, sourceAgent: string, targetAgent: string) => `
You are a context compression assistant. A developer is switching from ${sourceAgent} to ${targetAgent} on the same project.

Below is the raw context captured from their current session (instruction files, git state, notes).
Extract and structure the most important information for the next agent to resume work efficiently.

RAW CONTEXT:
${rawContext}

Return a JSON object with this exact structure (omit empty arrays):
{
  "task_state": {
    "goal": "what the developer is trying to accomplish",
    "current_step": "where they are right now",
    "blocked_on": "what is blocking them if anything",
    "next_action": "concrete next step"
  },
  "decisions": [
    { "statement": "architectural decision made", "reason": "why", "related_files": [], "confidence": 0.9 }
  ],
  "facts": [
    { "statement": "project fact or convention", "source": "where it came from", "related_files": [] }
  ],
  "warnings": [
    { "statement": "something to be careful about" }
  ],
  "failed_attempts": [
    { "what": "what was tried", "why_failed": "why it failed", "recommendation": "what to do instead" }
  ],
  "open_questions": ["unresolved questions"],
  "related_files": ["key files involved"]
}

Rules:
- Be extremely concise. Each statement should be one sentence max.
- Only include what is non-obvious from reading the code.
- Decisions must include a reason.
- Omit categories that have nothing meaningful to say.
- Do not hallucinate. Only extract what is explicitly present in the raw context.
- Return valid JSON only, no markdown fences.
`.trim();

export interface CompressionResult {
  decisions: Decision[];
  facts: Fact[];
  warnings: Warning[];
  failedAttempts: FailedAttempt[];
  openQuestions: string[];
  relatedFiles: string[];
  taskState?: HandoffPacket['task_state'];
}

export async function compressWithLLM(
  rawContext: string,
  sourceAgent: string,
  targetAgent: string,
  llmConfig: LLMConfig,
): Promise<CompressionResult> {
  const prompt = COMPRESSION_PROMPT(rawContext, sourceAgent, targetAgent);
  const response = await callLLM(llmConfig, prompt);

  // Strip markdown fences if model added them anyway
  const cleaned = response
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  const parsed = JSON.parse(cleaned) as {
    task_state?: HandoffPacket['task_state'];
    decisions?: Decision[];
    facts?: Fact[];
    warnings?: Warning[];
    failed_attempts?: FailedAttempt[];
    open_questions?: string[];
    related_files?: string[];
  };

  return {
    taskState: parsed.task_state,
    decisions: (parsed.decisions ?? []).map(d => ({
      ...d,
      related_files: d.related_files ?? [],
      confidence: d.confidence ?? 0.8,
    })),
    facts: (parsed.facts ?? []).map(f => ({
      ...f,
      related_files: f.related_files ?? [],
    })),
    warnings: parsed.warnings ?? [],
    failedAttempts: parsed.failed_attempts ?? [],
    openQuestions: parsed.open_questions ?? [],
    relatedFiles: parsed.related_files ?? [],
  };
}

/**
 * Build the raw context string to feed into the LLM compressor
 */
export function buildRawContext(parts: Array<{ label: string; content: string }>): string {
  return parts
    .filter(p => p.content.trim())
    .map(p => `=== ${p.label} ===\n${p.content.trim()}`)
    .join('\n\n');
}
