// Patterns for common secret types
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS_KEY',       pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS_SECRET',    pattern: /(?<=[Ss]ecret[_\s]?[Kk]ey["\s:=]+)[A-Za-z0-9/+=]{40}/g },
  { name: 'GITHUB_TOKEN',  pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  { name: 'OPENAI_KEY',    pattern: /sk-[A-Za-z0-9]{32,}/g },
  { name: 'ANTHROPIC_KEY', pattern: /sk-ant-[A-Za-z0-9\-_]{32,}/g },
  { name: 'BEARER_TOKEN',  pattern: /[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g },
  { name: 'PRIVATE_KEY',   pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
  { name: 'DB_URL',        pattern: /(?:postgresql|mysql|mongodb|redis):\/\/[^\s"']+/g },
  { name: 'DOTENV_SECRET', pattern: /(?:^|\n)(?:SECRET|TOKEN|KEY|PASSWORD|PWD|PASS|API_KEY)\s*=\s*\S+/gm },
  { name: 'HEX_SECRET',    pattern: /(?<=[Ss]ecret|[Tt]oken|[Kk]ey)["\s:=]+[0-9a-fA-F]{32,}/g },
];

export function redact(text: string): { redacted: string; count: number } {
  let result = text;
  let count = 0;

  for (const { name, pattern } of SECRET_PATTERNS) {
    const before = result;
    result = result.replace(pattern, `[REDACTED:${name}]`);
    if (result !== before) count++;
  }

  return { redacted: result, count };
}

export function redactObject<T>(obj: T): { result: T; totalRedactions: number } {
  const json = JSON.stringify(obj);
  const { redacted, count } = redact(json);
  return {
    result: JSON.parse(redacted) as T,
    totalRedactions: count,
  };
}
