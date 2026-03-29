import { describe, it, expect } from 'vitest';
import { HandoffPacketSchema } from '../packet/schema.js';

const minimalPacket = {
  schema_version: '1.0',
  project_id: 'abc123',
  project_path: '/Users/dev/myapp',
  created_at: new Date().toISOString(),
  source_agent: 'claude-code',
  target_agent: 'codex',
  task_state: { goal: 'implement auth' },
  decisions: [],
  facts: [],
  warnings: [],
  failed_attempts: [],
  related_files: [],
  open_questions: [],
  manual_notes: [],
  provenance: {
    capture_method: 'agent-self-reported',
    sources_used: ['claude-code-session-context'],
    review_status: 'approved' as const,
  },
};

describe('HandoffPacketSchema', () => {
  it('accepts a valid minimal packet', () => {
    const result = HandoffPacketSchema.safeParse(minimalPacket);
    expect(result.success).toBe(true);
  });

  it('defaults decisions/warnings/facts to empty arrays', () => {
    const { decisions, facts, warnings, ...rest } = minimalPacket;
    const result = HandoffPacketSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decisions).toEqual([]);
      expect(result.data.facts).toEqual([]);
      expect(result.data.warnings).toEqual([]);
    }
  });

  it('rejects missing project_id', () => {
    const { project_id, ...rest } = minimalPacket;
    const result = HandoffPacketSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid review_status', () => {
    const invalid = {
      ...minimalPacket,
      provenance: { ...minimalPacket.provenance, review_status: 'invalid' },
    };
    const result = HandoffPacketSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts decisions with added_at timestamps', () => {
    const packet = {
      ...minimalPacket,
      decisions: [
        {
          statement: 'Use JWT',
          reason: 'stateless',
          related_files: ['src/auth.ts'],
          confidence: 0.9,
          added_at: new Date().toISOString(),
        },
      ],
    };
    const result = HandoffPacketSchema.safeParse(packet);
    expect(result.success).toBe(true);
  });

  it('rejects decision confidence out of range', () => {
    const packet = {
      ...minimalPacket,
      decisions: [{ statement: 'bad', confidence: 1.5 }],
    };
    const result = HandoffPacketSchema.safeParse(packet);
    expect(result.success).toBe(false);
  });
});
