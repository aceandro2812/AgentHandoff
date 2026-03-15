import { HandoffPacket } from './schema.js';

/**
 * Render an ultra-compressed (~150-200 token) inline handoff block.
 *
 * Designed to be pasted as the FIRST MESSAGE in a new agent session.
 * The format is structured key:value — machine-friendly, token-minimal.
 * No prose, no markdown headers — just the signal the next agent needs.
 *
 * Example output:
 *
 *   [HANDOFF claude-code→codex | 2026-03-15]
 *   task: implement JWT auth refresh endpoint
 *   files: src/auth/routes.ts, src/auth/middleware.ts
 *   decided: use access+refresh token pair | 15min/7day expiry
 *   warn: never store raw tokens in DB | bcrypt only
 *   failed: Redis for token blacklist (latency ~200ms)
 *   next: implement /auth/refresh handler at src/auth/routes.ts:45
 *   [/HANDOFF]
 */
export function renderInlineBlock(packet: HandoffPacket): string {
  const date = new Date(packet.created_at).toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`[HANDOFF ${packet.source_agent}→${packet.target_agent} | ${date}]`);

  // Task state — the most important field
  if (packet.task_state?.goal) {
    lines.push(`task: ${packet.task_state.goal}`);
  }
  if (packet.task_state?.current_step) {
    lines.push(`step: ${packet.task_state.current_step}`);
  }
  if (packet.task_state?.blocked_on) {
    lines.push(`BLOCKED: ${packet.task_state.blocked_on}`);
  }

  // Key files (most relevant, capped at 6)
  if (packet.related_files.length > 0) {
    lines.push(`files: ${packet.related_files.slice(0, 6).join(', ')}`);
  }

  // Decisions — pipe-separated, truncated to fit
  if (packet.decisions.length > 0) {
    const stmts = packet.decisions
      .slice(0, 4)
      .map(d => truncate(d.statement, 80))
      .join(' | ');
    lines.push(`decided: ${stmts}`);
  }

  // Warnings — pipe-separated
  if (packet.warnings.length > 0) {
    const stmts = packet.warnings
      .slice(0, 3)
      .map(w => truncate(w.statement, 80))
      .join(' | ');
    lines.push(`warn: ${stmts}`);
  }

  // Failed attempts
  if (packet.failed_attempts.length > 0) {
    const stmts = packet.failed_attempts
      .slice(0, 2)
      .map(f => `${truncate(f.what, 60)}${f.why_failed ? ` (${truncate(f.why_failed, 40)})` : ''}`)
      .join(' | ');
    lines.push(`failed: ${stmts}`);
  }

  // Next action — most actionable line
  if (packet.task_state?.next_action) {
    lines.push(`next: ${packet.task_state.next_action}`);
  }

  // Manual notes (last 2)
  if (packet.manual_notes.length > 0) {
    const notes = packet.manual_notes.slice(-2).map(n => truncate(n, 80)).join(' | ');
    lines.push(`notes: ${notes}`);
  }

  lines.push('[/HANDOFF]');
  lines.push('');
  lines.push('Acknowledge the above context, then continue from where the previous agent left off.');

  return lines.join('\n');
}

/**
 * Estimate token count of the inline block (rough: ~0.75 tokens per word).
 */
export function estimateInlineTokens(block: string): number {
  return Math.ceil(block.split(/\s+/).length * 0.75);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
