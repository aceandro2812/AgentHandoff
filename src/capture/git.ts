import { execSync } from 'child_process';

export interface GitContext {
  currentBranch: string;
  status: string;
  diff: string;
  recentLog: string;
  modifiedFiles: string[];
  stagedFiles: string[];
  untrackedFiles: string[];
}

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

export function captureGitContext(projectRoot: string): GitContext {
  const currentBranch = run('git rev-parse --abbrev-ref HEAD', projectRoot);
  const statusRaw = run('git status --porcelain', projectRoot);
  const diff = run('git diff --stat HEAD', projectRoot);
  const recentLog = run('git log --oneline -15', projectRoot);

  const lines = statusRaw.split('\n').filter(Boolean);
  const modifiedFiles: string[] = [];
  const stagedFiles: string[] = [];
  const untrackedFiles: string[] = [];

  for (const line of lines) {
    const code = line.slice(0, 2);
    const file = line.slice(3).trim();
    if (code.startsWith('?')) untrackedFiles.push(file);
    else if (code[0] !== ' ' && code[0] !== '?') stagedFiles.push(file);
    if (code[1] !== ' ' && code[1] !== '?') modifiedFiles.push(file);
  }

  return {
    currentBranch,
    status: statusRaw,
    diff,
    recentLog,
    modifiedFiles,
    stagedFiles,
    untrackedFiles,
  };
}

export function formatGitContext(ctx: GitContext): string {
  const parts: string[] = [];

  if (ctx.currentBranch) {
    parts.push(`Branch: ${ctx.currentBranch}`);
  }

  if (ctx.modifiedFiles.length > 0) {
    parts.push(`\nModified files:\n${ctx.modifiedFiles.map(f => `  - ${f}`).join('\n')}`);
  }

  if (ctx.stagedFiles.length > 0) {
    parts.push(`\nStaged files:\n${ctx.stagedFiles.map(f => `  - ${f}`).join('\n')}`);
  }

  if (ctx.recentLog) {
    parts.push(`\nRecent commits:\n${ctx.recentLog.split('\n').map(l => `  ${l}`).join('\n')}`);
  }

  if (ctx.diff) {
    parts.push(`\nChange summary:\n${ctx.diff}`);
  }

  return parts.join('\n');
}
