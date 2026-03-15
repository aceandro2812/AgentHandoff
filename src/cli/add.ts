import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  getProjectRoot,
  getHandoffDir,
  readNotes,
  writeNotes,
  appendAuditLog,
  PACKET_JSON,
  ensureHandoffDir,
} from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';

interface AddOptions {
  note?: string;
  decision?: string;
  warning?: string;
  failed?: string;
  question?: string;
}

export async function runAdd(opts: AddOptions): Promise<void> {
  const projectRoot = getProjectRoot();
  const dir = getHandoffDir(projectRoot);
  const jsonPath = join(dir, PACKET_JSON);

  // If there's an existing packet, add directly into it
  if (existsSync(jsonPath)) {
    const packet: HandoffPacket = JSON.parse(readFileSync(jsonPath, 'utf8'));

    if (opts.note) {
      packet.manual_notes.push(opts.note);
      console.log(chalk.green(`✓ Note added: "${opts.note}"`));
    }
    if (opts.decision) {
      packet.decisions.push({ statement: opts.decision, related_files: [], confidence: 1.0 });
      console.log(chalk.green(`✓ Decision added: "${opts.decision}"`));
    }
    if (opts.warning) {
      packet.warnings.push({ statement: opts.warning });
      console.log(chalk.green(`✓ Warning added: "${opts.warning}"`));
    }
    if (opts.failed) {
      packet.failed_attempts.push({ what: opts.failed, why_failed: 'manually noted' });
      console.log(chalk.green(`✓ Failed attempt noted: "${opts.failed}"`));
    }
    if (opts.question) {
      packet.open_questions.push(opts.question);
      console.log(chalk.green(`✓ Open question added: "${opts.question}"`));
    }

    writeFileSync(jsonPath, JSON.stringify(packet, null, 2), 'utf8');
    appendAuditLog(projectRoot, `add: manual entry to existing packet`);
  } else {
    // No packet yet — store as notes for the next build
    ensureHandoffDir(projectRoot);
    const notes = readNotes(projectRoot);

    if (opts.note) notes.push(`NOTE: ${opts.note}`);
    if (opts.decision) notes.push(`DECISION: ${opts.decision}`);
    if (opts.warning) notes.push(`WARNING: ${opts.warning}`);
    if (opts.failed) notes.push(`FAILED: ${opts.failed}`);
    if (opts.question) notes.push(`QUESTION: ${opts.question}`);

    writeNotes(projectRoot, notes);
    appendAuditLog(projectRoot, `add: manual note saved to notes file`);

    const text = opts.note ?? opts.decision ?? opts.warning ?? opts.failed ?? opts.question ?? '';
    console.log(chalk.green(`✓ Saved: "${text}"`));
    console.log(chalk.dim(`  (Stored in .agenthandoff/notes.txt — will be included in next build)`));
  }
}
