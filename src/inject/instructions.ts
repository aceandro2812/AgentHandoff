/**
 * Injects AgentHandoff autonomous instructions into each agent's instruction file.
 * Uses markers so `agenthandoff clean` can remove them cleanly.
 *
 * Never overwrites existing content — appends a marked block.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const BEGIN_MARKER = '<!-- AGENTHANDOFF:BEGIN -->';
const END_MARKER = '<!-- AGENTHANDOFF:END -->';

// ── Instruction templates per agent ──────────────────────────────────────────

function mcpToolList(): string {
  return `- \`push_decision\` — record architectural decisions as you make them (statement, reason, related files)
- \`push_warning\` — record constraints or dangers discovered
- \`push_failed_attempt\` — record approaches that failed and why (prevents the next agent from repeating mistakes)
- \`set_task_state\` — update the current goal, step, and next action
- \`add_note\` — record anything else worth preserving`;
}

function readToolList(): string {
  return `1. \`get_task_state\` — what was being worked on, current step, next action (~50 tokens)
2. \`get_decisions\` — architectural decisions already made (~150 tokens)
3. \`get_warnings\` — constraints and things to avoid (~100 tokens)`;
}

function packetSchema(): string {
  return `{
  "schema_version": "1.0",
  "project_id": "unknown",
  "project_path": "<absolute path of this project>",
  "created_at": "<ISO timestamp>",
  "source_agent": "<this agent>",
  "target_agent": "<target from user's message, default 'generic'>",
  "task_state": {
    "goal": "<specific goal>",
    "current_step": "<what you were doing>",
    "next_action": "<EXACT next action with file:line>",
    "blocked_on": null
  },
  "decisions": [{"statement": "", "reason": "", "related_files": [], "confidence": 0.95}],
  "facts": [{"statement": "", "source": "<agent>-session", "related_files": []}],
  "warnings": [{"statement": "", "source": "<agent>-session"}],
  "failed_attempts": [{"what": "", "why_failed": "", "recommendation": ""}],
  "related_files": [],
  "open_questions": [],
  "manual_notes": [],
  "provenance": {
    "capture_method": "agent-self-reported",
    "sources_used": ["<agent>-session-context"],
    "review_status": "approved"
  }
}`;
}

function handoffTriggerSection(agentName: string): string {
  return `When the user says any of: "handoff to X", "switch to X", "hand off", "transfer to X", or similar — generate the complete handoff packet by writing these two files:

**\`.agenthandoff/current-handoff.json\`** — structured packet:
\`\`\`json
${packetSchema().replace(/<this agent>/g, agentName).replace(/<agent>/g, agentName)}
\`\`\`

**\`.agenthandoff/current-handoff.md\`** — human-readable markdown with sections: Task State, Decisions, Warnings, Failed Attempts, Related Files, Next Action.

Rules for the packet:
- Be specific. "worked on auth" is useless. "Added JWT refresh at src/auth/routes.ts:45" is good.
- Every failed_attempt MUST include why_failed.
- next_action must be exact enough that the next agent starts immediately.
- Include ALL decisions and warnings from the session, not just recent ones.
- After writing, confirm: "Handoff ready. The target agent will pick up context automatically via MCP."`;
}

function generateInstructions(agentId: string): string {
  const lines: string[] = [];

  switch (agentId) {
    case 'claude-code':
      lines.push(`## AgentHandoff — Autonomous Context Transfer`);
      lines.push(``);
      lines.push(`This project has an **agenthandoff** MCP server that auto-starts with your session. Use it to build up handoff context as you work, so switching to another agent (Codex, Cursor, Gemini, etc.) is seamless.`);
      lines.push(``);
      lines.push(`### During your session — push context automatically`);
      lines.push(``);
      lines.push(`Whenever you make an important decision, discover a constraint, or hit a dead end, call the MCP tools immediately:`);
      lines.push(``);
      lines.push(mcpToolList());
      lines.push(``);
      lines.push(`Do this proactively throughout the session. Don't wait until the end.`);
      lines.push(``);
      lines.push(`### When the user says "handoff" or "switch to X"`);
      lines.push(``);
      lines.push(handoffTriggerSection('claude-code'));
      lines.push(``);
      lines.push(`### On session start — check for incoming handoff`);
      lines.push(``);
      lines.push(`At the start of this session, call \`get_task_state\` from the agenthandoff MCP server. If a handoff packet exists from a previous agent, acknowledge the context and continue from where the previous agent left off. If no packet exists, proceed normally.`);
      break;

    case 'codex':
      lines.push(`## AgentHandoff — Autonomous Context Transfer`);
      lines.push(``);
      lines.push(`This project has an **agenthandoff** MCP server that auto-starts with your session. It contains context from previous agent sessions (Claude Code, Cursor, Gemini, etc.).`);
      lines.push(``);
      lines.push(`### On session start — read incoming handoff`);
      lines.push(``);
      lines.push(`At the start of every session, call these MCP tools from the agenthandoff server:`);
      lines.push(``);
      lines.push(readToolList());
      lines.push(``);
      lines.push(`If a handoff packet exists, acknowledge the context and continue from where the previous agent left off. If no packet exists, proceed normally.`);
      lines.push(``);
      lines.push(`### During your session — push context automatically`);
      lines.push(``);
      lines.push(`As you work, call the MCP tools to build up context for the next agent:`);
      lines.push(``);
      lines.push(mcpToolList());
      lines.push(``);
      lines.push(`### When the user says "handoff" or "switch to X"`);
      lines.push(``);
      lines.push(handoffTriggerSection('codex'));
      break;

    case 'cursor':
      lines.push(`## AgentHandoff — Autonomous Context Transfer`);
      lines.push(``);
      lines.push(`This project has an **agenthandoff** MCP server configured in .cursor/mcp.json.`);
      lines.push(``);
      lines.push(`### On session start`);
      lines.push(``);
      lines.push(`Call \`get_task_state\`, \`get_decisions\`, and \`get_warnings\` from the agenthandoff MCP server. If a handoff packet exists from a previous agent, acknowledge it and continue from where they left off.`);
      lines.push(``);
      lines.push(`### During your session`);
      lines.push(``);
      lines.push(`Push context via MCP as you work:`);
      lines.push(``);
      lines.push(mcpToolList());
      lines.push(``);
      lines.push(`### On handoff`);
      lines.push(``);
      lines.push(handoffTriggerSection('cursor'));
      break;

    case 'gemini':
      lines.push(`## AgentHandoff — Autonomous Context Transfer`);
      lines.push(``);
      lines.push(`This project has an **agenthandoff** MCP server that auto-starts with your session.`);
      lines.push(``);
      lines.push(`### On session start`);
      lines.push(``);
      lines.push(`Call \`get_task_state\`, \`get_decisions\`, and \`get_warnings\` from the agenthandoff MCP server. If a handoff packet exists from a previous agent, acknowledge it and continue from where they left off.`);
      lines.push(``);
      lines.push(`### During your session`);
      lines.push(``);
      lines.push(`Push context via MCP as you work:`);
      lines.push(``);
      lines.push(mcpToolList());
      lines.push(``);
      lines.push(`### On handoff`);
      lines.push(``);
      lines.push(handoffTriggerSection('gemini'));
      break;

    case 'aider':
      lines.push(`## AgentHandoff — Context Transfer`);
      lines.push(``);
      lines.push(`If a file \`.agenthandoff/current-handoff.md\` exists, read it at the start of your session to get context from a previous agent. When the user says "handoff", write \`.agenthandoff/current-handoff.json\` and \`.agenthandoff/current-handoff.md\` with your session's decisions, warnings, failed attempts, and next action.`);
      break;

    case 'windsurf':
      lines.push(`## AgentHandoff — Context Transfer`);
      lines.push(``);
      lines.push(`If a file \`.agenthandoff/current-handoff.md\` exists, read it at the start of your session. When the user says "handoff", write the handoff packet to \`.agenthandoff/current-handoff.json\` and \`.agenthandoff/current-handoff.md\`.`);
      break;

    case 'copilot':
      lines.push(`## AgentHandoff — Autonomous Context Transfer`);
      lines.push(``);
      lines.push(`This project has an **agenthandoff** MCP server configured in .vscode/mcp.json.`);
      lines.push(``);
      lines.push(`On session start, call \`get_task_state\` and \`get_decisions\` from the agenthandoff MCP server. Push decisions and warnings via MCP tools as you work.`);
      break;

    case 'firebase-studio':
      lines.push(`## AgentHandoff — Context Transfer`);
      lines.push(``);
      lines.push(`If \`.agenthandoff/current-handoff.md\` exists, read it at the start of your session. When the user says "handoff", write the handoff packet to \`.agenthandoff/current-handoff.json\` and \`.agenthandoff/current-handoff.md\`.`);
      break;

    case 'antigravity':
      lines.push(`## AgentHandoff — Context Transfer`);
      lines.push(``);
      lines.push(`If \`.agenthandoff/current-handoff.md\` exists, read it at the start of your session. When the user says "handoff", write the handoff packet to \`.agenthandoff/current-handoff.json\` and \`.agenthandoff/current-handoff.md\`.`);
      break;

    default:
      lines.push(`## AgentHandoff — Context Transfer`);
      lines.push(``);
      lines.push(`If \`.agenthandoff/current-handoff.md\` exists, read it for context from a previous agent session.`);
      break;
  }

  return lines.join('\n');
}

// ── Instruction file paths per agent ─────────────────────────────────────────

function getInstructionFilePath(agentId: string, projectRoot: string): string | null {
  switch (agentId) {
    case 'claude-code':    return join(projectRoot, 'CLAUDE.md');
    case 'codex':          return join(projectRoot, 'AGENTS.md');
    case 'cursor':         return join(projectRoot, '.cursorrules');
    case 'gemini':         return join(projectRoot, 'GEMINI.md');
    case 'aider':          return join(projectRoot, 'CONVENTIONS.md');
    case 'windsurf':       return join(projectRoot, '.windsurfrules');
    case 'copilot':        return join(projectRoot, '.github', 'copilot-instructions.md');
    case 'firebase-studio': return join(projectRoot, '.idx', 'airules.md');
    case 'antigravity':    return join(projectRoot, '.antigravity', 'instructions.md');
    default:               return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Inject AgentHandoff instructions into the agent's instruction file.
 * Appends a marked block. If the block already exists, replaces it.
 * Returns the file path written, or null if not applicable.
 */
