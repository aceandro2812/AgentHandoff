import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { LLMProvider } from '../utils/llm.js';

const CONFIG_DIR = join(homedir(), '.agenthandoff');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

interface StoredConfig {
  provider?: LLMProvider;
  apiKey?: string;
  model?: string;
}

interface ConfigOptions {
  key?: string;
  provider?: string;
  model?: string;
  show?: boolean;
  clear?: boolean;
}

export async function runConfig(opts: ConfigOptions): Promise<void> {
  if (opts.clear) {
    if (existsSync(CONFIG_PATH)) {
      writeFileSync(CONFIG_PATH, '{}', 'utf8');
      console.log(chalk.green('✓ Config cleared'));
    } else {
      console.log(chalk.yellow('No config to clear'));
    }
    return;
  }

  const current: StoredConfig = existsSync(CONFIG_PATH)
    ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    : {};

  if (opts.show) {
    console.log(chalk.bold('\nAgentHandoff Config\n'));
    console.log(`Config file: ${chalk.dim(CONFIG_PATH)}`);
    console.log(`Provider:    ${chalk.cyan(current.provider ?? 'not set')}`);
    console.log(`Model:       ${chalk.cyan(current.model ?? 'default')}`);
    console.log(`API Key:     ${current.apiKey ? chalk.green('set') : chalk.yellow('not set')}`);
    console.log('');
    console.log(chalk.dim('Env vars override config: ANTHROPIC_API_KEY, OPENAI_API_KEY'));
    console.log('');
    return;
  }

  // Auto-detect provider from key prefix
  if (opts.key && !opts.provider) {
    if (opts.key.startsWith('sk-ant-')) {
      opts.provider = 'anthropic';
    } else if (opts.key.startsWith('sk-')) {
      opts.provider = 'openai';
    }
  }

  if (opts.provider && opts.provider !== 'anthropic' && opts.provider !== 'openai') {
    console.error(chalk.red(`Unknown provider: ${opts.provider}. Use 'anthropic' or 'openai'`));
    process.exit(1);
  }

  const updated: StoredConfig = {
    ...current,
    ...(opts.provider ? { provider: opts.provider as LLMProvider } : {}),
    ...(opts.key ? { apiKey: opts.key } : {}),
    ...(opts.model ? { model: opts.model } : {}),
  };

  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');

  console.log(chalk.green('\n✓ Config saved'));
  if (opts.key) console.log(`  Provider: ${chalk.cyan(updated.provider)}`);
  if (opts.model) console.log(`  Model: ${chalk.cyan(updated.model)}`);
  console.log('');
  console.log(`Now use ${chalk.bold('agenthandoff build --llm ...')} to enable LLM compression.`);
  console.log('');
}
