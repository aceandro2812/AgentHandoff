import { z } from 'zod';

export const DecisionSchema = z.object({
  statement: z.string(),
  reason: z.string().optional(),
  related_files: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1.0),
  added_at: z.string().optional(), // ISO timestamp when this item was added
});

export const FactSchema = z.object({
  statement: z.string(),
  source: z.string().optional(),
  related_files: z.array(z.string()).default([]),
  added_at: z.string().optional(),
});

export const WarningSchema = z.object({
  statement: z.string(),
  source: z.string().optional(),
  added_at: z.string().optional(),
});

export const FailedAttemptSchema = z.object({
  what: z.string(),
  why_failed: z.string(),
  recommendation: z.string().optional(),
  added_at: z.string().optional(),
});

export const TaskStateSchema = z.object({
  goal: z.string(),
  current_step: z.string().optional(),
  blocked_on: z.string().optional(),
  next_action: z.string().optional(),
});

export const ProvenanceSchema = z.object({
  capture_method: z.string(),
  sources_used: z.array(z.string()),
  llm_used_for_compression: z.string().optional(),
  review_status: z.enum(['draft', 'approved']).default('draft'),
});

export const HandoffPacketSchema = z.object({
  schema_version: z.string().default('1.0'),
  project_id: z.string(),
  project_path: z.string(),
  created_at: z.string(),
  source_agent: z.string(),
  target_agent: z.string(),
  task_state: TaskStateSchema.optional(),
  decisions: z.array(DecisionSchema).default([]),
  facts: z.array(FactSchema).default([]),
  warnings: z.array(WarningSchema).default([]),
  failed_attempts: z.array(FailedAttemptSchema).default([]),
  related_files: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  manual_notes: z.array(z.string()).default([]),
  provenance: ProvenanceSchema,
});

export type Decision = z.infer<typeof DecisionSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type Warning = z.infer<typeof WarningSchema>;
export type FailedAttempt = z.infer<typeof FailedAttemptSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type HandoffPacket = z.infer<typeof HandoffPacketSchema>;

export const SUPPORTED_SOURCE_AGENTS = ['claude-code', 'codex', 'cursor', 'aider', 'windsurf', 'copilot', 'gemini', 'firebase-studio', 'antigravity', 'manual'] as const;
export const SUPPORTED_TARGET_AGENTS = ['claude-code', 'codex', 'cursor', 'aider', 'windsurf', 'copilot', 'gemini', 'firebase-studio', 'antigravity', 'generic'] as const;

export const AGENT_DESCRIPTIONS: Record<string, string> = {
  'claude-code':      'Anthropic Claude Code CLI',
  'codex':            'OpenAI Codex CLI',
  'cursor':           'Cursor editor',
  'aider':            'Aider CLI',
  'windsurf':         'Windsurf (Codeium)',
  'copilot':          'GitHub Copilot (VS Code + CLI)',
  'gemini':           'Google Gemini CLI',
  'firebase-studio':  'Firebase Studio (Project IDX)',
  'antigravity':      'Google Antigravity (agentic dev platform)',
  'manual':           'Manual / no agent (notes only)',
  'generic':          'Generic (writes .agenthandoff/injection.md)',
};

export type SourceAgent = typeof SUPPORTED_SOURCE_AGENTS[number];
export type TargetAgent = typeof SUPPORTED_TARGET_AGENTS[number];
