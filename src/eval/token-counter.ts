/**
 * Lightweight token estimator.
 * GPT/Claude tokenisers average ~4 chars per token for English code/prose.
 * This avoids a heavy tiktoken dependency while giving useful ballpark numbers.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough heuristic: split on whitespace + punctuation, ~1 token per word,
  // plus overhead for code symbols (~3 chars = 1 token).
  const words = text.split(/\s+/).filter(Boolean).length;
  const codeSymbols = (text.match(/[{}()\[\]<>:;,=+\-*\/\\|&^%$#@!~`'"]/g) ?? []).length;
  return Math.ceil(words + codeSymbols * 0.3);
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Estimate cost at typical API rates (input tokens) */
export function estimateCost(tokens: number, model: 'claude-sonnet' | 'claude-haiku' | 'gpt-4o' | 'gpt-4o-mini'): number {
  const rates: Record<string, number> = {
    'claude-sonnet': 3.00 / 1_000_000,
    'claude-haiku':  0.25 / 1_000_000,
    'gpt-4o':        2.50 / 1_000_000,
    'gpt-4o-mini':   0.15 / 1_000_000,
  };
  return tokens * (rates[model] ?? rates['claude-sonnet']!);
}
