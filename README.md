# AgentHandoff

**Switch AI coding agents without losing context.**

When you switch from Claude Code to Codex, Cursor, or Aider mid-task, the new agent starts from scratch — re-reading files, missing decisions you made, potentially repeating mistakes you already solved. A cold-start agent switch wastes **20,000–80,000 tokens** on re-discovery.

AgentHandoff fixes this. The source agent writes a structured handoff packet from its own session context — zero extra API cost, perfect accuracy because the agent was there. The receiving agent picks it up via MCP (on-demand, 50–200 tokens) or a paste-ready inline block (~68 tokens).

**Token reduction: 60–85% per switch (measured).**

---

## Table of Contents

- [How It Works](#how-it-works)
- [Install](#install)
- [One-Time Setup](#one-time-setup)
- [MCP Setup](#mcp-setup)
- [Daily Workflow](#daily-workflow)
- [Agent-Specific Guides](#agent-specific-guides)
- [MCP Server Reference](#mcp-server-reference)
- [Command Reference](#command-reference)
- [The Handoff Packet](#the-handoff-packet)
- [Delivery Methods](#delivery-methods)
- [Safety Design](#safety-design)
- [Troubleshooting](#troubleshooting)
- [Adding a New Agent](#adding-a-new-agent)
- [Known Gaps & Limitations](#known-gaps--limitations)
- [Testing Guide](#testing-guide)
- [Architecture](#architecture)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     SOURCE AGENT SESSION                        │
│                                                                 │
│  You work with Claude Code / Codex / Cursor for hours.         │
│  Decisions made. Files edited. Dead ends hit. Context built.   │
│                                                                 │
│  At switch point → run /project:handoff <target>               │
│                                                                 │
│  The agent writes .agenthandoff/current-handoff.json           │
│  from its own context — no external API, no scraping           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                    structured JSON packet
                    (decisions, task state,
                     warnings, failed attempts,
                     related files, next action)
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    RECEIVING AGENT SESSION                       │
│                                                                 │
│  Option A — MCP (best):                                         │
│    Agent connects to agenthandoff MCP server at startup.        │
│    Calls get_task_state() → 50 tokens. Done.                   │
│    Queries get_decisions() only if it needs architecture.       │
│                                                                 │
│  Option B — Inline paste (fastest):                             │
│    agenthandoff inline → ~68 token block → paste as first msg  │
│                                                                 │
│  Option C — File injection (fallback):                          │
│    agenthandoff inject --to <agent> → reads handoff.md         │
└─────────────────────────────────────────────────────────────────┘
```

**The key insight**: the source agent already has the full session in its context window. Asking it to write the packet is free — the same session you are already paying for. No Haiku call. No JSONL parsing. No regex. The agent was there; it knows everything.

---

## Install

### From npm (recommended)

```bash
npm install -g agenthandoff
```

### From source

```bash
git clone https://github.com/your-org/agenthandoff
cd agenthandoff
npm install
npm run build
npm link        # makes `agenthandoff` available globally
```

### Verify

```bash
agenthandoff --version   # should print the installed version
agenthandoff agents      # list supported agents
```

---

## One-Time Setup

Run this once per machine. It auto-detects which agents are installed and configures everything.

```bash
agenthandoff setup
```

**What it does:**
1. Scans for installed agents (Claude Code, Codex, Cursor, Aider, Windsurf, Copilot, Gemini CLI, Firebase Studio, Antigravity)
2. Installs the `/handoff` slash command into each agent's command directory
3. Writes MCP server config for agents that support MCP
4. Prints a usage guide specific to what was found

**Example output:**

```
AgentHandoff Setup
Detecting installed agents and configuring everything...

Detected agents:
  ✓ Claude Code          `claude` binary found in PATH
  ✓ OpenAI Codex CLI     `codex` binary found in PATH
  ✓ Cursor               /Applications/Cursor.app found

Configuring...

Setup complete
──────────────────────────────────────────
  ✓ Claude Code:      MCP + slash commands
  ✓ OpenAI Codex CLI: MCP + slash commands
  ✓ Cursor:           MCP + slash commands
  ✓ Google Gemini CLI: MCP + slash commands

How to use
  Claude Code → any agent:
    /project:handoff codex

  Codex → any agent:
    /handoff claude-code

  Gemini CLI → any agent:
    /handoff claude-code

  Cursor → any agent:
    "generate handoff for claude-code"
```

**Options:**

```bash
agenthandoff setup --dry-run   # preview without making changes
agenthandoff setup --force     # configure all agents even if not detected
```

**Manual setup for a specific agent:**

```bash
agenthandoff init --agent claude-code   # slash command only
agenthandoff init --agent cursor
agenthandoff init --agent all

agenthandoff mcp config --for claude-code   # MCP config only
agenthandoff mcp config --for codex
agenthandoff mcp config --for all
```

---

## MCP Setup

MCP lets the receiving agent query context on-demand (50–200 tokens) instead of re-reading files. **The MCP server does not start automatically when you install agenthandoff.** You must configure it once per machine/project so your agent knows how to launch it.

### Step 1 — Write the MCP config

Run `setup` to auto-detect and configure all installed agents at once:

```bash
agenthandoff setup
```

Or configure a specific agent:

```bash
agenthandoff mcp config --for claude-code
agenthandoff mcp config --for codex
agenthandoff mcp config --for cursor
agenthandoff mcp config --for copilot     # VS Code + GitHub Copilot
agenthandoff mcp config --for gemini
agenthandoff mcp config --for all         # all supported agents
```

### Step 2 — Start the server (if your agent does not auto-launch it)

Agents that support MCP auto-launch (Claude Code, Codex, Cursor, VS Code Copilot, Gemini CLI) will launch `agenthandoff mcp start` automatically once their config is written. For other cases, or to test manually:

```bash
agenthandoff mcp start &   # background
```

> **Note:** The server uses stdio transport. It must be running before any agent tries to call MCP tools.

---

### Per-agent MCP config

#### Claude Code

**Config file written to:** `.mcp.json` (project-level)

```json
{
  "mcpServers": {
    "agenthandoff": {
      "command": "agenthandoff",
      "args": ["mcp", "start"]
    }
  }
}
```

**Setup:**

```bash
agenthandoff mcp config --for claude-code
```

Claude Code reads `.mcp.json` when you open the project and launches the server automatically. No further steps needed.

**Verify it is working:** Open the project in Claude Code and ask: *"Call get_task_state from the agenthandoff MCP server."* If the server is not running you will see a connection error — re-run `agenthandoff mcp config --for claude-code` and restart Claude Code.

---

#### OpenAI Codex CLI

**Config file written to:** `~/.codex/config.toml` (global)

```toml
[mcp_servers.agenthandoff]
command = "agenthandoff"
args = ["mcp", "start"]
```

**Setup:**

```bash
agenthandoff mcp config --for codex
```

Codex reads `~/.codex/config.toml` at startup and launches the server. Because Codex does not query MCP tools on its own, add this to your session-start prompt:

```
Call get_task_state from the agenthandoff MCP server to understand what was worked on previously.
```

---

#### VS Code (GitHub Copilot)

One config file is written for the current VS Code workspace:

| File | Scope |
|------|-------|
| `.vscode/mcp.json` | Workspace (VS Code reads this per-project) |

```json
{
  "servers": {
    "agenthandoff": {
      "type": "stdio",
      "command": "agenthandoff",
      "args": ["mcp", "start"]
    }
  }
}
```

**Setup:**

```bash
agenthandoff mcp config --for copilot
```

VS Code reads `.vscode/mcp.json` automatically when you open the workspace with the GitHub Copilot extension installed. Make sure **MCP support is enabled** in VS Code settings (`"chat.mcp.enabled": true`). `agenthandoff mcp config --for copilot` does not write a separate `~/.copilot/` global config file.

---

#### Cursor

**Config file written to:** `.cursor/mcp.json` (project-level)

```json
{
  "mcpServers": {
    "agenthandoff": {
      "command": "agenthandoff",
      "args": ["mcp", "start"]
    }
  }
}
```

**Setup:**

```bash
agenthandoff mcp config --for cursor
```

Cursor reads `.cursor/mcp.json` when you open the project. The `agenthandoff` server will appear in Cursor's MCP server list. To query context, ask in Composer or Chat:

```
Use get_task_state from agenthandoff to see what was worked on last.
```

---

#### Gemini CLI

**Config file written to:** `.gemini/settings.json` (project-level)

```json
{
  "mcpServers": {
    "agenthandoff": {
      "command": "agenthandoff",
      "args": ["mcp", "start"]
    }
  }
}
```

**Setup:**

```bash
agenthandoff mcp config --for gemini
```

Gemini CLI reads `.gemini/settings.json` when started in the project directory and launches the server.

---

### MCP tools reference

| Tool | What it returns | Approx tokens |
|------|----------------|---------------|
| `get_task_state` | Current goal, step, next action, blockers | ~50 |
| `get_decisions` | Architectural decisions + rationale | ~150 |
| `get_warnings` | Constraints and things to avoid | ~100 |
| `get_related_files` | Key files for the current task | ~30 |
| `get_summary` | Brief overview of the packet | ~20 |
| `get_current_handoff` | Full packet as markdown | ~400 |
| `get_context_for_task` | Ranked subset for a specific task | ~80 |
| `add_note` | Add a note to the packet | — |
| `push_decision` | Record a decision in real-time | — |
| `push_warning` | Record a warning in real-time | — |
| `push_failed_attempt` | Record a failed approach | — |
| `set_task_state` | Update goal / step / next action | — |
| `initialize_handoff` | Start or re-target a handoff session | — |
| `add_fact` | Record a factual project observation | — |
| `add_open_question` | Record an unresolved question | — |
| `build_handoff` | Build and merge the full packet through MCP | — |

---

## Daily Workflow

### Switching FROM an agent (generating the packet)

At any point during your session — or at the end — run the slash command inside the agent:

**Claude Code:**
```
/project:handoff codex
```

**Codex:**
```
/handoff claude-code
```

**Cursor:**
```
generate handoff for claude-code
```

The agent reads its own session context and writes two files:
- `.agenthandoff/current-handoff.json` — structured data
- `.agenthandoff/current-handoff.md` — human-readable markdown

**Zero extra API cost.** The agent uses its existing context window.

---

### Switching TO an agent (receiving the packet)

**Option A — MCP (recommended)**

Start the MCP server before opening the new agent:

```bash
agenthandoff mcp start &   # background
```

The new agent connects automatically (if MCP was configured via `setup`) and calls tools on demand:
- `get_task_state` → what was being worked on (~50 tokens)
- `get_decisions` → architectural choices (~150 tokens)
- `get_warnings` → things to avoid (~100 tokens)

Total token cost: only what the agent queries.

**Option B — Inline paste**

```bash
agenthandoff inline
```

Copy the ~68-token output and paste it as the **first message** in the new agent session:

```
[HANDOFF claude-code→codex | 2026-03-15]
task: implement JWT auth refresh endpoint
files: src/auth/routes.ts, src/auth/middleware.ts
decided: use access+refresh token pair | 15min/7day expiry
warn: never store raw tokens in DB | bcrypt only
failed: Redis for token blacklist (latency ~200ms)
next: implement /auth/refresh handler at src/auth/routes.ts:45
[/HANDOFF]

Acknowledge the above context, then continue from where the previous agent left off.
```

**Option C — File injection (fallback)**

```bash
agenthandoff approve   # if packet is still DRAFT
agenthandoff inject --to codex
```

This writes `.agenthandoff/codex-handoff.md`. Start Codex and tell it to read it:

```bash
codex "Read .agenthandoff/codex-handoff.md first, then continue working on this project."
```

---

### Enriching the packet manually

Add context the agent may have missed:

```bash
agenthandoff add --decision "Using PostgreSQL not SQLite — needed for concurrent writes"
agenthandoff add --warning  "Never run migrations without a backup snapshot first"
agenthandoff add --note     "Working on: OAuth2 login flow, halfway through"
agenthandoff add --failed   "Tried using bcrypt for token storage — too slow at >1000 req/s"
agenthandoff add --question "Should refresh tokens survive user password changes?"
```

---

### Review and audit

```bash
agenthandoff preview   # full packet in terminal
agenthandoff status    # item counts + audit log
agenthandoff eval      # token comparison: cold start vs manual vs AgentHandoff
```

---

### Cleanup

```bash
agenthandoff clean     # remove all injected artifacts (full rollback)
```

---

## Agent-Specific Guides

### Claude Code

**Slash command installed at:** `.claude/commands/handoff.md`

**Usage:**
```
/project:handoff codex        # specify target agent
/project:handoff cursor
/project:handoff              # generic if no target
```

Claude reads its entire session context and writes the packet directly using the Write tool. The packet is `approved` by default (self-generated, no extra review needed).

**MCP config written to:** `.mcp.json`

```json
{
  "mcpServers": {
    "agenthandoff": {
      "command": "agenthandoff",
      "args": ["mcp", "start"]
    }
  }
}
```

Once the config is in place, Claude Code launches the MCP server automatically when you open the project (it reads `mcpServers` from `.mcp.json`). **You must run `agenthandoff setup` or `agenthandoff mcp config --for claude-code` first** — this is a one-time step per machine/project. See [MCP Setup](#mcp-setup) for details.

Available tools: `get_current_handoff`, `get_task_state`, `get_decisions`, `get_warnings`, `get_related_files`, `get_summary`, `get_context_for_task`, `add_note`, `push_decision`, `push_warning`, `push_failed_attempt`, `set_task_state`, `initialize_handoff`, `add_fact`, `add_open_question`, `build_handoff`.

**Best practice — push during the session:**

With MCP running inside Claude Code, Claude can call `push_decision` as it makes choices, building up the packet in real-time rather than summarizing at the end:

```
# Claude will automatically call these during the session:
push_decision("Using Zod for runtime validation — better error messages than Joi")
push_warning("Never import from ../dist — always from ../src in tests")
set_task_state({ goal: "...", next_action: "..." })
```

---

### OpenAI Codex CLI

**Slash command installed at:** `.codex/commands/handoff.md`

**Usage inside Codex:**
```
/handoff claude-code
/handoff cursor
```

**MCP config written to:** `~/.codex/config.toml`

```toml
[mcp_servers.agenthandoff]
command = "agenthandoff"
args = ["mcp", "start"]
```

Once configured, Codex reads `~/.codex/config.toml` at startup and launches the MCP server automatically. **You must run `agenthandoff setup` or `agenthandoff mcp config --for codex` first.** Codex does not call any MCP tools on its own — prompt it to call `get_task_state` at the start of the session.

**Receiving a handoff from Claude Code:**

```bash
# After Claude runs /project:handoff codex:
agenthandoff mcp start &
codex   # Codex connects and queries context on startup
```

Or use inline:
```bash
agenthandoff inline   # copy output
# paste as first message to Codex
```

---

### Cursor

**Slash command installed as:** `.cursor/rules/handoff-instructions.mdc` (always-off rule, triggered on request)

**Usage in Cursor chat or Composer:**
```
generate handoff for claude-code
generate handoff for codex
```

**MCP config written to:** `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "agenthandoff": {
      "command": "agenthandoff",
      "args": ["mcp", "start"]
    }
  }
}
```

Cursor queries the MCP server in chat/Composer when you ask about previous context.

**Receiving a handoff in Cursor:**

Cursor reads `.cursor/rules/agenthandoff.mdc` automatically (set to `alwaysApply: true`):

```bash
agenthandoff inject --to cursor   # writes .cursor/rules/agenthandoff.mdc
# Open Cursor — context is loaded automatically in every chat
```

---

### Aider

Aider does not support MCP or slash commands. Use file injection or inline.

**Generating a handoff from Aider:**

```bash
# Aider reads CONVENTIONS.md and .aider.chat.history.md
agenthandoff build --from aider --to claude-code
agenthandoff inline   # paste into Claude
```

**Receiving a handoff in Aider:**

```bash
agenthandoff inject --to aider
# Start Aider:
aider --read .aider.handoff.md
# Or inside an Aider session:
/read .aider.handoff.md
```

---

### Windsurf

**Generating a handoff from Windsurf:**

Ask Cascade in any session:
```
generate handoff for claude-code
```

Or build from Windsurf's rule files:
```bash
agenthandoff build --from windsurf --to codex
agenthandoff inline
```

**Receiving a handoff in Windsurf:**

```bash
agenthandoff inject --to windsurf
# Open a new Cascade session and send:
# "Read .agenthandoff/windsurf-handoff.md before continuing work."
```

---

### GitHub Copilot (VS Code + CLI)

VS Code Copilot now supports MCP via `.vscode/mcp.json`.

**MCP setup (recommended):**

```bash
agenthandoff mcp config --for copilot   # writes .vscode/mcp.json
agenthandoff mcp start                  # start server
# Copilot connects and queries context via MCP tools
```

**File injection (fallback):**

```bash
agenthandoff inject --to copilot
# Creates .github/agenthandoff-context.md

# Add to your copilot-instructions.md:
echo "See .github/agenthandoff-context.md for session context." >> .github/copilot-instructions.md

# Or reference in Copilot Chat:
# @workspace Read .github/agenthandoff-context.md
```

**Copilot CLI (`gh copilot`):**

The `gh copilot` extension is a suggest/explain tool — it doesn't maintain long sessions. Use inline paste for quick context:

```bash
agenthandoff inline   # copy output, paste into gh copilot suggest prompt
```

---

### Google Gemini CLI

**Slash command installed at:** `.gemini/commands/handoff.md`

**Usage inside Gemini CLI:**

```
/handoff codex
/handoff claude-code
```

Gemini reads its session context and writes the packet directly.

**MCP config written to:** `.gemini/settings.json`

```json
{
  "mcpServers": {
    "agenthandoff": {
      "command": "agenthandoff",
      "args": ["mcp", "start"]
    }
  }
}
```

**Receiving a handoff in Gemini:**

```bash
agenthandoff mcp start   # Gemini connects via MCP
# Or:
agenthandoff inline      # paste as first message
```

---

### Firebase Studio (Project IDX)

Firebase Studio (Google's cloud IDE with Gemini) uses `.idx/airules.md` as its instruction file.

**Generating a handoff from Firebase Studio:**

Ask Gemini in Firebase Studio:
```
generate handoff for claude-code
```

Or build from its rule files:
```bash
agenthandoff build --from firebase-studio --to codex
agenthandoff inline
```

**Receiving a handoff in Firebase Studio:**

```bash
agenthandoff inject --to firebase-studio
# Creates .agenthandoff/firebase-studio-handoff.md
# Open Gemini chat and send:
# "Read .agenthandoff/firebase-studio-handoff.md before continuing."
```

---

### Google Antigravity

Antigravity is Google's web-based agentic development platform (launched Nov 2025). It's separate from Firebase Studio / IDX.

**Generating a handoff from Antigravity:**

Ask the Antigravity agent:
```
generate handoff for claude-code
```

Or build from project context:
```bash
agenthandoff build --from antigravity --to codex
agenthandoff inline
```

**Receiving a handoff in Antigravity:**

```bash
agenthandoff inject --to antigravity
# Creates .agenthandoff/antigravity-handoff.md
# In the Agent View, start a new task with:
# "Read .agenthandoff/antigravity-handoff.md first, then continue working."
```

Or use inline paste (~68 tokens):
```bash
agenthandoff inline   # copy output, paste into Antigravity chat
```

---

## MCP Server Reference

The MCP server exposes the handoff packet as queryable tools. Agents call only what they need — much more efficient than reading a full markdown file.

**Start the server:**

```bash
agenthandoff mcp start           # foreground (for debugging)
agenthandoff mcp start &         # background
```

The server uses stdio transport and live-reloads the packet when it changes on disk.

### Read tools (receiving agent calls these)

| Tool | Returns | Typical tokens |
|------|---------|----------------|
| `get_task_state` | Goal, current step, blockers, next action | ~50 |
| `get_decisions` | All architectural decisions + rationale | ~150 |
| `get_warnings` | Warnings + failed approaches | ~100 |
| `get_related_files` | Key files for the current task | ~40 |
| `get_summary` | Item counts + current goal | ~60 |
| `get_current_handoff` | Full packet as markdown | ~1500 |
| `get_context_for_task` | Ranked subset for a specific task | ~80 |

### Write tools (source agent calls these during session)

| Tool | Purpose |
|------|---------|
| `push_decision` | Record an architectural decision as it's made |
| `push_warning` | Record a constraint or danger discovered |
| `push_failed_attempt` | Record an approach that failed and why |
| `set_task_state` | Update goal, current step, next action |
| `add_note` | Add a general note |
| `initialize_handoff` | Set source agent, target agent, and initial goal |
| `add_fact` | Record a factual project observation |
| `add_open_question` | Record an unresolved question for follow-up |
| `build_handoff` | Build and merge the full packet through MCP |

**Example — Claude calls these during a session:**

```
push_decision({
  statement: "Using refresh token rotation with 7-day expiry",
  reason: "Balances security (rotation) with UX (not logging out users daily)",
  files: ["src/auth/tokens.ts"]
})

push_failed_attempt({
  what: "Redis for token blacklist",
  why_failed: "Added 180ms P99 latency to every auth check",
  recommendation: "Use in-memory cache with short TTL instead"
})

set_task_state({
  goal: "Implement JWT auth refresh flow",
  current_step: "Refresh endpoint stub done, need token rotation logic",
  next_action: "Implement rotateTokens() at src/auth/tokens.ts:45"
})
```

### Suggested agent prompts

When configuring a new agent to use the MCP server, include this in its system prompt:

```
At the start of each session, call get_task_state to understand what was being
worked on. Call get_decisions before making architectural changes. Call
get_warnings before modifying files that have known constraints.
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `setup` | **One-time**: auto-detect agents, install MCP + slash commands |
| `init --agent <name>` | Install slash command for a specific agent |
| `build --from <agent> --to <agent>` | Build packet from session JSONL + instruction files |
| `preview` | Review the packet in terminal before injecting |
| `approve` | Mark packet as reviewed and ready to inject |
| `inject --to <agent>` | Write context file for target agent (file fallback) |
| `inject --to <agent> --force` | Inject even if packet is still DRAFT |
| `inline` | Output ~68-token compressed block for paste-in |
| `add --decision <text>` | Add an architectural decision |
| `add --warning <text>` | Add a warning |
| `add --note <text>` | Add a general note |
| `add --failed <text>` | Add a failed approach |
| `add --question <text>` | Add an open question |
| `status` | Show packet state, item counts, recent activity |
| `clean` | Remove all injected artifacts — full rollback |
| `agents` | List supported source and target agents |
| `eval` | Token comparison: cold start vs manual vs AgentHandoff |
| `mcp start` | Start MCP server (stdio transport) |
| `mcp config --for <agent>` | Write MCP config for an agent |
| `config --key <key>` | Store API key for optional LLM compression |
| `config --show` | Show current LLM config |

---

## The Handoff Packet

Every packet is a structured JSON document in `.agenthandoff/`:

```
.agenthandoff/
├── current-handoff.json    ← structured data (machine-readable)
├── current-handoff.md      ← rendered markdown (human-readable)
├── codex-handoff.md        ← injected for Codex (file fallback)
├── windsurf-handoff.md     ← injected for Windsurf
├── eval-report.txt         ← token comparison report
└── audit.log               ← every event timestamped
```

### Schema

```jsonc
{
  "schema_version": "1.0",
  "project_id": "ce8fec778d53",        // SHA256 of project path
  "project_path": "/Users/dev/myapp",
  "created_at": "2026-03-15T10:23:00Z",
  "source_agent": "claude-code",
  "target_agent": "codex",

  "task_state": {
    "goal": "Implement OAuth2 login with Google",
    "current_step": "Callback handler done, need to persist tokens",
    "next_action": "Add token storage at src/auth/google.ts:78",
    "blocked_on": null
  },

  "decisions": [
    {
      "statement": "Using refresh token rotation, not sliding sessions",
      "reason": "Rotation invalidates stolen tokens; sliding sessions do not",
      "related_files": ["src/auth/tokens.ts"],
      "confidence": 0.95
    }
  ],

  "facts": [
    {
      "statement": "This project uses ESM modules — never use require()",
      "source": "CLAUDE.md",
      "related_files": []
    }
  ],

  "warnings": [
    {
      "statement": "Never store raw tokens — hash with SHA256 before DB write",
      "source": "claude-session"
    }
  ],

  "failed_attempts": [
    {
      "what": "Redis for token blacklist",
      "why_failed": "180ms P99 latency on every auth check — unacceptable",
      "recommendation": "Use in-memory Map with 15min TTL and periodic cleanup"
    }
  ],

  "related_files": [
    "src/auth/routes.ts",
    "src/auth/tokens.ts",
    "src/auth/middleware.ts"
  ],

  "open_questions": [
    "Should refresh tokens survive a password reset?"
  ],

  "manual_notes": [],

  "provenance": {
    "capture_method": "agent-self-reported",  // or "tier1-rule-based"
    "sources_used": ["claude-code-session-context"],
    "review_status": "approved"               // "draft" requires approve before inject
  }
}
```

### Capture methods

| Method | How | Quality | API cost |
|--------|-----|---------|----------|
| `agent-self-reported` | Slash command — agent writes packet from its context | Best | $0 |
| `tier1-rule-based` | `agenthandoff build` — reads JSONL + instruction files + git | Good | $0 |
| `llm-compressed` | `build --llm` — rule-based extract then LLM compresses | Better | ~$0.002 |

---

## Delivery Methods

| Method | Tokens | Setup | Best for |
|--------|--------|-------|----------|
| **MCP on-demand** | 50–200 total | `setup` once | Claude Code, Codex, Cursor (all support MCP) |
| **Inline paste** | ~68 fixed | none | Quick switches, agents without MCP |
| **File injection** | ~1500–2000 | none | Aider, Windsurf, Copilot |

**Why MCP is best**: the receiving agent queries only what it needs. `get_task_state` costs 50 tokens. The agent may never need `get_decisions` if the task is straightforward. Total cost scales with actual information need, not packet size.

**Why inline is good for quick switches**: 68 tokens, no server to start, paste and go. The structured key:value format is optimized for LLM consumption — not prose, no wasted tokens on markdown formatting.

---

## Safety Design

- **Never mutates** `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or any durable instruction file
- **Draft → Approve → Inject** — cannot inject without review (use `--force` to override explicitly)
- **Secret redaction** — scans for API keys, bearer tokens, DB URLs, private keys before storage
- **Project isolation** — packets are scoped to a single repository, identified by path hash
- **Full rollback** — `agenthandoff clean` removes every injected artifact
- **Audit trail** — every capture, inject, and add action logged to `.agenthandoff/audit.log`
- **Local-only** — no data leaves your machine; MCP server uses stdio (no network port)

### What gets redacted automatically

- AWS access keys (`AKIA...`)
- GitHub tokens (`ghp_...`, `ghs_...`)
- Anthropic/OpenAI API keys (`sk-ant-...`, `sk-...`)
- Bearer tokens in headers
- PEM private keys
- Database connection strings with credentials
- `.env` file contents

---

## Troubleshooting

### "No handoff packet found"

```bash
agenthandoff status   # check if packet exists
# If not:
/project:handoff codex   # generate via slash command (recommended)
# or:
agenthandoff build --from claude-code --to codex
```

### "Packet is DRAFT — run approve first"

```bash
agenthandoff approve
# or skip the review:
agenthandoff inject --to codex --force
```

### MCP server not connecting

```bash
# Verify config was written:
cat .mcp.json                      # for Claude Code
cat .cursor/mcp.json               # for Cursor
cat ~/.codex/config.toml           # for Codex
cat .vscode/mcp.json               # for VS Code Copilot

# Test the server manually:
agenthandoff mcp start             # should start without error

# Re-run setup if needed:
agenthandoff setup
```

### Slash command not available

```bash
# Check the file exists:
ls .claude/commands/handoff.md     # Claude Code
ls .codex/commands/handoff.md      # Codex

# Reinstall:
agenthandoff init --agent claude-code
```

### Session context not extracted (build shows only CLAUDE.md)

The session JSONL reader looks for `~/.claude/projects/<hash>/`. If the hash doesn't match:

```bash
# Check what's in your Claude projects directory:
ls ~/.claude/projects/

# The tool tries SHA256 of the absolute path as fallback.
# If still not matching, use the slash command instead:
/project:handoff codex   # Claude reads its own context directly
```

### Setup detected no agents

```bash
agenthandoff setup --force   # configure all agents regardless
# or install the binary for your agent:
# Claude Code: npm install -g @anthropic-ai/claude-code
# Codex:       npm install -g @openai/codex
```

---

## Adding a New Agent

See [`src/adapters/template.ts`](src/adapters/template.ts) for the full adapter template with checklist.

**Quick guide:**

1. **Source reader** — `src/capture/<agent>.ts`
   - Reads Tier 1 files (stable, user-controlled): agent's rule files, instruction files
   - Returns structured context, not raw text
   - See `src/capture/cursor-rules.ts` as a reference

2. **Injector** — `src/inject/<agent>.ts`
   - Implements `Injector` interface: `inject()` and `clean()`
   - Never writes to the agent's main instruction file
   - Always writes to `.agenthandoff/` (except Cursor rules dir)

3. **Registration:**
   - `src/packet/schema.ts` — add to `SUPPORTED_SOURCE_AGENTS` / `SUPPORTED_TARGET_AGENTS`
   - `src/packet/builder.ts` — add agent-specific capture block
   - `src/cli/inject.ts` — add case in `getInjector()`
   - `src/cli/clean.ts` — add to injectors array

4. **Slash command** — add a case in `src/cli/init.ts` with the prompt template

5. **Detection** — add detection logic in `src/cli/setup.ts`

Submit a PR with all five files and a test with a sample project.

---

## Known Gaps & Limitations

### Gap 1 — Way 2 is "shared file" not "live pipe"

The original vision had two handoff modes:

> **Way 1**: Start a *new* session in the target agent with full context pre-loaded.
> **Way 2**: You are *already mid-session* in the target agent, you ask it to "contact Claude Code" and pull context live.

**Way 1 is fully implemented.** Way 2 works, but not quite the way the vision described it.

**What actually happens in Way 2:**

The MCP server does NOT connect directly to a running Claude Code process. Instead, both agents share a JSON file on disk (`.agenthandoff/current-handoff.json`) as a blackboard:

```
┌──────────────────┐        push_decision()        ┌────────────────────────┐
│   Claude Code    │  ─────────────────────────►  │  current-handoff.json  │
│  (source agent)  │  push_warning()               │  (shared blackboard)   │
│                  │  set_task_state()             │                        │
│                  │                               │  live-reloaded every   │
│                  │                               │  1 second by MCP server│
└──────────────────┘                               └───────────┬────────────┘
                                                               │
                                                  get_task_state()
                                                  get_decisions()
                                                               │
                                               ┌──────────────▼─────────────┐
                                               │        Codex / Gemini      │
                                               │     (target agent, MCP)    │
                                               └────────────────────────────┘
```

This is effectively live if Claude Code's CLAUDE.md instructions are active (Claude calls `push_*` tools proactively during its session), but:

- If Claude Code has not pushed anything yet, Codex gets no context
- It is not a direct process-to-process connection — it is a file on disk
- There is no on-demand "refresh now from the source agent's current window" mechanism

**Impact:** Medium. In practice, the CLAUDE.md autonomous instructions push context continuously so the blackboard is usually up to date. However the illusion of "Codex calling Claude Code" is not literal.

**Workaround until a proper fix:**

If Codex asks for context and the packet seems stale, ask Claude Code directly inside its session:

```
# In Claude Code:
push the current task state and any decisions made so far to the handoff packet
```

Claude calls `set_task_state` and `push_decision` via MCP, Codex's `get_task_state` immediately returns fresh data.

---

### Gap 2 — `captureClaudeSession` reads past sessions, not the live window

`agenthandoff build --from claude-code` reads the most recent `.jsonl` file from `~/.claude/projects/<hash>/`. This file is written periodically by Claude Code, not on every message. If you run `build` mid-session, the last few messages may not be in the file yet.

**Impact:** Low when using slash commands (`/project:handoff codex`), because the slash command asks Claude to write the packet from its *live* context window. Impact is higher when using `agenthandoff build` as a standalone CLI call without the slash command.

**Workaround:** Always prefer `/project:handoff <target>` inside Claude Code over `agenthandoff build` from the terminal. The slash command bypasses the JSONL entirely.

---

### Gap 3 — Session capture is Claude Code only

`src/capture/` has a deep JSONL parser for Claude Code. For Cursor, Windsurf, Codex, and Gemini the only Tier 1 sources are instruction files (`.cursorrules`, `AGENTS.md`, etc.) and git state. There is no equivalent session history reader for those agents.

**Impact:** Handoffs *from* Cursor/Codex/Windsurf contain less context than handoffs *from* Claude Code. The slash command mitigates this (any agent with a slash command can self-report its context), but agents that don't reliably invoke slash commands will produce thin packets.

**Workaround:** Use `agenthandoff add` to manually enrich the packet after `build`:

```bash
agenthandoff build --from cursor --to claude-code
agenthandoff add --decision "Changed auth strategy from sessions to JWTs"
agenthandoff add --warning  "Prisma migration pending — do not run prod deploy yet"
```

---

### Gap 4 — MCP server must be configured before first use

The MCP server does not start automatically when you install agenthandoff. First-time users must run `agenthandoff setup` (or `agenthandoff mcp config --for <agent>`) to write the correct agent-specific MCP config. Once that config exists, the agent launches `agenthandoff mcp start` automatically at startup.

**Impact:** Confusing for first-time users who expect MCP to work immediately after `npm install -g agenthandoff`.

**Resolution:** See the [MCP Setup](#mcp-setup) section for per-agent setup instructions. If an agent is not launching the server, re-run `agenthandoff mcp config --for <agent>` and restart the agent.

---

## Testing Guide

### Prerequisites

```bash
# Build from source
git clone https://github.com/your-org/agenthandoff
cd agenthandoff
npm install
npm run build
npm link        # makes `agenthandoff` available globally

# Verify
agenthandoff --version   # should print the installed version
```

---

### Unit Tests

```bash
npm test              # run all tests once
npm run test:watch    # re-run on file change
```

**What is covered:**

| Test file | What it tests |
|-----------|---------------|
| `src/__tests__/schema.test.ts` | Zod schema validation — valid + invalid packets |
| `src/__tests__/redact.test.ts` | Secret redaction — AWS keys, GitHub tokens, API keys, PEM blocks |
| `src/__tests__/search.test.ts` | Semantic search — `get_context_for_task` ranking |
| `src/__tests__/instruction-files.test.ts` | Instruction file capture — CLAUDE.md, AGENTS.md parsing |

**Run a single test file:**

```bash
npx vitest run src/__tests__/redact.test.ts
```

---

### Manual Testing — Way 1 (New session with injected context)

This tests the full CLI pipeline: build → preview → inject → receive.

**Step 1 — Simulate a Claude Code session with manual notes**

```bash
# Create a test project directory
mkdir /tmp/test-project && cd /tmp/test-project
git init && echo "# Test" > README.md && git add . && git commit -m "init"

# Add some context as if Claude Code worked here
agenthandoff add --decision "Using ESM modules — never use require()"
agenthandoff add --warning  "Do not run migrations without a DB backup"
agenthandoff add --note     "Halfway through implementing JWT auth refresh"
agenthandoff add --failed   "Tried Redis for token blacklist — 180ms P99 latency"
```

**Step 2 — Build the packet**

```bash
agenthandoff build --from claude-code --to codex
# Expected: "✓ Handoff packet built"
# Sources: manual-notes (JSONL may be empty in test env)
```

**Step 3 — Preview the packet**

```bash
agenthandoff preview
# Should print structured markdown with task_state, decisions, warnings, failed_attempts
```

**Step 4 — Check the status**

```bash
agenthandoff status
# Should show item counts and review_status: draft
```

**Step 5 — Approve and inject**

```bash
agenthandoff approve
agenthandoff inject --to codex
# Expected: "Handoff context written to: .agenthandoff/codex-handoff.md"
# Expected: instruction printed — "codex "Read .agenthandoff/codex-handoff.md first...""
```

**Step 6 — Verify the output file**

```bash
cat .agenthandoff/codex-handoff.md
# Should contain: task state, decisions, warnings, failed attempts
```

**Step 7 — Test inline mode**

```bash
agenthandoff inline
# Should print a ~68-token compressed block like:
# [HANDOFF claude-code→codex | 2026-03-29]
# warn: Do not run migrations without a DB backup
# failed: Tried Redis for token blacklist — 180ms P99 latency
# [/HANDOFF]
```

**Step 8 — Test other targets**

```bash
agenthandoff inject --to gemini
cat .agenthandoff/gemini-handoff.md

agenthandoff inject --to cursor
cat .cursor/rules/agenthandoff.mdc   # Cursor writes here
```

---

### Manual Testing — Way 2 (Mid-session MCP pull)

This tests the MCP server: start → push context → query from another terminal.

**Step 1 — Start the MCP server in the background**

```bash
cd /tmp/test-project
agenthandoff mcp start &
# Server should start silently (stdio transport — no port output is correct)
```

**Step 2 — Test MCP tools using the MCP inspector (recommended)**

Install the official MCP inspector:

```bash
npx @modelcontextprotocol/inspector agenthandoff mcp start
# Opens a browser UI at http://localhost:5173
# You can call each tool and see the response
```

Tools to test in the inspector:

| Tool | Expected response |
|------|-------------------|
| `get_summary` | Item counts + source agent + goal |
| `get_task_state` | Goal, current_step, next_action |
| `get_decisions` | List of decisions with rationale |
| `get_warnings` | List of warnings |
| `get_related_files` | Modified + session-edited files |
| `get_current_handoff` | Full packet as markdown |
| `get_context_for_task` | Pass `task: "auth refresh"` → ranked results |

**Step 3 — Test live push tools**

In the MCP inspector, call:

```json
push_decision({
  "statement": "Using short-lived JWTs, not sessions",
  "reason": "Stateless — no server-side session store needed",
  "files": ["src/auth/tokens.ts"]
})
```

Then call `get_decisions` — the new decision should appear immediately.

```json
set_task_state({
  "goal": "Implement JWT refresh endpoint",
  "current_step": "Stub done, need rotation logic",
  "next_action": "Implement rotateTokens() at src/auth/tokens.ts:45"
})
```

Then call `get_task_state` — should return the updated state.

**Step 4 — Test live reload**

Edit `.agenthandoff/current-handoff.json` directly (add a warning manually). Within 1 second, `get_warnings` should return the new warning — the server hot-reloads on file change.

---

### Manual Testing — `agenthandoff setup`

```bash
cd /tmp/test-project

# Dry-run first (no changes made):
agenthandoff setup --dry-run

# Full setup:
agenthandoff setup

# Verify MCP config was written:
cat .mcp.json                    # should contain agenthandoff mcpServers block
cat .cursor/mcp.json             # if Cursor detected
cat ~/.codex/config.toml         # if Codex detected
cat .vscode/mcp.json             # if Copilot detected

# Verify instruction files were updated:
cat CLAUDE.md                    # should contain AgentHandoff instructions block
cat AGENTS.md                    # same

# Test uninstall:
agenthandoff setup --uninstall
cat CLAUDE.md                    # AgentHandoff block should be removed
```

---

### Manual Testing — Secret Redaction

```bash
cd /tmp/test-project

agenthandoff add --decision "DB url is postgres://admin:s3cr3tP@ss@prod.db:5432/mydb"
agenthandoff add --warning  "API key is sk-ant-api03-FAKE000000000000000000000000000000000000000000"
agenthandoff build --from claude-code --to codex
agenthandoff preview

# Both entries above should show [REDACTED] — never the raw secret
```

---

### Manual Testing — `agenthandoff eval`

```bash
cd /tmp/test-project
agenthandoff build --from claude-code --to codex
agenthandoff eval

# Should print a 3-row token comparison:
# Cold start      ████████  ~11,800 tokens
# Manual summary  ██████    ~7,200 tokens
# AgentHandoff    ██        ~2,000 tokens (file inject)
# AgentHandoff    ░          ~68 tokens (inline)
```

---

### Manual Testing — `agenthandoff diff`

```bash
# Make a change and rebuild:
agenthandoff add --decision "Added rate limiting to /auth/refresh — 10 req/min"
agenthandoff build --from claude-code --to codex

agenthandoff diff
# Should show what changed between the previous and current packet
```

---

### End-to-End Test with Real Claude Code

This is the highest-fidelity test of the full system.

1. Open a real project in Claude Code
2. Work on something for a few minutes (edit files, ask Claude to make decisions)
3. Inside Claude Code, run: `/project:handoff codex`
4. Claude writes `.agenthandoff/current-handoff.json` and `.agenthandoff/current-handoff.md`
5. In a terminal: `agenthandoff preview` — verify the context is accurate
6. Start Codex: `codex "Read .agenthandoff/codex-handoff.md first, then tell me what the previous agent was working on."`
7. Codex should accurately describe the task, decisions, and warnings Claude established

**Verification checklist:**
- [ ] `task_state.goal` matches what you were working on
- [ ] `decisions` include choices Claude made (libraries, patterns, approaches)
- [ ] `warnings` include any "don't do X" statements made during the session
- [ ] `related_files` includes files that were actually edited
- [ ] No raw secrets appear in the packet

---

### Troubleshooting Tests

| Symptom | Command to diagnose |
|---------|---------------------|
| Packet not found | `agenthandoff status` |
| MCP server not responding | `npx @modelcontextprotocol/inspector agenthandoff mcp start` |
| JSONL not being read | `ls ~/.claude/projects/` — check if hash directory exists |
| Redaction not working | `npm test src/__tests__/redact.test.ts` |
| Schema validation error | `npm test src/__tests__/schema.test.ts` |

---

```
src/
├── cli/
│   ├── index.ts          # commander.js entry, all commands wired
│   ├── setup.ts          # one-time installer: detect + configure all agents
│   ├── init.ts           # install slash commands per agent
│   ├── build.ts          # agenthandoff build
│   ├── inline.ts         # agenthandoff inline — compressed paste block
│   ├── inject.ts         # agenthandoff inject — file fallback
│   ├── add.ts            # agenthandoff add
│   ├── approve.ts        # agenthandoff approve
│   ├── preview.ts        # agenthandoff preview
│   ├── status.ts         # agenthandoff status
│   ├── clean.ts          # agenthandoff clean
│   ├── eval.ts           # agenthandoff eval
│   ├── mcp.ts            # agenthandoff mcp start / config
│   └── config.ts         # agenthandoff config (LLM key)
│
├── capture/
│   ├── git.ts            # Tier 1: git status/diff/log
│   ├── instruction-files.ts  # Tier 1: CLAUDE.md, AGENTS.md, etc.
│   ├── claude-session.ts # Tier 1: ~/.claude JSONL deep parser
│   ├── cursor-rules.ts   # Tier 1: .cursor/rules/*.mdc
│   ├── aider-session.ts  # Tier 1: CONVENTIONS.md + chat history
│   └── task-files.ts     # Tier 1: .claude/todos.json
│
├── packet/
│   ├── schema.ts         # Zod schemas + TypeScript types
│   ├── builder.ts        # orchestrates all capture → packet
│   ├── compressor.ts     # optional LLM compression pipeline
│   ├── renderer.ts       # markdown rendering + terminal preview
│   └── inline-renderer.ts # ~68-token compressed block
│
├── inject/
│   ├── base.ts           # Injector interface
│   ├── claude-code.ts    # writes .agenthandoff/claude-handoff.md
│   ├── codex.ts          # writes .agenthandoff/codex-handoff.md
│   ├── cursor.ts         # writes .cursor/rules/agenthandoff.mdc
│   ├── aider.ts          # writes .aider.handoff.md
│   ├── copilot.ts        # writes .github/agenthandoff-context.md
│   ├── windsurf.ts       # writes .agenthandoff/windsurf-handoff.md
│   ├── gemini.ts         # writes .agenthandoff/gemini-handoff.md
│   ├── firebase-studio.ts # writes .agenthandoff/firebase-studio-handoff.md
│   ├── antigravity.ts    # writes .agenthandoff/antigravity-handoff.md
│   └── generic.ts        # writes .agenthandoff/injection.md
│
├── mcp/
│   ├── server.ts         # MCP server with 16 tools, stdio transport
│   ├── tools.ts          # tool handlers (read + write tools)
│   └── config-generator.ts  # writes .mcp.json, .cursor/mcp.json, ~/.codex/config.toml, .vscode/mcp.json, etc.
│
├── eval/
│   ├── token-counter.ts  # token estimation
│   ├── scenarios.ts      # cold-start simulation
│   └── report.ts         # 3-condition comparison + ASCII chart
│
├── security/
│   └── redact.ts         # credential scanning + redaction
│
├── utils/
│   ├── config.ts         # paths, project ID, audit log
│   └── llm.ts            # Anthropic + OpenAI client
│
└── adapters/
    └── template.ts       # community adapter template + checklist

.claude/
└── commands/
    └── handoff.md        # /project:handoff slash command

.codex/
└── commands/
    └── handoff.md        # /handoff slash command

.gemini/
└── commands/
    └── handoff.md        # /handoff slash command
```

### Source stability tiers

| Tier | Sources | Default |
|------|---------|---------|
| **Tier 1** | git, instruction files, session JSONL, cursor rules, aider history | Always |
| **Tier 2** | Extended session history | `--sessions` flag |
| **Tier 3** | Private app internals | Experimental plugins only |

### Token cost comparison

```
Cold start (no handoff)       ████████████████████  11.8k tokens  $0.035/switch
Manual summary (you write it) ████████████░░░░░░░░   7.2k tokens  $0.022/switch
AgentHandoff (file inject)    ████░░░░░░░░░░░░░░░░   2.0k tokens  $0.006/switch
AgentHandoff (inline)         █░░░░░░░░░░░░░░░░░░░     68 tokens  <$0.001/switch
AgentHandoff (MCP queries)    ░░░░░░░░░░░░░░░░░░░░  50–200 tokens <$0.001/switch
```

---

## License

MIT
