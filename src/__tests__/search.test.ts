import { describe, it, expect } from 'vitest';
import { searchContext, formatSearchResults } from '../mcp/search.js';
import { HandoffPacket } from '../packet/schema.js';

const packet: HandoffPacket = {
  schema_version: '1.0',
  project_id: 'test',
  project_path: '/test',
  created_at: new Date().toISOString(),
  source_agent: 'claude-code',
  target_agent: 'codex',
  task_state: { goal: 'build auth system' },
  decisions: [
    {
      statement: 'Use JWT refresh token rotation for authentication',
      reason: 'Security: rotating tokens invalidate stolen tokens',
      related_files: ['src/auth/tokens.ts'],
      confidence: 0.95,
    },
    {
      statement: 'Use PostgreSQL for the database',
      reason: 'Concurrent writes needed',
      related_files: ['src/db/client.ts'],
      confidence: 0.9,
    },
    {
      statement: 'Use Tailwind CSS for styling',
      reason: 'Utility-first consistency',
      related_files: ['src/styles/'],
      confidence: 0.85,
    },
  ],
  warnings: [
    { statement: 'Never store raw JWT tokens in the database — always hash first' },
    { statement: 'Tailwind purge config must include all template directories' },
  ],
  failed_attempts: [
    {
      what: 'Redis for token blacklist',
      why_failed: 'Added 180ms P99 latency to every auth request',
      recommendation: 'Use in-memory Map with TTL instead',
    },
  ],
  facts: [
    { statement: 'Project uses ESM modules — never use require()', source: 'CLAUDE.md', related_files: [] },
  ],
  related_files: ['src/auth/tokens.ts', 'src/auth/routes.ts'],
  open_questions: [],
  manual_notes: [],
  provenance: {
    capture_method: 'agent-self-reported',
    sources_used: ['claude-code-session-context'],
    review_status: 'approved',
  },
};

describe('searchContext()', () => {
  it('returns auth-related items for an auth task', () => {
    const results = searchContext(packet, 'implement JWT auth refresh endpoint');
    const types = results.map(r => r.type);
    const texts = results.map(r => r.text);

    expect(results.length).toBeGreaterThan(0);
    // JWT decision should rank highly
    expect(texts.some(t => t.toLowerCase().includes('jwt'))).toBe(true);
  });

  it('returns the Redis failed attempt when asking about token storage', () => {
    const results = searchContext(packet, 'token storage performance');
    const texts = results.map(r => r.text);
    expect(texts.some(t => t.toLowerCase().includes('redis'))).toBe(true);
  });

  it('does NOT return unrelated Tailwind items for auth task', () => {
    const results = searchContext(packet, 'implement JWT auth refresh endpoint', undefined, 3);
    const texts = results.map(r => r.text);
    // Tailwind should not be in top 3 results for an auth query
    const hasTailwind = texts.some(t => t.toLowerCase().includes('tailwind'));
    expect(hasTailwind).toBe(false);
  });

  it('respects topK limit', () => {
    const results = searchContext(packet, 'anything', undefined, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for completely unrelated task', () => {
    const results = searchContext(packet, 'xyz zyx qqq nonsense random', undefined, 8, 5.0);
    expect(results.length).toBe(0);
  });

  it('boosts items when scope matches file path', () => {
    const withScope    = searchContext(packet, 'auth tokens', 'src/auth/*');
    const withoutScope = searchContext(packet, 'auth tokens');
    // Scope-boosted results should score at least as high
    const topWith    = withScope[0]?.score ?? 0;
    const topWithout = withoutScope[0]?.score ?? 0;
    expect(topWith).toBeGreaterThanOrEqual(topWithout);
  });
});

describe('formatSearchResults()', () => {
  it('formats results as readable markdown', () => {
    const results = searchContext(packet, 'JWT auth implementation');
    const text = formatSearchResults(results, 'JWT auth implementation');
    expect(text).toContain('Context relevant to');
    expect(text.length).toBeGreaterThan(0);
  });

  it('returns friendly message when no results', () => {
    const text = formatSearchResults([], 'some task');
    expect(text).toContain('No relevant context');
  });
});
