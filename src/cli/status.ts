import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  getProjectRoot,
  getHandoffDir,
  PACKET_JSON,
  AUDIT_LOG,
} from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';

export async function runStatus(): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);

  console.log(chalk.bold.cyan('\n═══ AgentHandoff Status ═══\n'));
  console.log(`Project root: ${chalk.dim(projectRoot)}`);
  console.log(`Handoff dir:  ${chalk.dim(dir)}`);
  console.log('');

  if (!existsSync(jsonPath)) {
    console.log(chalk.yellow('No handoff packet found.'));
    console.log(`Run: ${chalk.bold('agenthandoff build --from <agent> --to <agent>')}\n`);
    return;
  }

  const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const status = packet.provenance.review_status;
  const statusColor = status === 'approved' ? chalk.green : chalk.yellow;

  console.log(`Status:       ${statusColor(status.toUpperCase())}`);
  console.log(`Created:      ${new Date(packet.created_at).toLocaleString()}`);
  console.log(`Route:        ${chalk.cyan(packet.source_agent)} → ${chalk.cyan(packet.target_agent)}`);
  console.log(`Project ID:   ${chalk.dim(packet.project_id)}`);
  console.log('');
  console.log('Contents:');
  console.log(`  Decisions:      ${packet.decisions.length}`);
  console.log(`  Facts:          ${packet.facts.length}`);
  console.log(`  Warnings:       ${packet.warnings.length}`);
  console.log(`  Failed attempts:${packet.failed_attempts.length}`);
  console.log(`  Open questions: ${packet.open_questions.length}`);
  console.log(`  Manual notes:   ${packet.manual_notes.length}`);
  console.log(`  Related files:  ${packet.related_files.length}`);
  console.log('');
  console.log(`Sources: ${chalk.dim(packet.provenance.sources_used.join(', ') || 'none')}`);

  if (packet.task_state) {
    console.log('');
    console.log(`Task: ${chalk.bold(packet.task_state.goal)}`);
    if (packet.task_state.blocked_on) {
      console.log(chalk.yellow(`Blocked: ${packet.task_state.blocked_on}`));
    }
  }

  // Last 5 audit entries
  const auditPath = join(dir, AUDIT_LOG);
  if (existsSync(auditPath)) {
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
    const recent = lines.slice(-5);
    if (recent.length > 0) {
      console.log('');
      console.log('Recent activity:');
      for (const line of recent) {
        console.log(`  ${chalk.dim(line)}`);
      }
    }
  }

  console.log('');
  if (status === 'draft') {
    console.log(`Next steps:`);
    console.log(`  ${chalk.bold('agenthandoff preview')}  — review the packet`);
    console.log(`  ${chalk.bold('agenthandoff approve')}  — mark as ready`);
    console.log(`  ${chalk.bold('agenthandoff inject --to ' + packet.target_agent)}  — inject into target`);
  } else {
    console.log(`Ready to inject: ${chalk.bold('agenthandoff inject --to ' + packet.target_agent)}`);
  }
  console.log('');
}
