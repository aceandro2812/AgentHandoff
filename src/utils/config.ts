import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export const HANDOFF_DIR = '.agenthandoff';
export const PACKET_JSON = 'current-handoff.json';
export const PACKET_MD = 'current-handoff.md';
export const INJECTION_MD = 'injection.md';
export const AUDIT_LOG = 'audit.log';
export const NOTES_FILE = 'notes.txt';

export function getProjectRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

export function getHandoffDir(projectRoot: string): string {
  return join(projectRoot, HANDOFF_DIR);
}

export function ensureHandoffDir(projectRoot: string): string {
  const dir = getHandoffDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getProjectId(projectRoot: string): string {
  return createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
}

export function readNotes(projectRoot: string): string[] {
  const notesPath = join(getHandoffDir(projectRoot), NOTES_FILE);
  if (!existsSync(notesPath)) return [];
  return readFileSync(notesPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

export function writeNotes(projectRoot: string, notes: string[]): void {
  ensureHandoffDir(projectRoot);
  const notesPath = join(getHandoffDir(projectRoot), NOTES_FILE);
  writeFileSync(notesPath, notes.join('\n') + '\n', 'utf8');
}

export function appendAuditLog(projectRoot: string, event: string): void {
  ensureHandoffDir(projectRoot);
  const logPath = join(getHandoffDir(projectRoot), AUDIT_LOG);
  const entry = `[${new Date().toISOString()}] ${event}\n`;
  const existing = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  writeFileSync(logPath, existing + entry, 'utf8');
}
