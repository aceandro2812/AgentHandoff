import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AGENTHANDOFF_BEGIN = '<!-- AGENTHANDOFF:BEGIN -->';
const AGENTHANDOFF_END = '<!-- AGENTHANDOFF:END -->';

/** Strip the injected AgentHandoff instruction block so it doesn't pollute packet content. */
function stripHandoffBlock(content: string): string {
  const begin = content.indexOf(AGENTHANDOFF_BEGIN);
  const end = content.indexOf(AGENTHANDOFF_END);
  if (begin === -1 || end === -1) return content;
  return (content.substring(0, begin) + content.substring(end + AGENTHANDOFF_END.length)).trim();
}

// Tier 1: stable, user-controlled instruction files
const INSTRUCTION_FILES: Array<{ path: string; label: string; global?: boolean }> = [
  { path: 'CLAUDE.md',                          label: 'CLAUDE.md' },
  { path: 'AGENTS.md',                          label: 'AGENTS.md' },
  { path: 'CONVENTIONS.md',                     label: 'CONVENTIONS.md' },
  { path: '.cursorrules',                        label: '.cursorrules' },
  { path: '.windsurfrules',                      label: '.windsurfrules' },
  { path: '.clinerules',                         label: '.clinerules' },
  { path: '.github/copilot-instructions.md',    label: 'copilot-instructions' },
  { path: 'codex.md',                            label: 'codex.md' },
  { path: 'GEMINI.md',                           label: 'GEMINI.md' },
  { path: '.idx/airules.md',                     label: 'firebase-studio-rules' },
];

const GLOBAL_INSTRUCTION_FILES: Array<{ path: () => string; label: string }> = [
  {
    path: () => join(homedir(), '.claude', 'CLAUDE.md'),
    label: 'Global CLAUDE.md',
  },
];

export interface InstructionFile {
  label: string;
  path: string;
  content: string;
}

export function captureInstructionFiles(
  projectRoot: string,
  excludePaths: string[] = [],
): InstructionFile[] {
  const results: InstructionFile[] = [];

  for (const { path, label } of INSTRUCTION_FILES) {
    if (excludePaths.includes(path)) continue;
    const fullPath = join(projectRoot, path);
    if (existsSync(fullPath)) {
      const content = stripHandoffBlock(readFileSync(fullPath, 'utf8').trim());
      if (content) results.push({ label, path: fullPath, content });
    }
  }

  for (const { path, label } of GLOBAL_INSTRUCTION_FILES) {
    const fullPath = path();
    if (existsSync(fullPath)) {
      const content = stripHandoffBlock(readFileSync(fullPath, 'utf8').trim());
      if (content) results.push({ label, path: fullPath, content });
    }
  }

  return results;
}
