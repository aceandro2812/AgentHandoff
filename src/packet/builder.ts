import { captureGitContext, formatGitContext } from '../capture/git.js';
import { captureInstructionFiles } from '../capture/instruction-files.js';
import { captureTaskFiles } from '../capture/task-files.js';
import { captureClaudeSession } from '../capture/claude-session.js';
import { readNotes, getProjectId } from '../utils/config.js';
import { redactObject } from '../security/redact.js';
import { loadLLMConfig, LLMConfig } from '../utils/llm.js';
import { compressWithLLM, buildRawContext } from './compressor.js';
import {
  HandoffPacket,
  Decision,
  Fact,
  Warning,
  TaskState,
  SourceAgent,
  TargetAgent,
} from './schema.js';

export interface BuildOptions {
  projectRoot: string;
  sourceAgent: SourceAgent;
  targetAgent: TargetAgent;
  useLLM?: boolean;          // opt-in LLM compression
  useSessions?: boolean;     // opt-in Tier 2: agent session files
  skipRedaction?: boolean;
}

export interface BuildResult {
  packet: HandoffPacket;
  redactedCount: number;
  sourcesUsed: string[];
  warnings: string[];
  llmUsed: boolean;
}

export async function buildPacket(opts: BuildOptions): Promise<BuildResult> {
  const { projectRoot, sourceAgent, targetAgent } = opts;
  const sourcesUsed: string[] = [];
  const buildWarnings: string[] = [];

  // ── Tier 1: Git ────────────────────────────────────────────────────────
  const gitCtx = captureGitContext(projectRoot);
  if (gitCtx.currentBranch) sourcesUsed.push('git-status');

  // ── Tier 1: Instruction files ──────────────────────────────────────────
  const instructionFiles = captureInstructionFiles(projectRoot);
  for (const f of instructionFiles) sourcesUsed.push(f.label);

  // ── Tier 1: Task files ─────────────────────────────────────────────────
  const taskCtx = captureTaskFiles(projectRoot);
  if (taskCtx.todos.length > 0) sourcesUsed.push('.claude/todos.json');

  // ── Tier 1: Manual notes ───────────────────────────────────────────────
  const manualNotes = readNotes(projectRoot);
  if (manualNotes.length > 0) sourcesUsed.push('manual-notes');

  // ── Tier 2: Claude session (opt-in) ────────────────────────────────────
  let sessionText = '';
  if (opts.useSessions && sourceAgent === 'claude-code') {
    sessionText = captureClaudeSession(projectRoot);
    if (sessionText) sourcesUsed.push('claude-session');
  }

  // ── Determine LLM config ───────────────────────────────────────────────
  let llmConfig: LLMConfig | null = null;
  if (opts.useLLM) {
    llmConfig = loadLLMConfig();
    if (!llmConfig) {
      buildWarnings.push(
        'LLM compression requested but no API key found. ' +
        'Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run `agenthandoff config --key <key>`.'
      );
    }
  }

  // ── Build packet ───────────────────────────────────────────────────────
  let decisions: Decision[] = [];
  let facts: Fact[] = [];
  let warnings: Warning[] = [];
  let failedAttempts: HandoffPacket['failed_attempts'] = [];
  let openQuestions: string[] = [];
  let taskState: TaskState | undefined;
  let llmUsed = false;

  if (llmConfig) {
    // ── LLM compression path ───────────────────────────────────────────
    const rawParts = [
      { label: 'Git Status', content: formatGitContext(gitCtx) },
      ...instructionFiles.map(f => ({ label: f.label, content: f.content })),
      { label: 'Manual Notes', content: manualNotes.join('\n') },
      { label: 'Claude Session', content: sessionText },
    ];

    const rawContext = buildRawContext(rawParts);
    const compressed = await compressWithLLM(rawContext, sourceAgent, targetAgent, llmConfig);

    decisions = compressed.decisions;
    facts = compressed.facts;
    warnings = compressed.warnings;
    failedAttempts = compressed.failedAttempts;
    openQuestions = compressed.openQuestions;
    taskState = compressed.taskState;
    llmUsed = true;
  } else {
    // ── Rule-based extraction path (default) ───────────────────────────
    const pendingTodos = taskCtx.todos.filter(t => t.status !== 'completed');
    if (pendingTodos.length > 0) {
      taskState = {
        goal: pendingTodos[0]!.content,
        current_step: pendingTodos.slice(1).map(t => t.content).join('; ') || undefined,
      };
    }

    for (const file of instructionFiles) {
      const lines = file.content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```')) continue;

        if (/\b(warning|caution|never|don't|do not|avoid)\b/i.test(trimmed)) {
          warnings.push({ statement: trimmed, source: file.label });
        } else if (/\b(we chose|decided|decision|because|rationale|use .+ for|using .+ for)\b/i.test(trimmed)) {
          decisions.push({ statement: trimmed, related_files: [], confidence: 0.7 });
        } else if (trimmed.length > 25 && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
          facts.push({ statement: trimmed, source: file.label, related_files: [] });
        }
      }
    }

    // Cap to avoid bloat
    facts = facts.slice(0, 12);
    decisions = decisions.slice(0, 8);
    warnings = warnings.slice(0, 6);
  }

  const relatedFiles = [
    ...gitCtx.modifiedFiles,
    ...gitCtx.stagedFiles,
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 20);

  const rawPacket: HandoffPacket = {
    schema_version: '1.0',
    project_id: getProjectId(projectRoot),
    project_path: projectRoot,
    created_at: new Date().toISOString(),
    source_agent: sourceAgent,
    target_agent: targetAgent,
    task_state: taskState,
    decisions,
    facts,
    warnings,
    failed_attempts: failedAttempts,
    related_files: relatedFiles,
    open_questions: openQuestions,
    manual_notes: manualNotes,
    provenance: {
      capture_method: llmUsed ? 'llm-compressed' : 'tier1-rule-based',
      sources_used: sourcesUsed,
      llm_used_for_compression: llmUsed ? llmConfig!.model : undefined,
      review_status: 'draft',
    },
  };

  // ── Redaction ──────────────────────────────────────────────────────────
  let finalPacket = rawPacket;
  let redactedCount = 0;

  if (!opts.skipRedaction) {
    const { result, totalRedactions } = redactObject(rawPacket);
    finalPacket = result;
    redactedCount = totalRedactions;
  }

  if (sourcesUsed.length === 0) {
    buildWarnings.push('No source files found. Add manual notes with `agenthandoff add`.');
  }

  return { packet: finalPacket, redactedCount, sourcesUsed, warnings: buildWarnings, llmUsed };
}
