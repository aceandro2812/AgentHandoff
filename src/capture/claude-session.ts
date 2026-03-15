import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;         // tool_use: tool name
  input?: Record<string, unknown>; // tool_use: arguments
  content?: string | Array<{ type: string; text?: string }>; // tool_result
}

interface ClaudeMessage {
  role?: string;
  content?: string | ContentBlock[];
}

interface ClaudeSessionEntry {
  type?: string;
  message?: ClaudeMessage;
  summary?: string;
}

export interface SessionContext {
  summary?: string;
  editedFiles: string[];
  createdFiles: string[];
  commandsRun: string[];
  errorPatterns: string[];
  decisions: string[];
  warnings: string[];
  recentAssistantText?: string;
}

/**
 * Tier 1 (for --from claude-code): read and deeply parse the Claude Code session JSONL.
 * Extracts: files edited/created, commands run, errors, decisions, warnings.
 */
export function captureClaudeSession(projectRoot: string): SessionContext {
  const empty: SessionContext = {
    editedFiles: [], createdFiles: [], commandsRun: [],
    errorPatterns: [], decisions: [], warnings: [],
  };

  const projectHash = findClaudeProjectHash(projectRoot);
  if (!projectHash) return empty;

  const sessionDir = join(homedir(), '.claude', 'projects', projectHash);
  if (!existsSync(sessionDir)) return empty;

  const files = readdirSync(sessionDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, mtime: statSync(join(sessionDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) return empty;

  const latest = join(sessionDir, files[0]!.f);
  return parseSessionDeep(latest);
}

function findClaudeProjectHash(projectRoot: string): string | null {
  const projectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) return null;

  const normalizedRoot = projectRoot.replace(/\\/g, '/');

  for (const hash of readdirSync(projectsDir)) {
    const dir = join(projectsDir, hash);
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
      for (const file of files.slice(0, 2)) {
        const content = readFileSync(join(dir, file), 'utf8');
        if (content.includes(normalizedRoot)) return hash;
      }
    } catch { /* skip */ }
  }

  // Fallback: Claude's actual hashing method
  return createHash('sha256').update(normalizedRoot).digest('hex');
}

function parseSessionDeep(jsonlPath: string): SessionContext {
  const ctx: SessionContext = {
    editedFiles: [], createdFiles: [], commandsRun: [],
    errorPatterns: [], decisions: [], warnings: [],
  };

  const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  const assistantTexts: string[] = [];

  for (const line of lines) {
    try {
      const entry: ClaudeSessionEntry = JSON.parse(line);

      // Highest-value: auto-compaction summaries
      if (entry.type === 'summary' && entry.summary) {
        ctx.summary = entry.summary;
        continue;
      }

      if (entry.message?.role !== 'assistant') continue;
      const blocks = normalizeContent(entry.message.content);

      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          assistantTexts.push(block.text);
          extractDecisionsAndWarnings(block.text, ctx);
        }

        if (block.type === 'tool_use') {
          extractToolUseContext(block, ctx);
        }
      }
    } catch { /* skip malformed */ }
  }

  // Dedup
  ctx.editedFiles  = [...new Set(ctx.editedFiles)];
  ctx.createdFiles = [...new Set(ctx.createdFiles)];
  ctx.commandsRun  = [...new Set(ctx.commandsRun)].slice(0, 10);
  ctx.decisions    = [...new Set(ctx.decisions)].slice(0, 8);
  ctx.warnings     = [...new Set(ctx.warnings)].slice(0, 6);
  ctx.errorPatterns = [...new Set(ctx.errorPatterns)].slice(0, 5);

  // Keep the last meaningful assistant message as a text fallback
  const lastSubstantial = assistantTexts.filter(t => t.length > 80).slice(-1)[0];
  if (lastSubstantial && !ctx.summary) {
    ctx.recentAssistantText = lastSubstantial.slice(0, 600);
  }

  return ctx;
}

function normalizeContent(content: ClaudeMessage['content']): ContentBlock[] {
  if (!content) return [];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content as ContentBlock[];
}

