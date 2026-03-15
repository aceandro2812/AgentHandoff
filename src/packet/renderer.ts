import { HandoffPacket } from './schema.js';

/**
 * Renders the handoff packet as a clean Markdown document
 * suitable for injection into a target agent's context.
 */
export function renderPacketAsMarkdown(packet: HandoffPacket): string {
  const lines: string[] = [];
  const ts = new Date(packet.created_at).toLocaleString();

  lines.push(`# AgentHandoff Context`);
  lines.push(`\n> Transferred from **${packet.source_agent}** → **${packet.target_agent}**`);
  lines.push(`> Generated: ${ts} | Project: \`${packet.project_id}\``);
  lines.push(`> Review status: **${packet.provenance.review_status}**`);

  // Task State
  if (packet.task_state) {
    lines.push(`\n## Current Task`);
    lines.push(`**Goal**: ${packet.task_state.goal}`);
    if (packet.task_state.current_step) {
      lines.push(`**Current step**: ${packet.task_state.current_step}`);
    }
    if (packet.task_state.blocked_on) {
      lines.push(`**Blocked on**: ⚠️ ${packet.task_state.blocked_on}`);
    }
    if (packet.task_state.next_action) {
      lines.push(`**Next action**: ${packet.task_state.next_action}`);
    }
  }

  // Decisions
  if (packet.decisions.length > 0) {
    lines.push(`\n## Architectural Decisions`);
    for (const d of packet.decisions) {
      lines.push(`- ${d.statement}`);
      if (d.reason) lines.push(`  - *Reason*: ${d.reason}`);
      if (d.related_files.length > 0) {
        lines.push(`  - *Files*: ${d.related_files.join(', ')}`);
      }
    }
  }

  // Facts
  if (packet.facts.length > 0) {
    lines.push(`\n## Project Facts`);
    for (const f of packet.facts) {
      lines.push(`- ${f.statement}`);
      if (f.source) lines.push(`  - *Source*: ${f.source}`);
    }
  }

  // Warnings
  if (packet.warnings.length > 0) {
    lines.push(`\n## ⚠️ Warnings`);
    for (const w of packet.warnings) {
      lines.push(`- ${w.statement}`);
    }
  }

  // Failed attempts
  if (packet.failed_attempts.length > 0) {
    lines.push(`\n## Failed Approaches (Do Not Repeat)`);
    for (const f of packet.failed_attempts) {
      lines.push(`- **${f.what}**: ${f.why_failed}`);
      if (f.recommendation) lines.push(`  - *Instead*: ${f.recommendation}`);
    }
  }

  // Related files
  if (packet.related_files.length > 0) {
    lines.push(`\n## Key Files`);
    for (const f of packet.related_files) {
      lines.push(`- \`${f}\``);
    }
  }

  // Open questions
  if (packet.open_questions.length > 0) {
    lines.push(`\n## Open Questions`);
    for (const q of packet.open_questions) {
      lines.push(`- ${q}`);
    }
  }

  // Manual notes
  if (packet.manual_notes.length > 0) {
    lines.push(`\n## Notes from Developer`);
    for (const n of packet.manual_notes) {
      lines.push(`- ${n}`);
    }
  }

  // Provenance
  lines.push(`\n## Provenance`);
  lines.push(`- Method: ${packet.provenance.capture_method}`);
  lines.push(`- Sources: ${packet.provenance.sources_used.join(', ')}`);
  if (packet.provenance.llm_used_for_compression) {
    lines.push(`- Compressed by: ${packet.provenance.llm_used_for_compression}`);
  }

  return lines.join('\n');
}

/**
 * Renders a compact terminal-friendly preview (no markdown headers, just plain text summary)
 */
export function renderTerminalPreview(packet: HandoffPacket): string {
  const sections: string[] = [];

  sections.push(`Packet: ${packet.source_agent} → ${packet.target_agent} | ${new Date(packet.created_at).toLocaleString()}`);
  sections.push(`Sources: ${packet.provenance.sources_used.join(', ') || 'none'}`);

  if (packet.task_state) {
    sections.push(`\nTask: ${packet.task_state.goal}`);
    if (packet.task_state.blocked_on) sections.push(`Blocked: ${packet.task_state.blocked_on}`);
    if (packet.task_state.next_action) sections.push(`Next: ${packet.task_state.next_action}`);
  }

  if (packet.decisions.length > 0) {
    sections.push(`\nDecisions (${packet.decisions.length}):`);
    for (const d of packet.decisions.slice(0, 5)) {
      sections.push(`  · ${d.statement}`);
    }
  }

  if (packet.warnings.length > 0) {
    sections.push(`\nWarnings (${packet.warnings.length}):`);
    for (const w of packet.warnings.slice(0, 3)) {
      sections.push(`  ⚠ ${w.statement}`);
    }
  }

  if (packet.failed_attempts.length > 0) {
    sections.push(`\nFailed approaches (${packet.failed_attempts.length}):`);
    for (const f of packet.failed_attempts.slice(0, 3)) {
      sections.push(`  ✗ ${f.what}`);
    }
  }

  if (packet.related_files.length > 0) {
    sections.push(`\nKey files: ${packet.related_files.slice(0, 8).join(', ')}`);
  }

  if (packet.manual_notes.length > 0) {
    sections.push(`\nNotes (${packet.manual_notes.length}):`);
    for (const n of packet.manual_notes) {
      sections.push(`  → ${n}`);
    }
  }

  sections.push(`\nStatus: ${packet.provenance.review_status.toUpperCase()}`);

  return sections.join('\n');
}
