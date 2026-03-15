import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  getProjectRoot,
  getHandoffDir,
  ensureHandoffDir,
  appendAuditLog,
  PACKET_JSON,
  PACKET_MD,
} from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';
import { buildColdStartScenario } from '../eval/scenarios.js';
import { buildReport, renderReport } from '../eval/report.js';

const EVAL_REPORT_FILE = 'eval-report.txt';
const EVAL_JSON_FILE   = 'eval-report.json';

export async function runEval(): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);
  const mdPath   = join(dir, PACKET_MD);

  if (!existsSync(jsonPath)) {
    console.error(chalk.red('No handoff packet found. Run `agenthandoff build` first.'));
    process.exit(1);
  }

  const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const packetMarkdown = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';

  console.log(chalk.bold.cyan('\nRunning evaluation...\n'));

  const scenario = buildColdStartScenario(projectRoot, packetMarkdown);
  const report   = buildReport(projectRoot, packet, scenario);
  const text     = renderReport(report);

  // Print to terminal
  console.log(text);

  // Save artifacts
  ensureHandoffDir(projectRoot);
  writeFileSync(join(dir, EVAL_REPORT_FILE), text, 'utf8');
  writeFileSync(join(dir, EVAL_JSON_FILE), JSON.stringify(report, null, 2), 'utf8');

  appendAuditLog(projectRoot, `eval: report generated`);

  console.log(chalk.dim(`Report saved to .agenthandoff/${EVAL_REPORT_FILE}`));
  console.log(chalk.dim(`JSON data at  .agenthandoff/${EVAL_JSON_FILE}`));
  console.log('');

  // Show next step based on verdict
  const saving = report.verdict.tokenSavingVsColStart;
  if (saving >= 40) {
    console.log(chalk.green(`✓ Packet saves ~${saving}% tokens vs cold start. Ready to inject.`));
    console.log(`  ${chalk.bold('agenthandoff inject --to ' + packet.target_agent)}`);
  } else {
    console.log(chalk.yellow(`⚠ Savings are low (${saving}%). Enrich the packet first:`));
    console.log(`  ${chalk.bold('agenthandoff add --decision "<text>"')}`);
    console.log(`  ${chalk.bold('agenthandoff add --note "<text>"')}`);
    console.log(`  Or rebuild with ${chalk.bold('--llm')} for richer extraction.`);
  }
  console.log('');
}
