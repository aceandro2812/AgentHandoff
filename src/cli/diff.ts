import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getProjectRoot, getHandoffDir, PACKET_JSON } from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';

const SNAPSHOT_FILE = 'last-inject-snapshot.json';
const STALE_HOURS = 24;

/** Returns a human-readable relative time string. */
function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Check if packet is stale (older than STALE_HOURS). Returns hours old or 0. */
export function checkStaleness(packet: HandoffPacket): number {
  const created = new Date(packet.created_at).getTime();
  const hoursOld = (Date.now() - created) / 3600000;
  return hoursOld > STALE_HOURS ? hoursOld : 0;
}

/** Save current packet as the inject snapshot for future diff. */
export function saveInjectSnapshot(packet: HandoffPacket, dir: string): void {
  writeFileSync(join(dir, SNAPSHOT_FILE), JSON.stringify(packet, null, 2), 'utf8');
}

/** Load the last inject snapshot. */
export function loadInjectSnapshot(dir: string): HandoffPacket | null {
  const p = join(dir, SNAPSHOT_FILE);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as HandoffPacket; } catch { return null; }
}

export async function runDiff(): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);

  if (!existsSync(jsonPath)) {
    console.log(chalk.yellow('No handoff packet found. Run `agenthandoff build` first.'));
    return;
  }

  const current: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const snapshot = loadInjectSnapshot(dir);

  console.log('');
  console.log(chalk.bold('═══ AgentHandoff Diff ═══'));
  console.log('');

  // Staleness warning
  const staleHours = checkStaleness(current);
  if (staleHours > 0) {
    console.log(chalk.yellow(`⚠ Packet is ${Math.round(staleHours)}h old (created ${relativeTime(current.created_at)})`));
    console.log(chalk.dim('  Consider rebuilding: agenthandoff build --from <agent> --to <agent>'));
    console.log('');
  } else {
    console.log(chalk.dim(`Packet created ${relativeTime(current.created_at)}`));
    console.log('');
  }

  if (!snapshot) {
    console.log(chalk.dim('No previous inject snapshot found. Showing current packet:'));
    console.log('');
    printPacketSummary(current);
    return;
  }

  // Diff decisions
  const addedDecisions = current.decisions.filter(
    d => !snapshot.decisions.some(s => s.statement === d.statement)
  );
  const removedDecisions = snapshot.decisions.filter(
    d => !current.decisions.some(c => c.statement === d.statement)
  );

  // Diff warnings
  const addedWarnings = current.warnings.filter(
    w => !snapshot.warnings.some(s => s.statement === w.statement)
  );
  const removedWarnings = snapshot.warnings.filter(
    w => !current.warnings.some(c => c.statement === w.statement)
  );

  // Diff failed attempts
  const addedFailed = current.failed_attempts.filter(
    f => !snapshot.failed_attempts.some(s => s.what === f.what)
  );
  const removedFailed = snapshot.failed_attempts.filter(
    f => !current.failed_attempts.some(c => c.what === f.what)
  );

  // Task state change
  const taskChanged = JSON.stringify(current.task_state) !== JSON.stringify(snapshot.task_state);

  const totalChanges = addedDecisions.length + removedDecisions.length +
    addedWarnings.length + removedWarnings.length +
    addedFailed.length + removedFailed.length +
    (taskChanged ? 1 : 0);

  if (totalChanges === 0) {
    console.log(chalk.green('✓ No changes since last inject.'));
    console.log('');
    return;
  }

  console.log(chalk.bold(`${totalChanges} change(s) since last inject:`));
  console.log('');

  if (taskChanged) {
    console.log(chalk.cyan('~ task_state changed'));
    if (current.task_state?.goal !== snapshot.task_state?.goal) {
      console.log(`    goal:     ${chalk.dim(snapshot.task_state?.goal ?? '(none)')} → ${chalk.green(current.task_state?.goal ?? '(none)')}`);
    }
    if (current.task_state?.next_action !== snapshot.task_state?.next_action) {
      console.log(`    next:     ${chalk.green(current.task_state?.next_action ?? '(none)')}`);
    }
    console.log('');
  }

  for (const d of addedDecisions) {
    const when = d.added_at ? chalk.dim(` (${relativeTime(d.added_at)})`) : '';
    console.log(`${chalk.green('+')} decision:  ${d.statement.substring(0, 80)}${when}`);
  }
  for (const d of removedDecisions) {
    console.log(`${chalk.red('-')} decision:  ${chalk.dim(d.statement.substring(0, 80))}`);
  }

  for (const w of addedWarnings) {
    const when = w.added_at ? chalk.dim(` (${relativeTime(w.added_at)})`) : '';
    console.log(`${chalk.green('+')} warning:   ${w.statement.substring(0, 80)}${when}`);
  }
  for (const w of removedWarnings) {
    console.log(`${chalk.red('-')} warning:   ${chalk.dim(w.statement.substring(0, 80))}`);
  }

  for (const f of addedFailed) {
    const when = f.added_at ? chalk.dim(` (${relativeTime(f.added_at)})`) : '';
    console.log(`${chalk.green('+')} failed:    ${f.what.substring(0, 70)} — ${chalk.dim(f.why_failed.substring(0, 40))}${when}`);
  }
  for (const f of removedFailed) {
    console.log(`${chalk.red('-')} failed:    ${chalk.dim(f.what.substring(0, 80))}`);
  }

  console.log('');
  console.log(chalk.dim('Run `agenthandoff inject --to <agent>` to push these changes.'));
  console.log('');
}

function printPacketSummary(packet: HandoffPacket): void {
  if (packet.task_state?.goal) {
    console.log(`  goal:       ${packet.task_state.goal}`);
  }
  console.log(`  decisions:  ${packet.decisions.length}`);
  console.log(`  warnings:   ${packet.warnings.length}`);
  console.log(`  failed:     ${packet.failed_attempts.length}`);
  console.log(`  files:      ${packet.related_files.length}`);
  console.log('');
}
