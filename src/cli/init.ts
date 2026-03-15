import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { getProjectRoot } from '../utils/config.js';

/**
 * `agenthandoff init --agent <agent>`
 *
 * Installs the /handoff slash command into the target agent's command directory.
 * After this, the agent itself generates the handoff packet from its own context —
 * zero extra API cost, perfect accuracy since the agent was in the session.
 *
 * Claude Code: /project:handoff [target-agent]
 * Codex:       /handoff [target-agent]   (when .codex/commands/ support lands)
 * Cursor:      installs as a .cursor/rules/handoff-instructions.mdc
 */
export function runInit(opts: { agent: string }): void {
  const projectRoot = getProjectRoot();
  const agent = opts.agent.toLowerCase();

  switch (agent) {
    case 'claude-code':
      installClaudeCodeCommand(projectRoot);
      break;
    case 'codex':
      installCodexCommand(projectRoot);
      break;
    case 'cursor':
      installCursorInstructions(projectRoot);
      break;
    case 'gemini':
      installGeminiCommand(projectRoot);
      break;
    case 'all':
      installClaudeCodeCommand(projectRoot);
      installCodexCommand(projectRoot);
      installCursorInstructions(projectRoot);
      installGeminiCommand(projectRoot);
      break;
    default:
      console.error(chalk.red(`Unknown agent: ${agent}`));
      console.error('Supported: claude-code | codex | cursor | gemini | all');
      process.exit(1);
  }
}

function installClaudeCodeCommand(projectRoot: string): void {
  const dir = join(projectRoot, '.claude', 'commands');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, 'handoff.md');
  writeFileSync(dest, CLAUDE_CODE_PROMPT, 'utf8');
  console.log(chalk.green('✓ Claude Code slash command installed'));
  console.log(`  ${chalk.dim(dest)}`);
  console.log(`  Usage: ${chalk.cyan('/project:handoff codex')} (or any target agent)`);
  console.log(`  ${chalk.dim('Claude will write the handoff packet directly from its session context — zero API cost.')}`);
  console.log('');
}

function installCodexCommand(projectRoot: string): void {
  const dir = join(projectRoot, '.codex', 'commands');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, 'handoff.md');
  writeFileSync(dest, CODEX_PROMPT, 'utf8');
  console.log(chalk.green('✓ Codex slash command installed'));
  console.log(`  ${chalk.dim(dest)}`);
  console.log(`  Usage: ${chalk.cyan('/handoff claude-code')} at end of Codex session`);
  console.log('');
}

function installGeminiCommand(projectRoot: string): void {
  const dir = join(projectRoot, '.gemini', 'commands');
  mkdirSync(dir, { recursive: true });

  // Gemini CLI uses .toml format for custom commands
  const tomlDest = join(dir, 'handoff.toml');
  writeFileSync(tomlDest, GEMINI_TOML_COMMAND, 'utf8');

  // Also write the full prompt as a .md reference file (used by the toml command)
  const mdDest = join(dir, 'handoff-prompt.md');
  writeFileSync(mdDest, GEMINI_PROMPT, 'utf8');

  console.log(chalk.green('✓ Gemini CLI slash command installed'));
  console.log(`  ${chalk.dim(tomlDest)}`);
  console.log(`  Usage: ${chalk.cyan('/handoff claude-code')} at end of Gemini session`);
  console.log('');
}

function installCursorInstructions(projectRoot: string): void {
  const dir = join(projectRoot, '.cursor', 'rules');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, 'handoff-instructions.mdc');
  writeFileSync(dest, CURSOR_RULE, 'utf8');
  console.log(chalk.green('✓ Cursor handoff rule installed'));
  console.log(`  ${chalk.dim(dest)}`);
  console.log(`  Usage: ask Cursor "generate handoff for claude-code" in any session`);
  console.log('');
}

// ── Prompt templates ────────────────────────────────────────────────────────

const PACKET_SCHEMA = `{
  "schema_version": "1.0",
  "project_id": "unknown",
  "project_path": "<absolute path>",
  "created_at": "<ISO timestamp now>",
  "source_agent": "REPLACE_SOURCE",
  "target_agent": "$ARGUMENTS",
  "task_state": {
    "goal": "<specific goal — not vague>",
    "current_step": "<what step right now>",
    "next_action": "<EXACT next action with file:line if possible>",
    "blocked_on": "<blocker or omit>"
  },
  "decisions": [{"statement":"<decided>","reason":"<why + tradeoff>","related_files":[],"confidence":0.95}],
  "facts": [{"statement":"<important fact>","source":"REPLACE_SOURCE-session","related_files":[]}],
  "warnings": [{"statement":"<must not do / be careful of>","source":"REPLACE_SOURCE-session"}],
  "failed_attempts": [{"what":"<tried>","why_failed":"<exact reason>","recommendation":"<try instead>"}],
  "related_files": ["<files needed to continue>"],
  "open_questions": ["<unresolved>"],
  "manual_notes": [],
  "provenance": {
    "capture_method": "agent-self-reported",
    "sources_used": ["REPLACE_SOURCE-session-context"],
    "review_status": "approved"
  }
}`;

