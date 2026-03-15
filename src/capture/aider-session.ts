import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const HISTORY_FILE = '.aider.chat.history.md';
const CONVENTIONS_FILE = 'CONVENTIONS.md';

export interface AiderContext {
  conventions: string;
  recentHistory: string;
  historyTurns: number;
}

/**
 * Tier 2: read Aider's chat history and conventions file.
 * The history is an append-only markdown log — we extract the most recent turns.
 */
export function captureAiderSession(projectRoot: string, maxTurns = 8): AiderContext {
  const conventions = readOptional(join(projectRoot, CONVENTIONS_FILE));
  const historyRaw  = readOptional(join(projectRoot, HISTORY_FILE));

  const { recentHistory, historyTurns } = extractRecentHistory(historyRaw, maxTurns);

  return { conventions, recentHistory, historyTurns };
}

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

/**
 * Aider writes history in markdown with `#### <role>/<datetime>` headers.
 * Extract the last N assistant turns to surface recent decisions.
 */
function extractRecentHistory(raw: string, maxTurns: number): { recentHistory: string; historyTurns: number } {
  if (!raw) return { recentHistory: '', historyTurns: 0 };

  // Split on turn headers
  const turnPattern = /^#### aider\//m;
  const turns = raw.split(turnPattern).filter(Boolean);

  const recent = turns.slice(-maxTurns);
  const recentHistory = recent
    .map(t => t.trim())
    .filter(t => t.length > 50) // skip empty/trivial turns
    .join('\n\n---\n\n');

  return { recentHistory, historyTurns: recent.length };
}

export function formatAiderContext(ctx: AiderContext): string {
  const parts: string[] = [];

  if (ctx.conventions) {
    parts.push(`Aider conventions:\n${ctx.conventions}`);
  }

  if (ctx.recentHistory) {
    parts.push(`Recent Aider session (last ${ctx.historyTurns} turns):\n${ctx.recentHistory.slice(0, 3000)}`);
  }

  return parts.join('\n\n');
}
