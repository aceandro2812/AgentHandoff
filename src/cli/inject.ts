import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getProjectRoot, getHandoffDir, appendAuditLog, PACKET_JSON } from '../utils/config.js';
import { HandoffPacket, TargetAgent, SUPPORTED_TARGET_AGENTS } from '../packet/schema.js';
import { GenericInjector } from '../inject/generic.js';
import { CodexInjector } from '../inject/codex.js';
import { ClaudeCodeInjector } from '../inject/claude-code.js';
import { Injector } from '../inject/base.js';

interface InjectOptions {
  to: string;
  force?: boolean;
}

function getInjector(target: TargetAgent): Injector {
  switch (target) {
    case 'codex':       return new CodexInjector();
    case 'claude-code': return new ClaudeCodeInjector();
    default:            return new GenericInjector();
  }
}

export async function runInject(opts: InjectOptions): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);

  if (!existsSync(jsonPath)) {
    console.error(chalk.red('No handoff packet found. Run `agenthandoff build` first.'));
    process.exit(1);
  }

  if (!SUPPORTED_TARGET_AGENTS.includes(opts.to as TargetAgent)) {
    console.error(chalk.red(`Unknown target agent: ${opts.to}`));
    console.error(`Supported: ${SUPPORTED_TARGET_AGENTS.join(', ')}`);
    process.exit(1);
  }

  const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));

  if (packet.provenance.review_status === 'draft' && !opts.force) {
    console.log(chalk.yellow('\n⚠ Packet is in DRAFT status.'));
    console.log(`Run ${chalk.bold('agenthandoff preview')} to review it.`);
    console.log(`Then ${chalk.bold('agenthandoff approve')} to mark it ready.`);
    console.log(`Or use ${chalk.bold('--force')} to inject without approval.\n`);
    process.exit(1);
  }

  const injector = getInjector(opts.to as TargetAgent);
  const result = await injector.inject(packet, projectRoot);

  appendAuditLog(projectRoot, `inject: → ${opts.to} | files: ${result.files_written.join(', ')}`);

  console.log('');
  console.log(chalk.green('✓ Context injected'));
  for (const f of result.files_written) {
    console.log(`  ${chalk.dim('→')} ${f}`);
  }
  console.log('');
  console.log(chalk.cyan('Instructions:'));
  console.log(result.instructions);
  console.log('');
  console.log(`To undo: ${chalk.bold('agenthandoff clean')}`);
  console.log('');
}