export function injectInstructions(agentId: string, projectRoot: string): string | null {
  const filePath = getInstructionFilePath(agentId, projectRoot);
  if (!filePath) return null;

  const instructions = generateInstructions(agentId);
  const block = `\n\n${BEGIN_MARKER}\n${instructions}\n${END_MARKER}\n`;

  // Ensure directory exists
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  let existing = '';
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf8');
  }

  // Check if block already exists — replace it
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  let updated: string;
  if (beginIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    updated = existing.substring(0, beginIdx).trimEnd() + block + existing.substring(endIdx + END_MARKER.length);
  } else {
    // Append
    updated = existing.trimEnd() + block;
  }

  writeFileSync(filePath, updated, 'utf8');
  return filePath;
}

/**
 * Remove AgentHandoff instructions from the agent's instruction file.
 * Returns the file path cleaned, or null if nothing to clean.
 */
export function cleanInstructions(agentId: string, projectRoot: string): string | null {
  const filePath = getInstructionFilePath(agentId, projectRoot);
  if (!filePath || !existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf8');
  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1) return null;

  // Remove the block including surrounding whitespace
  const before = content.substring(0, beginIdx).trimEnd();
  const after = content.substring(endIdx + END_MARKER.length).trimStart();

  const cleaned = before + (after ? '\n\n' + after : '') + '\n';

  writeFileSync(filePath, cleaned, 'utf8');
  return filePath;
}

/**
 * List all agent IDs that have instruction file support.
 */
export const INSTRUCTION_AGENTS = [
  'claude-code', 'codex', 'cursor', 'gemini', 'aider',
  'windsurf', 'copilot', 'firebase-studio', 'antigravity',
] as const;
