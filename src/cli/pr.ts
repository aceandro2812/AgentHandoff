import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getProjectRoot, getHandoffDir, PACKET_JSON } from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';
import { renderPRDescription } from '../packet/pr-renderer.js';

interface PROptions {
  push?: boolean;   // open GitHub PR with this description
  title?: string;   // custom PR title
}

function getGitBranch(): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function getDefaultTitle(packet: HandoffPacket, branch: string | null): string {
  if (packet.task_state?.goal) {
    const goal = packet.task_state.goal;
    return goal.length > 70 ? goal.substring(0, 67) + '...' : goal;
  }
  if (branch && branch !== 'main' && branch !== 'master') {
    return branch.replace(/[-_]/g, ' ');
  }
  return 'Work session handoff';
}

export async function runPRDescription(opts: PROptions): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);

  if (!existsSync(jsonPath)) {
    console.error(chalk.red('No handoff packet found. Run `agenthandoff build` first.'));
    process.exit(1);
  }

  const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const description = renderPRDescription(packet);
  const branch = getGitBranch();
  const title = opts.title ?? getDefaultTitle(packet, branch);

  if (opts.push) {
    // Push to GitHub via gh CLI
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch {
      console.error(chalk.red('`gh` CLI not found. Install it from https://cli.github.com to use --push.'));
      console.log(chalk.dim('\nFalling back to displaying the PR description:\n'));
      printDescription(title, description);
      return;
    }

    try {
      const escaped = description.replace(/'/g, `'\\''`);
      const titleEscaped = title.replace(/'/g, `'\\''`);
      const result = execSync(
        `gh pr create --title '${titleEscaped}' --body '${escaped}'`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      console.log('');
      console.log(chalk.green('✓ Pull request created'));
      console.log(`  ${chalk.cyan(result)}`);
      console.log('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(chalk.red(`Failed to create PR: ${msg}`));
      console.log(chalk.dim('\nPR description (copy manually):\n'));
      printDescription(title, description);
    }
    return;
  }

  // Just print the description
  printDescription(title, description);
}

function printDescription(title: string, description: string): void {
  console.log('');
  console.log(chalk.bold('═══ PR Description ═══'));
  console.log('');
  console.log(chalk.bold(`Title: ${title}`));
  console.log('');
  console.log(chalk.dim('─'.repeat(60)));
  console.log(description);
  console.log(chalk.dim('─'.repeat(60)));
  console.log('');
  console.log(chalk.dim('Copy the above into your pull request.'));
  console.log(chalk.dim('Or run `agenthandoff pr-description --push` to open the PR automatically (requires `gh` CLI).'));
  console.log('');
}
