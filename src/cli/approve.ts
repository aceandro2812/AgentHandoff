import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getProjectRoot, getHandoffDir, appendAuditLog, PACKET_JSON } from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';

export async function runApprove(): Promise<void> {
  const projectRoot = getProjectRoot();
  const jsonPath = join(getHandoffDir(projectRoot), PACKET_JSON);

  if (!existsSync(jsonPath)) {
    console.error(chalk.red('No handoff packet found. Run `agenthandoff build` first.'));
    process.exit(1);
  }

  const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));

  if (packet.provenance.review_status === 'approved') {
    console.log(chalk.green('Packet is already approved.'));
    return;
  }

  packet.provenance.review_status = 'approved';
  writeFileSync(jsonPath, JSON.stringify(packet, null, 2), 'utf8');
  appendAuditLog(projectRoot, 'approve: packet marked as approved');

  console.log(chalk.green('\n✓ Packet approved'));
  console.log(`Ready to inject: ${chalk.bold('agenthandoff inject --to ' + packet.target_agent)}\n`);
}
