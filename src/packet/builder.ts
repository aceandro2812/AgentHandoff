import { captureGitContext, formatGitContext } from '../capture/git.js';
import { captureInstructionFiles } from '../capture/instruction-files.js';
import { captureTaskFiles } from '../capture/task-files.js';
import { captureClaudeSession, formatSessionContext } from '../capture/claude-session.js';
import { captureCursorRules, formatCursorRules } from '../capture/cursor-rules.js';
import { captureAiderSession, formatAiderContext } from '../capture/aider-session.js';
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
  useSessions?: boolean;     // legacy flag, now auto-enabled for claude-code
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
  // Exclude files that the agent-specific reader will capture to avoid duplication.
  const agentOwnedPaths: string[] = [];
  if (sourceAgent === 'aider') agentOwnedPaths.push('CONVENTIONS.md');
  if (sourceAgent === 'cursor') agentOwnedPaths.push('.cursorrules');
  if (sourceAgent === 'firebase-studio') agentOwnedPaths.push('.idx/airules.md');

  const instructionFiles = captureInstructionFiles(projectRoot, agentOwnedPaths);
  for (const f of instructionFiles) sourcesUsed.push(f.label);

  // ── Tier 1: Task files ─────────────────────────────────────────────────
  const taskCtx = captureTaskFiles(projectRoot);
  if (taskCtx.todos.length > 0) sourcesUsed.push('.claude/todos.json');

  // ── Tier 1: Manual notes ───────────────────────────────────────────────
  const manualNotes = readNotes(projectRoot);
  if (manualNotes.length > 0) sourcesUsed.push('manual-notes');

  // ── Agent-specific Tier 1 sources ─────────────────────────────────────
  let agentSpecificContext = '';

  if (sourceAgent === 'cursor') {
    const cursorRules = captureCursorRules(projectRoot);
    if (cursorRules.length > 0) {
      agentSpecificContext = formatCursorRules(cursorRules);
      sourcesUsed.push(`cursor-rules(${cursorRules.length})`);
    }
  }

  if (sourceAgent === 'aider') {
    const aiderCtx = captureAiderSession(projectRoot);
    if (aiderCtx.conventions || aiderCtx.recentHistory) {
      agentSpecificContext = formatAiderContext(aiderCtx);
      sourcesUsed.push('aider-session');
    }
  }

  // ── Session capture ────────────────────────────────────────────────────
  // For claude-code: always read the session JSONL — this is where the real
  // context lives (files edited, decisions made, errors fixed in conversation).
  // For aider: opt-in via --sessions reads extended history.
  let sessionText = '';
  let richSession: import('../capture/claude-session.js').SessionContext | null = null;

  if (sourceAgent === 'claude-code') {
    richSession = captureClaudeSession(projectRoot);
    const formatted = formatSessionContext(richSession);
    if (formatted) {
      sessionText = formatted;
      sourcesUsed.push('claude-session');
    }
  } else if (opts.useSessions && sourceAgent === 'aider') {
    const aiderCtx = captureAiderSession(projectRoot, 20);
    if (aiderCtx.recentHistory && !agentSpecificContext.includes(aiderCtx.recentHistory)) {
      sessionText = aiderCtx.recentHistory;
      sourcesUsed.push('aider-full-history');
    }
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
      { label: 'Git Status',        content: formatGitContext(gitCtx) },
      ...instructionFiles.map(f => ({ label: f.label, content: f.content })),
      { label: 'Agent Context',     content: agentSpecificContext },
      { label: 'Session History',   content: sessionText },
      { label: 'Manual Notes',      content: manualNotes.join('\n') },
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

    // Shared classifier: route each line into warnings / decisions / facts
    function classifyLine(trimmed: string, source: string): void {
      if (/\b(warning|caution|never|don't|do not|avoid)\b/i.test(trimmed)) {
        warnings.push({ statement: trimmed, source });
      } else if (/\b(we chose|decided|decision|because|rationale|use .+ for|using .+ for)\b/i.test(trimmed)) {
        decisions.push({ statement: trimmed, related_files: [], confidence: 0.7 });
      } else if (trimmed.length > 25 && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        facts.push({ statement: trimmed, source, related_files: [] });
      }
    }

    for (const file of instructionFiles) {
      for (const line of file.content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```')) continue;
        classifyLine(trimmed, file.label);
      }
    }

    // Agent-specific context: apply the same classifier (not facts-only)
    if (agentSpecificContext) {
      const agentSource = `${sourceAgent}-context`;
      for (const line of agentSpecificContext.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
        classifyLine(trimmed, agentSource);
      }
    }

    // Session context: lift structured fields directly, classify free text
    if (richSession) {
      // Decisions extracted from conversation go directly into decisions bucket
      for (const d of richSession.decisions) {
        decisions.push({ statement: d, related_files: [], confidence: 0.6 });
      }
      // Warnings extracted from conversation
      for (const w of richSession.warnings) {
        warnings.push({ statement: w, source: 'claude-session' });
      }
      // Errors as failed_attempts hints (facts for now; user can promote)
      for (const e of richSession.errorPatterns) {
        facts.push({ statement: `[Error encountered] ${e}`, source: 'claude-session', related_files: [] });
      }
      // Auto-compaction summary as a high-value fact
      if (richSession.summary) {
        facts.push({ statement: richSession.summary.slice(0, 300), source: 'claude-session-summary', related_files: [] });
      }
    }

    // Cap to avoid bloat
    facts = facts.slice(0, 15);
    decisions = decisions.slice(0, 10);
    warnings = warnings.slice(0, 8);
  }

  // Related files: git changes + session-edited files (highest signal)
  const sessionFiles = richSession
    ? [...richSession.editedFiles, ...richSession.createdFiles]
    : [];

  const relatedFiles = [
    ...sessionFiles,
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
