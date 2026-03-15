#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { runBuild } from './build.js';
import { runPreview } from './preview.js';
import { runInject } from './inject.js';
import { runAdd } from './add.js';
import { runApprove } from './approve.js';
import { runStatus } from './status.js';
import { runClean } from './clean.js';
import { SUPPORTED_SOURCE_AGENTS, SUPPORTED_TARGET_AGENTS } from '../packet/schema.js';

const program = new Command();

program
  .name('agenthandoff')
  .description('Trusted handoff packet system for switching context between AI coding agents')
  .version('0.1.0');

// ── build ──────────────────────────────────────────────────────────────────
program
  .command('build')
  .description('Build a handoff packet from current project context (Tier 1 sources)')
  .requiredOption('--from <agent>', `Source agent (${SUPPORTED_SOURCE_AGENTS.join('|')})`)
  .requiredOption('--to <agent>', `Target agent (${SUPPORTED_TARGET_AGENTS.join('|')})`)
  .action(async (opts) => {
    await runBuild(opts).catch(die);
  });

// ── preview ────────────────────────────────────────────────────────────────
program
  .command('preview')
  .description('Preview the current handoff packet before injecting')
  .action(async () => {
    await runPreview().catch(die);
  });

// ── approve ────────────────────────────────────────────────────────────────
program
  .command('approve')
  .description('Mark the current handoff packet as reviewed and ready to inject')
  .action(async () => {
    await runApprove().catch(die);
  });

// ── inject ─────────────────────────────────────────────────────────────────
program
  .command('inject')
  .description('Inject the handoff packet into the target agent context')
  .requiredOption('--to <agent>', `Target agent (${SUPPORTED_TARGET_AGENTS.join('|')})`)
  .option('--force', 'Inject even if packet is still in draft status')
  .action(async (opts) => {
    await runInject(opts).catch(die);
  });

// ── add ────────────────────────────────────────────────────────────────────
program
  .command('add')
  .description('Add manual context to the current packet (or store for the next build)')
  .option('-n, --note <text>',     'Add a general note')
  .option('-d, --decision <text>', 'Add an architectural decision')
  .option('-w, --warning <text>',  'Add a warning')
  .option('-f, --failed <text>',   'Add a failed approach')
  .option('-q, --question <text>', 'Add an open question')
  .action(async (opts) => {
    if (!opts.note && !opts.decision && !opts.warning && !opts.failed && !opts.question) {
      console.error(chalk.red('Specify at least one option: --note, --decision, --warning, --failed, --question'));
      process.exit(1);
    }
    await runAdd(opts).catch(die);
  });

// ── status ─────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show the current handoff packet status and recent activity')
  .action(async () => {
    await runStatus().catch(die);
  });

// ── clean ──────────────────────────────────────────────────────────────────
program
  .command('clean')
  .description('Remove all injected handoff artifacts (rollback)')
  .action(async () => {
    await runClean().catch(die);
  });

// ── agents ─────────────────────────────────────────────────────────────────
program
  .command('agents')
  .description('List supported source and target agents')
  .action(() => {
    console.log(chalk.bold('\nSource agents:'));
    for (const a of SUPPORTED_SOURCE_AGENTS) console.log(`  ${chalk.cyan(a)}`);
    console.log(chalk.bold('\nTarget agents:'));
    for (const a of SUPPORTED_TARGET_AGENTS) console.log(`  ${chalk.cyan(a)}`);
    console.log('');
  });

function die(err: unknown): never {
  console.error(chalk.red('\nError:'), err instanceof Error ? err.message : String(err));
  process.exit(1);
}

program.parse();
