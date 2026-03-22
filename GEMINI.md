# GEMINI.md

Instructions for Gemini CLI when working in this repository.

## AgentHandoff — Autonomous Context Transfer

This project has an **agenthandoff** MCP server that auto-starts with your session.

### On session start

Call `get_task_state`, `get_decisions`, and `get_warnings` from the agenthandoff MCP server. If a handoff packet exists from a previous agent, acknowledge it and continue from where they left off.

### During your session

Push context via MCP as you work: `push_decision`, `push_warning`, `push_failed_attempt`, `set_task_state`.

### On handoff

When the user says "handoff" or "switch to X", write `.agenthandoff/current-handoff.json` and `.agenthandoff/current-handoff.md` with the full session context.
