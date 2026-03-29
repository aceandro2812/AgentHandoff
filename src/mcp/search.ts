/**
 * BM25-based context search for handoff packets.
 * No external dependencies — pure keyword scoring.
 * Used by the `get_context_for_task` MCP tool.
 */
import { HandoffPacket } from '../packet/schema.js';

interface ScoredItem {
  type: 'decision' | 'warning' | 'failed_attempt' | 'fact';
  text: string;
  score: number;
  raw: unknown;
}

/** Tokenize text into lowercase words (remove punctuation). */
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/** BM25 parameters */
const K1 = 1.5;
const B  = 0.75;

/** Compute inverse document frequency for query terms. */
function idf(term: string, docs: string[][]): number {
  const n = docs.filter(d => d.includes(term)).length;
  if (n === 0) return 0;
  return Math.log((docs.length - n + 0.5) / (n + 0.5) + 1);
}

/** BM25 score for a single document against a query. */
function bm25Score(queryTerms: string[], docTerms: string[], avgLen: number, allDocs: string[][]): number {
  let score = 0;
  const docLen = docTerms.length;
  const freq: Record<string, number> = {};
  for (const t of docTerms) freq[t] = (freq[t] ?? 0) + 1;

  for (const term of queryTerms) {
    const tf = freq[term] ?? 0;
    if (tf === 0) continue;
    const idfVal = idf(term, allDocs);
    const numerator = tf * (K1 + 1);
    const denominator = tf + K1 * (1 - B + B * (docLen / avgLen));
    score += idfVal * (numerator / denominator);
  }
  return score;
}

/** File path relevance bonus: if query mentions a path segment or vice versa. */
function pathBonus(query: string, files: string[]): number {
  const q = query.toLowerCase();
  for (const f of files) {
    const segments = f.toLowerCase().split('/').flatMap(s => s.split('\\'));
    for (const seg of segments) {
      if (seg.length > 2 && q.includes(seg)) return 0.5;
    }
  }
  return 0;
}

export interface SearchResult {
  type: 'decision' | 'warning' | 'failed_attempt' | 'fact';
  text: string;
  score: number;
  raw: unknown;
}

/**
 * Search the packet for items relevant to a task description.
 * @param packet   The handoff packet to search
 * @param task     Natural language description of the task
 * @param scope    Optional file path glob to boost scope-relevant items (e.g. "src/auth/*")
 * @param topK     Max items to return (default 8)
 * @param threshold Minimum score to include (default 0.1)
 */
export function searchContext(
  packet: HandoffPacket,
  task: string,
  scope?: string,
  topK = 8,
  threshold = 0.1,
): SearchResult[] {
  const queryTerms = tokenize(task + (scope ? ' ' + scope : ''));

  // Build corpus from all packet items
  const items: ScoredItem[] = [
    ...packet.decisions.map(d => ({
      type: 'decision' as const,
      text: [d.statement, d.reason ?? ''].join(' '),
      score: 0,
      raw: d,
    })),
    ...packet.warnings.map(w => ({
      type: 'warning' as const,
      text: w.statement,
      score: 0,
      raw: w,
    })),
    ...packet.failed_attempts.map(f => ({
      type: 'failed_attempt' as const,
      text: [f.what, f.why_failed, f.recommendation ?? ''].join(' '),
      score: 0,
      raw: f,
    })),
    ...packet.facts.map(f => ({
      type: 'fact' as const,
      text: f.statement,
      score: 0,
      raw: f,
    })),
  ];

  if (items.length === 0) return [];

  const tokenizedDocs = items.map(item => tokenize(item.text));
  const avgLen = tokenizedDocs.reduce((s, d) => s + d.length, 0) / tokenizedDocs.length;

  // Score each item
  for (let i = 0; i < items.length; i++) {
    items[i].score = bm25Score(queryTerms, tokenizedDocs[i], avgLen, tokenizedDocs);

    // Boost by file path relevance
    const raw = items[i].raw as { related_files?: string[] };
    if (raw.related_files && raw.related_files.length > 0) {
      items[i].score += pathBonus(task + ' ' + (scope ?? ''), raw.related_files);
    }
  }

  return items
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Format search results as a compact markdown string for MCP response. */
export function formatSearchResults(results: SearchResult[], task: string): string {
  if (results.length === 0) {
    return `No relevant context found for task: "${task}"`;
  }

  const lines: string[] = [`Context relevant to: "${task}"`, ''];

  const decisions = results.filter(r => r.type === 'decision');
  const warnings  = results.filter(r => r.type === 'warning');
  const failed    = results.filter(r => r.type === 'failed_attempt');
  const facts     = results.filter(r => r.type === 'fact');

  if (decisions.length > 0) {
    lines.push('**Decisions:**');
    for (const d of decisions) {
      const item = d.raw as { statement: string; reason?: string };
      lines.push(`- ${item.statement}${item.reason ? ` (${item.reason})` : ''}`);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('**Warnings:**');
    for (const w of warnings) {
      const item = w.raw as { statement: string };
      lines.push(`- ⚠ ${item.statement}`);
    }
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push('**Failed approaches:**');
    for (const f of failed) {
      const item = f.raw as { what: string; why_failed: string; recommendation?: string };
      lines.push(`- ${item.what}: ${item.why_failed}${item.recommendation ? ` → try: ${item.recommendation}` : ''}`);
    }
    lines.push('');
  }

  if (facts.length > 0) {
    lines.push('**Facts:**');
    for (const f of facts) {
      const item = f.raw as { statement: string };
      lines.push(`- ${item.statement}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
