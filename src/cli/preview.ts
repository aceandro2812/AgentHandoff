import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getProjectRoot, getHandoffDir, PACKET_JSON, PACKET_MD } from '../utils/config.js';
import { renderTerminalPreview } from '../packet/renderer.js';
import { HandoffPacket } from '../packet/schema.js';

export async function runPreview(): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);
  const mdPath = join(dir, PACKET_MD);

  if (!existsSync(jsonPath)) {
    console.error(chalk.red('No handoff packet found. Run `agenthandoff build --from <agent> --to <agent>` first.'));
    process.exit(1);
  }

  const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));

  console.log(chalk.bold.cyan('\n═══ AgentHandoff Packet Preview ═══\n'));
  console.log(renderTerminalPreview(packet));

  console.log(chalk.dim('\n───────────────────────────────────'));
  console.log(`Full markdown: ${mdPath}`);
  console.log(chalk.dim('───────────────────────────────────\n'));

  if (packet.provenance.review_status === 'draft') {
    console.log(chalk.yellow('Status: DRAFT — review the packet above before injecting.'));
    console.log(`Approve with: ${chalk.bold('agenthandoff approve')}`);
    console.log(`Inject with:  ${chalk.bold('agenthandoff inject --to ' + packet.target_agent)}`);
  } else {
    console.log(chalk.green('Status: APPROVED'));
    console.log(`Inject with: ${chalk.bold('agenthandoff inject --to ' + packet.target_agent)}`);
  }

  console.log('');
}
