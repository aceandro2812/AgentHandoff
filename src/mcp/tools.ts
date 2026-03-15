import { HandoffPacket } from '../packet/schema.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';

// SDK-compatible tool result shape
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

function text(t: string): ToolResult {
  return { content: [{ type: 'text', text: t }] };
}

function err(msg: string): ToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

export function handleGetCurrentHandoff(packet: HandoffPacket | null): ToolResult {
  if (!packet) return err('No handoff packet found. Run `agenthandoff build` first.');
  return text(renderPacketAsMarkdown(packet));
}

export function handleGetTaskState(packet: HandoffPacket | null): ToolResult {
  if (!packet) return err('No handoff packet found.');
  if (!packet.task_state) {
    return text('No task state recorded.\n\nAdd one with:\n  agenthandoff add --note "Working on: <task>"');
  }
  const { goal, current_step, blocked_on, next_action } = packet.task_state;
  const lines = [
    `Goal: ${goal}`,
    current_step ? `Current step: ${current_step}` : null,
    blocked_on   ? `⚠ Blocked on: ${blocked_on}`   : null,
    next_action  ? `Next action: ${next_action}`    : null,
  ].filter(Boolean) as string[];
  return text(lines.join('\n'));
}

export function handleGetDecisions(packet: HandoffPacket | null): ToolResult {
  if (!packet) return err('No handoff packet found.');
  if (packet.decisions.length === 0) {
    return text('No decisions recorded.\n\nAdd one with:\n  agenthandoff add --decision "<text>"');
  }
  const lines = packet.decisions.map((d, i) => {
    const parts = [`${i + 1}. ${d.statement}`];
    if (d.reason) parts.push(`   Reason: ${d.reason}`);
    if (d.related_files.length) parts.push(`   Files: ${d.related_files.join(', ')}`);
    return parts.join('\n');
  });
  return text(lines.join('\n\n'));
}

export function handleGetWarnings(packet: HandoffPacket | null): ToolResult {
  if (!packet) return err('No handoff packet found.');
  const items = [
    ...packet.warnings.map(w => `⚠ ${w.statement}`),
    ...packet.failed_attempts.map(f =>
      `✗ ${f.what}: ${f.why_failed}${f.recommendation ? ` → ${f.recommendation}` : ''}`
    ),
  ];
  if (items.length === 0) return text('No warnings or failed attempts recorded.');
  return text(items.join('\n'));
}

export function handleGetRelatedFiles(packet: HandoffPacket | null): ToolResult {
  if (!packet) return err('No handoff packet found.');
  if (packet.related_files.length === 0) return text('No related files recorded.');
  return text(packet.related_files.map(f => `- ${f}`).join('\n'));
}

export function handleGetSummary(packet: HandoffPacket | null): ToolResult {
  if (!packet) return err('No handoff packet found.');
  const lines: string[] = [
    `Source: ${packet.source_agent} → ${packet.target_agent}`,
    `Created: ${new Date(packet.created_at).toLocaleString()}`,
    `Status: ${packet.provenance.review_status.toUpperCase()}`,
    '',
    `Decisions:      ${packet.decisions.length}`,
    `Facts:          ${packet.facts.length}`,
    `Warnings:       ${packet.warnings.length}`,
    `Failed attempts:${packet.failed_attempts.length}`,
    `Open questions: ${packet.open_questions.length}`,
    `Related files:  ${packet.related_files.length}`,
  ];
  if (packet.task_state?.goal) lines.push('', `Current goal: ${packet.task_state.goal}`);
  return text(lines.join('\n'));
}
