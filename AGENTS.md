# AGENTS.md

Instructions for OpenAI Codex CLI when working in this repository.

## AgentHandoff — Autonomous Context Transfer

This project has an **agenthandoff** MCP server that auto-starts with your session. It contains context from previous agent sessions (Claude Code, Cursor, Gemini, etc.).

### On session start — read incoming handoff

At the start of every session, call these MCP tools from the agenthandoff server:

1. `get_task_state` — what was being worked on, current step, next action (~50 tokens)
2. `get_decisions` — architectural decisions already made (~150 tokens)
3. `get_warnings` — constraints and things to avoid (~100 tokens)

If a handoff packet exists, acknowledge the context and continue from where the previous agent left off. If no packet exists, proceed normally.

### During your session — push context automatically

As you work, call the MCP tools to build up context for the next agent:

- `push_decision` — record decisions as you make them
- `push_warning` — record constraints or dangers
- `push_failed_attempt` — record what didn't work and why
- `set_task_state` — update goal, current step, next action

### When the user says "handoff" or "switch to X"

Write the complete handoff packet to `.agenthandoff/current-handoff.json` and `.agenthandoff/current-handoff.md` following the schema in CLAUDE.md. Include all decisions, warnings, failed attempts, and the exact next action.
