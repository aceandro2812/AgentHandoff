import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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
      const content = readFileSync(fullPath, 'utf8').trim();
      if (content) results.push({ label, path: fullPath, content });
    }
  }

  for (const { path, label } of GLOBAL_INSTRUCTION_FILES) {
    const fullPath = path();
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8').trim();
      if (content) results.push({ label, path: fullPath, content });
    }
  }

  return results;
}
