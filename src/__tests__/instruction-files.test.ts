import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { captureInstructionFiles } from '../capture/instruction-files.js';

const BEGIN = '<!-- AGENTHANDOFF:BEGIN -->';
const END   = '<!-- AGENTHANDOFF:END -->';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agenthandoff-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(rel: string, content: string) {
  const full = join(tmpDir, rel);
  mkdirSync(join(tmpDir, rel, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

describe('captureInstructionFiles()', () => {
  it('captures a plain CLAUDE.md with no block', () => {
    write('CLAUDE.md', '# My Project\nUse TypeScript everywhere.');
    const results = captureInstructionFiles(tmpDir);
    expect(results.length).toBe(1);
    expect(results[0].label).toBe('CLAUDE.md');
    expect(results[0].content).toContain('Use TypeScript everywhere');
  });

  it('strips AGENTHANDOFF block from CLAUDE.md', () => {
    const block = `${BEGIN}\nSome injected instructions\n${END}`;
    write('CLAUDE.md', `# My Project\nOriginal content here.\n\n${block}`);
    const results = captureInstructionFiles(tmpDir);
    expect(results[0].content).toContain('Original content here');
    expect(results[0].content).not.toContain('injected instructions');
    expect(results[0].content).not.toContain(BEGIN);
    expect(results[0].content).not.toContain(END);
  });

  it('strips block when it appears at the start of the file', () => {
    const block = `${BEGIN}\nInjected at top\n${END}\n\n# Real content`;
    write('CLAUDE.md', block);
    const results = captureInstructionFiles(tmpDir);
    expect(results[0].content).toBe('# Real content');
    expect(results[0].content).not.toContain('Injected at top');
  });

  it('returns empty array when no instruction files exist', () => {
    const results = captureInstructionFiles(tmpDir);
    expect(results).toEqual([]);
  });

  it('captures multiple instruction files', () => {
    write('CLAUDE.md', '# Claude instructions');
    write('AGENTS.md', '# Codex instructions');
    const results = captureInstructionFiles(tmpDir);
    const labels = results.map(r => r.label);
    expect(labels).toContain('CLAUDE.md');
    expect(labels).toContain('AGENTS.md');
  });

  it('skips files in excludePaths', () => {
    write('CLAUDE.md', '# Claude instructions');
    write('AGENTS.md', '# Codex instructions');
    const results = captureInstructionFiles(tmpDir, ['CLAUDE.md']);
    const labels = results.map(r => r.label);
    expect(labels).not.toContain('CLAUDE.md');
    expect(labels).toContain('AGENTS.md');
  });

  it('skips files that are empty after stripping the block', () => {
    // File contains ONLY the AgentHandoff block — should not appear in results
    const onlyBlock = `${BEGIN}\nAll injected, nothing else\n${END}`;
    write('CLAUDE.md', onlyBlock);
    const results = captureInstructionFiles(tmpDir);
    expect(results.length).toBe(0);
  });

  it('preserves content when block markers are incomplete (only BEGIN, no END)', () => {
    write('CLAUDE.md', `${BEGIN}\nSome content without end marker`);
    const results = captureInstructionFiles(tmpDir);
    // No stripping should occur when markers are incomplete
    expect(results[0].content).toContain(BEGIN);
  });
});
