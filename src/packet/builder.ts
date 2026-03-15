import { captureGitContext, formatGitContext } from '../capture/git.js';
import { captureInstructionFiles } from '../capture/instruction-files.js';
import { captureTaskFiles } from '../capture/task-files.js';
import { readNotes, getProjectId } from '../utils/config.js';
import { redactObject } from '../security/redact.js';
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
  skipRedaction?: boolean;
}

export interface BuildResult {
  packet: HandoffPacket;
  redactedCount: number;
  sourcesUsed: string[];
  warnings: string[];
}

export async function buildPacket(opts: BuildOptions): Promise<BuildResult> {
  const { projectRoot, sourceAgent, targetAgent } = opts;
  const sourcesUsed: string[] = [];
  const buildWarnings: string[] = [];

  // --- Git context (Tier 1) ---
  const gitCtx = captureGitContext(projectRoot);
  if (gitCtx.currentBranch) sourcesUsed.push('git-status');

  // --- Instruction files (Tier 1) ---
  const instructionFiles = captureInstructionFiles(projectRoot);
  for (const f of instructionFiles) sourcesUsed.push(f.label);

  // --- Task files (Tier 1) ---
  const taskCtx = captureTaskFiles(projectRoot);
  if (taskCtx.todos.length > 0) sourcesUsed.push('.claude/todos.json');

  // --- Manual notes (Tier 1) ---
  const manualNotes = readNotes(projectRoot);
  if (manualNotes.length > 0) sourcesUsed.push('manual-notes');

  // --- Derive task state from todos + git ---
  let taskState: TaskState | undefined;
  const pendingTodos = taskCtx.todos.filter(t => t.status !== 'completed');
  if (pendingTodos.length > 0) {
    taskState = {
      goal: pendingTodos[0].content,
      current_step: pendingTodos.slice(1).map(t => t.content).join('; ') || undefined,
    };
  }

  // --- Extract facts from instruction files ---
  const facts: Fact[] = [];
  const warnings: Warning[] = [];
  const decisions: Decision[] = [];

  for (const file of instructionFiles) {
    const lines = file.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Heuristics: lines with "always", "never", "must", "warning" → warnings
      if (/\b(warning|caution|never|don't|do not)\b/i.test(trimmed)) {
        warnings.push({ statement: trimmed, source: file.label });
      }
      // Lines with "we chose", "decision", "because" → decisions
      else if (/\b(we chose|decided|decision|because|rationale)\b/i.test(trimmed)) {
        decisions.push({ statement: trimmed, related_files: [], confidence: 0.7 });
      }
      // Everything else → facts
      else if (trimmed.length > 20 && !trimmed.startsWith('```') && !trimmed.startsWith('-')) {
        facts.push({ statement: trimmed, source: file.label, related_files: [] });
      }
    }
  }

  // Key modified files from git
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
    facts: facts.slice(0, 15), // cap to avoid bloat
    warnings,
    failed_attempts: [],
    related_files: relatedFiles,
    open_questions: [],
    manual_notes: manualNotes,
    provenance: {
      capture_method: 'tier1-rule-based',
      sources_used: sourcesUsed,
      review_status: 'draft',
    },
  };

  // Redaction
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

  return {
    packet: finalPacket,
    redactedCount,
    sourcesUsed,
    warnings: buildWarnings,
  };
}
