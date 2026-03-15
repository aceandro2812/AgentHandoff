import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { estimateTokens } from './token-counter.js';

export interface DiscoveryScenario {
  /** What the target agent would need to read without a handoff */
  coldStartFiles: Array<{ path: string; tokens: number }>;
  coldStartTokens: number;

  /** What a developer would manually write as a summary */
  manualSummaryTokens: number;
  manualSummaryTemplate: string;

  /** Token count of an AgentHandoff packet */
  packetTokens: number;
}

// Extensions worth indexing for cold-start discovery simulation
const RELEVANT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.md', '.json', '.yaml', '.yml', '.toml', '.env.example',
  '.prisma', '.graphql', '.sql',
]);

// Files an agent would likely read first when discovering a project cold
const DISCOVERY_PRIORITY = [
  'README.md', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
  'tsconfig.json', 'CLAUDE.md', 'AGENTS.md', 'CONVENTIONS.md',
  '.cursorrules', 'docker-compose.yml', 'Makefile',
];

export function buildColdStartScenario(
  projectRoot: string,
  packetMarkdown: string,
): DiscoveryScenario {
  const coldStartFiles: Array<{ path: string; tokens: number }> = [];

  // Priority files (always read first)
  for (const name of DISCOVERY_PRIORITY) {
    const fullPath = join(projectRoot, name);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      coldStartFiles.push({ path: name, tokens: estimateTokens(content) });
    }
  }

  // Source files the agent would explore (up to a cap)
  const srcDirs = ['src', 'lib', 'app', 'packages', 'server', 'client'].map(d =>
    join(projectRoot, d)
  ).filter(existsSync);

  for (const dir of srcDirs) {
    collectSourceFiles(dir, projectRoot, coldStartFiles, 30);
  }

  const coldStartTokens = coldStartFiles.reduce((s, f) => s + f.tokens, 0)
    + 500; // git log + status overhead

  // Manual summary: a typical developer writes ~150-250 words covering
  // current task, last decisions, key files. We use a template to estimate.
  const manualSummaryTemplate = buildManualTemplate();
  const manualSummaryTokens = estimateTokens(manualSummaryTemplate);

  const packetTokens = estimateTokens(packetMarkdown);

  return { coldStartFiles, coldStartTokens, manualSummaryTokens, manualSummaryTemplate, packetTokens };
}

function collectSourceFiles(
  dir: string,
  root: string,
  out: Array<{ path: string; tokens: number }>,
  limit: number,
): void {
  if (out.length >= limit) return;
  for (const entry of readdirSync(dir)) {
    if (out.length >= limit) break;
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, root, out, limit);
    } else if (RELEVANT_EXTENSIONS.has(extname(entry))) {
      const content = readFileSync(full, 'utf8');
      const rel = full.replace(root + '/', '').replace(root + '\\', '');
      out.push({ path: rel, tokens: estimateTokens(content) });
    }
  }
}

function buildManualTemplate(): string {
  return `
Working on: [current feature/task name]
Status: [in progress / blocked / nearly done]

What I've done so far:
- [brief description of recent changes]
- [another change]

Key decisions made:
- [decision 1 and short reason]
- [decision 2 and short reason]

Files changed: [list of files]

What the next agent should do:
- [next step 1]
- [next step 2]

Watch out for:
- [gotcha or constraint]
`.trim();
}