const RULES = `Rules:
- Be specific. "worked on auth" is useless. "Added JWT refresh at src/auth/routes.ts:45, 15min/7day expiry" is good.
- Every failed_attempt MUST include why_failed — the next agent will repeat your mistake otherwise.
- next_action must be specific enough that the next agent starts immediately, no questions asked.
- review_status is "approved" — self-generated by the source agent, no extra review step needed.
- If $ARGUMENTS is empty, use "generic" as target_agent.`;

const CLAUDE_CODE_PROMPT = `Based on our entire conversation in this session, generate a precise handoff packet so the next AI agent continues exactly where we left off.

You have full context of everything we built, decided, failed, and learned. Use it — do not re-read files.

Write these two files using your Write tool:

**\`.agenthandoff/current-handoff.json\`**
\`\`\`json
${PACKET_SCHEMA.replace(/REPLACE_SOURCE/g, 'claude-code')}
\`\`\`

**\`.agenthandoff/current-handoff.md\`** — markdown version with sections: ## Task State, ## Decisions, ## Warnings, ## Failed Attempts, ## Related Files, ## Next Action

${RULES}

After writing both files, output exactly:
"✓ Handoff ready. Next: \`agenthandoff inline\` to get a paste-ready summary, or \`agenthandoff mcp start\` to serve it via MCP."
`;

const CODEX_PROMPT = `Based on our entire conversation in this session, generate a precise handoff packet so the next AI agent continues exactly where we left off.

Write these two files:

**\`.agenthandoff/current-handoff.json\`**
\`\`\`json
${PACKET_SCHEMA.replace(/REPLACE_SOURCE/g, 'codex')}
\`\`\`

**\`.agenthandoff/current-handoff.md\`** — markdown with sections: ## Task State, ## Decisions, ## Warnings, ## Failed Attempts, ## Related Files, ## Next Action

${RULES}

After writing both files, output: "✓ Handoff ready."
`;

const CURSOR_RULE = `---
description: Generate a handoff packet for switching to another AI coding agent
alwaysApply: false
---

When the user says "generate handoff for [agent]" or "handoff to [agent]":

1. Based on the current chat session, write \`.agenthandoff/current-handoff.json\` with this structure:
${PACKET_SCHEMA.replace(/REPLACE_SOURCE/g, 'cursor').replace('$ARGUMENTS', '<target agent from user message>')}

2. Also write \`.agenthandoff/current-handoff.md\` — markdown with sections: ## Task State, ## Decisions, ## Warnings, ## Failed Attempts, ## Next Action

${RULES}

After writing: output "✓ Handoff ready. Run \`agenthandoff inline\` for a paste-ready summary."
`;

const GEMINI_TOML_COMMAND = `# AgentHandoff: generate a handoff packet for another agent
# Usage: /handoff <target-agent>
[command]
description = "Generate a handoff packet for switching to another AI coding agent"
prompt = """
Based on our entire conversation in this session, generate a precise handoff packet so the next AI agent ({{args}}) continues exactly where we left off.

Write .agenthandoff/current-handoff.json and .agenthandoff/current-handoff.md with: task_state (goal, current_step, next_action), decisions (with reasons), warnings, failed_attempts (with why_failed), and related_files.

Be specific. Every failed_attempt MUST include why_failed. next_action must reference exact file:line. Set provenance.review_status to 'approved'.

After writing, output: "Handoff ready. Run agenthandoff inline for a paste-ready summary."
"""
`;

const GEMINI_PROMPT = `Based on our entire conversation in this session, generate a precise handoff packet so the next AI agent continues exactly where we left off.

You have full context of everything we built, decided, failed, and learned.

Write these two files:

**\`.agenthandoff/current-handoff.json\`**
\`\`\`json
${PACKET_SCHEMA.replace(/REPLACE_SOURCE/g, 'gemini')}
\`\`\`

**\`.agenthandoff/current-handoff.md\`** — markdown with sections: ## Task State, ## Decisions, ## Warnings, ## Failed Attempts, ## Related Files, ## Next Action

${RULES}

After writing both files, output: "✓ Handoff ready. Run \`agenthandoff inline\` for a paste-ready summary, or \`agenthandoff mcp start\` to serve via MCP."
`;
