import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';

export interface CursorRule {
  filename: string;
  alwaysApply: boolean;
  description: string;
  content: string;
}

/**
 * Tier 1: read .cursor/rules/*.mdc and .cursorrules (legacy)
 * Strips YAML frontmatter before returning content.
 */
export function captureCursorRules(projectRoot: string): CursorRule[] {
  const rules: CursorRule[] = [];

  // Modern rules directory
  const rulesDir = join(projectRoot, '.cursor', 'rules');
  if (existsSync(rulesDir)) {
    for (const filename of readdirSync(rulesDir)) {
      if (extname(filename) !== '.mdc') continue;
      // Skip our own injection file
      if (filename === 'agenthandoff.mdc') continue;
      try {
        const raw = readFileSync(join(rulesDir, filename), 'utf8');
        rules.push(parseMDC(filename, raw));
      } catch { /* skip */ }
    }
  }

  // Legacy single file
  const legacy = join(projectRoot, '.cursorrules');
  if (existsSync(legacy)) {
    const content = readFileSync(legacy, 'utf8').trim();
    if (content) {
      rules.push({
        filename: '.cursorrules',
        alwaysApply: true,
        description: 'Legacy Cursor rules',
        content,
      });
    }
  }

  return rules;
}

function parseMDC(filename: string, raw: string): CursorRule {
  // Extract YAML frontmatter between --- delimiters
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { filename, alwaysApply: false, description: '', content: raw.trim() };
  }

  const fm = fmMatch[1] ?? '';
  const body = fmMatch[2]?.trim() ?? '';

  const alwaysApply = /alwaysApply:\s*true/i.test(fm);
  const descMatch = fm.match(/description:\s*(.+)/);
  const description = descMatch?.[1]?.trim() ?? '';

  return { filename, alwaysApply, description, content: body };
}

export function formatCursorRules(rules: CursorRule[]): string {
  if (rules.length === 0) return '';
  return rules
    .map(r => `[${r.filename}${r.alwaysApply ? ' (always)' : ''}]\n${r.content}`)
    .join('\n\n');
}
