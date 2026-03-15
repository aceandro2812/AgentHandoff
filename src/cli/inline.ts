import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getProjectRoot, getHandoffDir, PACKET_JSON } from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';
import { renderInlineBlock, estimateInlineTokens } from '../packet/inline-renderer.js';

/**
 * `agenthandoff inline`
 *
 * Outputs an ultra-compressed handoff block (~150 tokens) to stdout.
 * Designed to be pasted as the first message in a new agent session.
 *
 * This is the fast-switch path — no file injection, no MCP server setup.
 * Just copy-paste the output and the next agent picks up exactly where
 * the previous one left off.
 */
export function runInline(opts: { copy?: boolean }): void {
  const projectRoot = getProjectRoot();
  const packetPath = join(getHandoffDir(projectRoot), PACKET_JSON);

  if (!existsSync(packetPath)) {
    console.error(chalk.red('No handoff packet found.'));
    console.error(`Run ${chalk.bold('agenthandoff build')} first.`);
    process.exit(1);
  }

  let packet: HandoffPacket;
  try {
    packet = JSON.parse(readFileSync(packetPath, 'utf8')) as HandoffPacket;
  } catch {
    console.error(chalk.red('Failed to read handoff packet.'));
    process.exit(1);
  }

  if (packet.provenance.review_status === 'draft') {
    console.error(chalk.yellow('⚠ Packet is DRAFT — run `agenthandoff approve` first, or use --force.'));
    console.error('  Showing output anyway since inline is read-only.\n');
  }

  const block = renderInlineBlock(packet);
  const tokens = estimateInlineTokens(block);

  // Print the block with a clear delimiter for easy copy-paste
  console.log(chalk.dim('─── Copy everything between the lines ───────────────────────'));
  console.log('');
  console.log(block);
  console.log('');
  console.log(chalk.dim('─────────────────────────────────────────────────────────────'));
  console.log('');
  console.log(chalk.dim(`~${tokens} tokens  |  Paste this as your first message to ${chalk.cyan(packet.target_agent)}`));
  console.log('');
  console.log(chalk.dim('Tip: Run `agenthandoff mcp start` and configure MCP for structured on-demand queries (even fewer tokens).'));
}