function extractToolUseContext(block: ContentBlock, ctx: SessionContext): void {
  const name = block.name ?? '';
  const input = block.input ?? {};

  switch (name) {
    case 'Edit': {
      const fp = String(input['file_path'] ?? '');
      if (fp) ctx.editedFiles.push(relativishPath(fp));
      break;
    }
    case 'Write': {
      const fp = String(input['file_path'] ?? '');
      if (fp) ctx.createdFiles.push(relativishPath(fp));
      break;
    }
    case 'Bash': {
      const cmd = String(input['command'] ?? '').slice(0, 120).trim();
      if (cmd && !cmd.startsWith('cat ') && !cmd.startsWith('echo ')) {
        ctx.commandsRun.push(cmd);
        // Capture build errors
        if (/npm run build|tsc|jest|pytest/.test(cmd)) {
          ctx.commandsRun.push(cmd);
        }
      }
      break;
    }
    case 'MultiEdit': {
      const edits = input['edits'] as Array<{ file_path?: string }> | undefined;
      if (Array.isArray(edits)) {
        for (const e of edits) {
          if (e.file_path) ctx.editedFiles.push(relativishPath(e.file_path));
        }
      }
      break;
    }
  }
}

function extractDecisionsAndWarnings(text: string, ctx: SessionContext): void {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')   // strip fenced code blocks
    .replace(/`[^`]+`/g, '')          // strip inline code
    .replace(/^\s*[|│].+[|│]\s*$/gm, '') // strip markdown table rows
    .replace(/^\s*[-*]\s+/gm, '');    // strip list markers

  const sentences = cleaned
    .split(/[.!?\n]/)
    .map(s => s.trim())
    // Must be a real sentence: reasonable length, not a fragment, not a header
    .filter(s =>
      s.length > 30 &&
      s.length < 200 &&
      !s.startsWith('#') &&
      !s.startsWith('//') &&
      !s.includes('`') &&
      // at least 3 words
      s.split(/\s+/).length >= 3
    );

  for (const s of sentences) {
    if (/\b(warning|caution|never|don't|do not|avoid|dangerous)\b/i.test(s)) {
      ctx.warnings.push(s);
    } else if (/\b(we chose|we decided|decision:|because|rationale|went with|using .+ for)\b/i.test(s)) {
      ctx.decisions.push(s);
    } else if (/\b(error|failed|broken|TypeError|cannot find|is not assignable)\b/i.test(s)) {
      ctx.errorPatterns.push(s);
    }
  }
}

/** Strip absolute prefix, keep last 3 path segments for readability */
function relativishPath(fp: string): string {
  const normalized = fp.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 3 ? parts.slice(-3).join('/') : normalized;
}

/**
 * Format the SessionContext into a string block for the packet builder.
 */
export function formatSessionContext(ctx: SessionContext): string {
  const parts: string[] = [];

  if (ctx.summary) {
    parts.push(`Session summary:\n${ctx.summary}`);
  }

  if (ctx.editedFiles.length > 0) {
    parts.push(`Files edited this session:\n${ctx.editedFiles.map(f => `  - ${f}`).join('\n')}`);
  }

  if (ctx.createdFiles.length > 0) {
    parts.push(`Files created this session:\n${ctx.createdFiles.map(f => `  - ${f}`).join('\n')}`);
  }

  if (ctx.commandsRun.length > 0) {
    parts.push(`Commands run:\n${ctx.commandsRun.slice(0, 6).map(c => `  $ ${c}`).join('\n')}`);
  }

  if (ctx.decisions.length > 0) {
    parts.push(`Decisions observed in session:\n${ctx.decisions.map(d => `  - ${d}`).join('\n')}`);
  }

  if (ctx.warnings.length > 0) {
    parts.push(`Warnings observed in session:\n${ctx.warnings.map(w => `  - ${w}`).join('\n')}`);
  }

  if (ctx.errorPatterns.length > 0) {
    parts.push(`Errors encountered:\n${ctx.errorPatterns.map(e => `  - ${e}`).join('\n')}`);
  }

  if (ctx.recentAssistantText && parts.length === 0) {
    parts.push(`Recent activity:\n${ctx.recentAssistantText}`);
  }

  return parts.join('\n\n');
}
