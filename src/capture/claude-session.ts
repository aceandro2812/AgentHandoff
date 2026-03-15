import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

interface ClaudeMessage {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

interface ClaudeSessionEntry {
  type?: string;
  message?: ClaudeMessage;
  summary?: string;
}

/**
 * Tier 2: Read Claude Code session JSONL files.
 * Returns the most recent session summary for the given project.
 */
export function captureClaudeSession(projectRoot: string): string {
  const projectHash = findClaudeProjectHash(projectRoot);
  if (!projectHash) return '';

  const sessionDir = join(homedir(), '.claude', 'projects', projectHash);
  if (!existsSync(sessionDir)) return '';

  // Find the most recently modified JSONL file
  const files = readdirSync(sessionDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, mtime: statSync(join(sessionDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) return '';

  const latest = join(sessionDir, files[0]!.f);
  return extractSessionSummary(latest);
}

function findClaudeProjectHash(projectRoot: string): string | null {
  const projectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) return null;

  // Claude Code hashes the project path — try to find a match by checking
  // for a JSONL that references our project root in its messages
  const hashes = readdirSync(projectsDir);
  for (const hash of hashes) {
    const dir = join(projectsDir, hash);
    const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    for (const file of files.slice(0, 1)) {
      try {
        const content = readFileSync(join(dir, file), 'utf8');
        if (content.includes(projectRoot.replace(/\\/g, '/'))) {
          return hash;
        }
      } catch {
        // ignore
      }
    }
  }

  // Fallback: SHA256 of the project root (Claude's actual hashing method)
  return createHash('sha256').update(projectRoot.replace(/\\/g, '/')).digest('hex');
}

function extractSessionSummary(jsonlPath: string): string {
  const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  const summaries: string[] = [];
  const assistantMessages: string[] = [];

  for (const line of lines) {
    try {
      const entry: ClaudeSessionEntry = JSON.parse(line);

      // Capture auto-compaction summaries (highest value)
      if (entry.type === 'summary' && entry.summary) {
        summaries.push(entry.summary);
        continue;
      }

      // Capture assistant messages
      if (entry.message?.role === 'assistant') {
        const text = extractText(entry.message.content);
        if (text && text.length > 100) {
          assistantMessages.push(text);
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  // Prefer summaries (compact output), fall back to last few assistant messages
  if (summaries.length > 0) {
    return `Session summary:\n${summaries.join('\n\n')}`;
  }

  if (assistantMessages.length > 0) {
    // Take the last 5 substantial assistant messages
    const recent = assistantMessages.slice(-5);
    return `Recent session activity:\n${recent.map((m, i) => `[${i + 1}] ${m.slice(0, 500)}`).join('\n\n')}`;
  }

  return '';
}

function extractText(content: ClaudeMessage['content']): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('\n');
}
