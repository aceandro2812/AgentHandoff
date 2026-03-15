import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type LLMProvider = 'anthropic' | 'openai';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

const CONFIG_PATH = join(homedir(), '.agenthandoff', 'config.json');

interface StoredConfig {
  provider?: LLMProvider;
  apiKey?: string;
  model?: string;
}

export function loadLLMConfig(): LLMConfig | null {
  // Env vars take priority
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  const openaiKey = process.env['OPENAI_API_KEY'];

  if (anthropicKey) {
    return { provider: 'anthropic', apiKey: anthropicKey, model: 'claude-haiku-4-5-20251001' };
  }
  if (openaiKey) {
    return { provider: 'openai', apiKey: openaiKey, model: 'gpt-4o-mini' };
  }

  // Fall back to stored config
  if (existsSync(CONFIG_PATH)) {
    try {
      const stored: StoredConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      if (stored.apiKey && stored.provider) {
        return {
          provider: stored.provider,
          apiKey: stored.apiKey,
          model: stored.model ?? defaultModel(stored.provider),
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function saveLLMConfig(config: LLMConfig): void {
  const dir = join(homedir(), '.agenthandoff');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function defaultModel(provider: LLMProvider): string {
  return provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';
}

export async function callLLM(config: LLMConfig, prompt: string): Promise<string> {
  if (config.provider === 'anthropic') {
    return callAnthropic(config, prompt);
  }
  return callOpenAI(config, prompt);
}

async function callAnthropic(config: LLMConfig, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
  };
  return data.content.find(b => b.type === 'text')?.text ?? '';
}

async function callOpenAI(config: LLMConfig, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}
