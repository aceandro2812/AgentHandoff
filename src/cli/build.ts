import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildPacket } from '../packet/builder.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import {
  getProjectRoot,
  ensureHandoffDir,
  appendAuditLog,
  PACKET_JSON,
  PACKET_MD,
} from '../utils/config.js';
import { SUPPORTED_SOURCE_AGENTS, SUPPORTED_TARGET_AGENTS, SourceAgent, TargetAgent } from '../packet/schema.js';

interface BuildOptions {
  from: string;
  to: string;
}

export async function runBuild(opts: BuildOptions): Promise<void> {
  const projectRoot = getProjectRoot();

  if (!SUPPORTED_SOURCE_AGENTS.includes(opts.from as SourceAgent)) {
    console.error(chalk.red(`Unknown source agent: ${opts.from}`));
    console.error(`Supported: ${SUPPORTED_SOURCE_AGENTS.join(', ')}`);
    process.exit(1);
  }

  if (!SUPPORTED_TARGET_AGENTS.includes(opts.to as TargetAgent)) {
    console.error(chalk.red(`Unknown target agent: ${opts.to}`));
    console.error(`Supported: ${SUPPORTED_TARGET_AGENTS.join(', ')}`);
    process.exit(1);
  }

  const spinner = ora('Capturing context from Tier 1 sources...').start();

  const result = await buildPacket({
    projectRoot,
    sourceAgent: opts.from as SourceAgent,
    targetAgent: opts.to as TargetAgent,
  });

  spinner.succeed('Context captured');

  const dir = ensureHandoffDir(projectRoot);

  // Write JSON packet
  const jsonPath = join(dir, PACKET_JSON);
  writeFileSync(jsonPath, JSON.stringify(result.packet, null, 2), 'utf8');

  // Write Markdown packet
  const mdPath = join(dir, PACKET_MD);
  writeFileSync(mdPath, renderPacketAsMarkdown(result.packet), 'utf8');

  appendAuditLog(projectRoot, `build: ${opts.from} → ${opts.to} | sources: ${result.sourcesUsed.join(', ')}`);

  console.log('');
  console.log(chalk.green('✓ Handoff packet built'));
  console.log(`  ${chalk.dim('JSON:')} ${jsonPath}`);
  console.log(`  ${chalk.dim('Markdown:')} ${mdPath}`);

  if (result.redactedCount > 0) {
    console.log(chalk.yellow(`  ⚠ ${result.redactedCount} potential secret(s) redacted`));
  }

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.log(chalk.yellow(`  ⚠ ${w}`));
    }
  }

  console.log('');
  console.log(`Sources used: ${chalk.cyan(result.sourcesUsed.join(', ') || 'none')}`);
  console.log('');
  console.log(`Next: ${chalk.bold('agenthandoff preview')} to review, then ${chalk.bold('agenthandoff inject --to ' + opts.to)}`);
}
