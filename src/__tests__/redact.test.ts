import { describe, it, expect } from 'vitest';
import { redact, redactObject } from '../security/redact.js';

describe('redact()', () => {
  it('redacts AWS access keys', () => {
    const { redacted, count } = redact('key=AKIAIOSFODNN7EXAMPLE1234');
    expect(redacted).toContain('[REDACTED:AWS_KEY]');
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts GitHub tokens', () => {
    const token = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const { redacted } = redact(`Authorization: ${token}`);
    expect(redacted).toContain('[REDACTED:GITHUB_TOKEN]');
    expect(redacted).not.toContain(token);
  });

  it('redacts OpenAI API keys', () => {
    const { redacted } = redact('OPENAI_KEY=sk-abcdefghijklmnopqrstuvwxyz123456789012');
    expect(redacted).toContain('[REDACTED:OPENAI_KEY]');
  });

  it('redacts Anthropic API keys', () => {
    const { redacted } = redact('key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789');
    expect(redacted).toContain('[REDACTED:ANTHROPIC_KEY]');
  });

  it('redacts database URLs', () => {
    const { redacted } = redact('postgresql://admin:password@localhost:5432/mydb');
    expect(redacted).toContain('[REDACTED:DB_URL]');
  });

  it('redacts .env secrets', () => {
    const { redacted } = redact('SECRET=my-super-secret-value');
    expect(redacted).toContain('[REDACTED:DOTENV_SECRET]');
  });

  it('does NOT redact normal code text', () => {
    const code = 'const x = 1; function add(a, b) { return a + b; }';
    const { redacted, count } = redact(code);
    expect(redacted).toBe(code);
    expect(count).toBe(0);
  });

  it('does NOT redact short hex strings', () => {
    const { redacted } = redact('color: #aabbcc');
    expect(redacted).toBe('color: #aabbcc');
  });

  it('counts multiple distinct redactions', () => {
    const text = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz postgresql://user:pass@host/db';
    const { count } = redact(text);
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe('redactObject()', () => {
  it('redacts secrets inside nested objects', () => {
    const obj = {
      settings: {
        apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456789012',
        debug: true,
      },
    };
    const { result } = redactObject(obj);
    expect(JSON.stringify(result)).not.toContain('sk-abcdef');
    expect(result.settings.debug).toBe(true);
  });
});
