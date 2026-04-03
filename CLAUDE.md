# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MCP-First Code Navigation

Use **jcodemunch-mcp** for all code lookups. Never read full files when MCP is available.

1. Call `list_repos` first — if the project is not indexed, call `index_folder` with the current directory.
2. Use `search_symbols` / `get_symbol` to find and retrieve code by symbol name.
3. Use `get_repo_outline` or `get_file_outline` to explore structure.
4. Fall back to direct file reads only when editing or when MCP is unavailable.

<!-- AGENTHANDOFF:BEGIN -->
## AgentHandoff — Autonomous Context Transfer

This project uses the **agenthandoff** MCP server for real-time context capture. The server does **not** start automatically on its own — it is launched by your agent only if `agenthandoff setup` (or `agenthandoff mcp config --for claude-code`) was run first to write the MCP config into `.mcp.json`. If MCP tools are unavailable, the server can be started manually with `agenthandoff mcp start`. See the [MCP Setup](#mcp-setup) section in the README for full setup steps.

### During your session — push context automatically

Whenever you make an important decision, discover a constraint, or hit a dead end, call the MCP tools immediately:

- `push_decision` — record architectural decisions as you make them (statement, reason, related files)
- `push_warning` — record constraints or dangers discovered
- `push_failed_attempt` — record approaches that failed and why (prevents the next agent from repeating mistakes)
- `set_task_state` — update the current goal, step, and next action
- `add_note` — record anything else worth preserving

Do this proactively throughout the session. Don't wait until the end.

### When the user says "handoff" or "switch to X"

When the user says any of: "handoff to X", "switch to X", "hand off", "transfer to X", or similar — generate the complete handoff packet by writing these two files:

**`.agenthandoff/current-handoff.json`** — structured packet:
```json
{
  "schema_version": "1.0",
  "project_id": "unknown",
  "project_path": "<absolute path of this project>",
  "created_at": "<ISO timestamp>",
  "source_agent": "claude-code",
  "target_agent": "<target from user's message, default 'generic'>",
  "task_state": {
    "goal": "<specific goal>",
    "current_step": "<what you were doing>",
    "next_action": "<EXACT next action with file:line>",
    "blocked_on": null
  },
  "decisions": [{"statement": "", "reason": "", "related_files": [], "confidence": 0.95}],
  "facts": [{"statement": "", "source": "claude-code-session", "related_files": []}],
  "warnings": [{"statement": "", "source": "claude-code-session"}],
  "failed_attempts": [{"what": "", "why_failed": "", "recommendation": ""}],
  "related_files": [],
  "open_questions": [],
  "manual_notes": [],
  "provenance": {
    "capture_method": "agent-self-reported",
    "sources_used": ["claude-code-session-context"],
    "review_status": "approved"
  }
}
```

**`.agenthandoff/current-handoff.md`** — human-readable markdown with sections: Task State, Decisions, Warnings, Failed Attempts, Related Files, Next Action.

Rules for the packet:
- Be specific. "worked on auth" is useless. "Added JWT refresh at src/auth/routes.ts:45" is good.
- Every failed_attempt MUST include why_failed.
- next_action must be exact enough that the next agent starts immediately.
- Include ALL decisions and warnings from the session, not just recent ones.
- After writing, confirm: "Handoff ready. The target agent can pick up context via MCP (`agenthandoff mcp start`) or inline paste (`agenthandoff inline`)."

### On session start — check for incoming handoff

At the start of this session, call `get_task_state` from the agenthandoff MCP server. If a handoff packet exists from a previous agent, acknowledge the context and continue from where the previous agent left off. If no packet exists, proceed normally.
<!-- AGENTHANDOFF:END -->
