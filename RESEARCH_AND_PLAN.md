# Agent Handoff — Deep Research, Analysis & Implementation Plan

> **v2** — Revised after critical review. Narrowed scope, added verification gates, separated ephemeral handoff context from durable instructions, and reframed metrics as hypotheses.

---

## 1. THE PAIN POINT

### The Problem
You're building with Claude Code. You have rich context built up over multiple chats — decisions, architecture understanding, file relationships, debugging history. When you switch to Codex for a specific task, that agent starts from scratch. It re-reads files, re-discovers the project, misses nuances that Claude already learned.

### Is This Actually a Pain Point? — Evidence Says Yes

1. **The New Stack (Jan 2026)** called context "AI coding's real bottleneck in 2026" — the gap between what engineers know and what AI can understand is the #1 factor determining productivity gains.
2. **A single one-line edit can consume 21,000+ input tokens** just for context loading (BSWEN, Mar 2026).
3. **Most engineers juggle 2-4 AI coding tools simultaneously** in 2026 (Faros AI report).
4. **Context editing reduced token consumption by 84%** in long workflows — proving the waste is real and recoverable.
5. **ETH Zurich (Feb 2026)** found verbose context files *hurt* performance — what matters is precise, non-inferable context.
6. **Developer focus degrades**: With agents, developers shift from ~4 deep 45-min focus blocks to ~7 shallow 18-min blocks. Cross-agent switching makes this worse.

### Ideal Customer Profile (ICP)

**Solo developers or small teams who switch between Claude Code and Codex (or similar CLI agents) on the same repo at least 2-3 times per day.**

They switch because:
- Different agents have different strengths (Claude for reasoning, Codex for speed, Copilot for completions)
- Context window exhaustion forces a fresh start
- Cost management (cheaper agent for simple tasks)
- Recovery from hallucination/stuck states

### Core Job To Be Done

> **Resume useful work in the second agent within 60 seconds, without re-explaining the project or losing decisions made in the first agent.**

### Why Manual Summaries Are Insufficient

- Developers don't reliably summarize their own sessions (cognitive load)
- Manual summaries miss implicit context (file relationships, failed approaches, conventions discovered)
- They don't transfer structured state (current task, blocked-on, next steps)
- They degrade with fatigue — the 5th handoff summary of the day is worse than the 1st

---

## 2. COMPETITIVE LANDSCAPE

| Project | What It Does | Gap It Leaves |
|---------|-------------|---------------|
| **Roundtable** (askbudi/roundtable) | MCP server that delegates tasks to multiple agents | *Delegation*, not context continuity |
| **BridgeMCP** (BridgeMind) | Shared tasks/knowledge across agents via MCP | Paid platform; task management, not session context |
| **CLI Agent Orchestrator** (AWS Labs) | Hierarchical multi-agent system using tmux + MCP | Orchestration, not context portability |
| **Letta Code** | Memory-first coding agent, model-agnostic | *Replaces* your agents instead of bridging them |
| **ACS (.agents/ folder)** | Unified standard for project instructions | Static instructions only — not session context |
| **Context Hub** (Andrew Ng) | CLI for up-to-date API docs | Documentation freshness, not project-specific context |
| **add-mcp** (Neon) | One-command MCP server install across agents | MCP configuration, not context sharing |

### The Gap Nobody Fills

**Transferring *dynamic, accumulated session context* — decisions made, bugs found, failed approaches, current task state — between agents.**

Static instructions (ACS, AGENTS.md) tell an agent what to always know. Orchestrators (Roundtable, CAO) tell agents what to do. **Nobody tells the next agent what the previous agent already figured out.**

---

## 3. WHAT WE'RE BUILDING

### Product: **AgentHandoff** — A Trusted Handoff Packet System

**Not** a universal system that reads every agent's internal state and writes context back everywhere.

**Instead**: A trusted, reviewable handoff packet system that helps one agent resume work from another with minimal re-discovery.

### The Core Primitive: The Handoff Packet

Everything centers on a single artifact — the **handoff packet**. It is:
- **Explicit** — generated from stable, user-controlled sources
- **Reviewable** — human-inspectable before injection
- **Project-scoped** — isolated per repository
- **Safe to inject** — never mutates durable instruction files by default

```json
{
  "schema_version": "1.0",
  "project_id": "sha256-of-repo-root",
  "created_at": "2026-03-15T10:30:00Z",
  "source_agent": "claude-code",
  "target_agent": "codex",

  "task_state": {
    "goal": "Add OAuth2 login flow",
    "current_step": "Token refresh endpoint implemented, needs testing",
    "blocked_on": "Redis connection pooling config unclear",
    "next_action": "Write integration tests for /auth/refresh"
  },

  "decisions": [
    {
      "statement": "Using JWT with refresh tokens, not session cookies",
      "reason": "SPA frontend can't use httpOnly cookies cross-origin",
      "related_files": ["src/auth/jwt.ts", "src/middleware/auth.ts"],
      "confidence": 0.95
    }
  ],

  "facts": [
    {
      "statement": "Repository pattern: services call repositories, never the DB directly",
      "source": "discovered from existing code in src/services/",
      "related_files": ["src/services/", "src/repositories/"]
    }
  ],

  "warnings": [
    {
      "statement": "Changes to schema.prisma require running `npx prisma generate`",
      "source": "CLAUDE.md"
    }
  ],

  "failed_attempts": [
    {
      "what": "Tried streaming API for batch token validation",
      "why_failed": "Times out after 30s with >100 tokens",
      "recommendation": "Use batch endpoint instead"
    }
  ],

  "related_files": [
    "src/auth/jwt.ts",
    "src/auth/refresh.ts",
    "src/middleware/auth.ts",
    "prisma/schema.prisma"
  ],

  "open_questions": [
    "Should refresh tokens be stored in Redis or Postgres?"
  ],

  "provenance": {
    "capture_method": "git-diff + claude-md + manual-notes",
    "sources_used": ["git status", "git diff", "CLAUDE.md", "user note"],
    "llm_used_for_compression": "claude-haiku-4-5",
    "review_status": "draft"
  }
}
```

### CLI Commands

```bash
# Build a handoff packet (capture + compress)
agenthandoff build --from claude-code --to codex

# Preview before injecting (MANDATORY in v1)
agenthandoff preview

# Inject into target agent's context
agenthandoff inject --to codex

# Add manual context to the packet
agenthandoff add "Redis connection pool should be max 10 connections"

# View current handoff state
agenthandoff status

# Remove injected context (rollback)
agenthandoff clean
```

### What Goes Where

| File | Purpose | Managed By |
|------|---------|-----------|
| `.agenthandoff/current-handoff.json` | Structured packet (machine-readable) | AgentHandoff |
| `.agenthandoff/current-handoff.md` | Human-readable summary | AgentHandoff |
| `.agenthandoff/injection.md` | What was injected into the target agent | AgentHandoff |
| `.agenthandoff/audit.log` | Every capture/inject event | AgentHandoff |
| `CLAUDE.md`, `AGENTS.md`, etc. | **Never mutated by default** | User/Agent |

**Key design choice**: We write to our own `.agenthandoff/` directory. We do NOT append to `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or other durable instruction files. The injection is either:
1. A **separate file** that the target agent reads (e.g., `.agenthandoff/injection.md` referenced from the agent's config)
2. Served via **MCP tools** (later phase)

---

## 4. SOURCE STABILITY TIERS

Not all context sources are equally reliable. We rank them and only use Tier 1 in v1.

### Tier 1: Stable, User-Controlled (v1)
- `CLAUDE.md`, `AGENTS.md`, `CONVENTIONS.md`, `.cursorrules`, `.windsurfrules` — explicit instruction files
- `git status`, `git diff`, `git log --oneline -20` — always available, stable format
- `.claude/todos.json` — documented, stable format
- User-provided manual notes — highest trust

### Tier 2: Documented, Exportable (v2)
- `.aider.chat.history.md` — documented, append-only log
- Claude Code session JSONL (`~/.claude/projects/<hash>/`) — semi-documented
- `~/.claude/projects/<hash>/memory/` — auto-memory files, markdown

### Tier 3: Private, Unstable (experimental plugins only)
- Cursor internal SQLite state
- Windsurf/Codeium app data
- VS Code extension globalState
- Codex internal session data

**v1 uses only Tier 1 sources.** This means extraction is reliable, deterministic, and won't break across agent updates.

---

## 5. TECHNICAL ARCHITECTURE

### Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **CLI** | TypeScript + Node.js | Runs everywhere, npm-installable |
| **Packet format** | JSON + Markdown | Machine-readable + human-readable |
| **Storage** | File-based (`.agenthandoff/`) | Easy to inspect, diff, and debug. No DB for v1 |
| **LLM compression** | User's API key (optional) | Summarize git diffs. Falls back to rule-based extraction |
| **Git integration** | Simple shell calls | `git status`, `git diff`, `git log` |

### Project Structure

```
agenthandoff/
├── src/
│   ├── cli/
│   │   ├── index.ts            # CLI entry (commander.js)
│   │   ├── build.ts            # Build handoff packet
│   │   ├── preview.ts          # Preview packet before injection
│   │   ├── inject.ts           # Inject into target agent
│   │   ├── add.ts              # Manual context addition
│   │   ├── status.ts           # View current state
│   │   └── clean.ts            # Remove injected context
│   │
│   ├── capture/                # Source readers (Tier 1 only in v1)
│   │   ├── git.ts              # git status, diff, log
│   │   ├── instruction-files.ts # CLAUDE.md, AGENTS.md, etc.
│   │   ├── task-files.ts       # .claude/todos.json, etc.
│   │   └── manual.ts           # User-provided notes
│   │
│   ├── packet/                 # Handoff packet engine
│   │   ├── schema.ts           # Packet type definitions
│   │   ├── builder.ts          # Assemble packet from sources
│   │   ├── compressor.ts       # LLM or rule-based compression
│   │   ├── renderer.ts         # Render packet as markdown
│   │   └── validator.ts        # Validate packet integrity
│   │
│   ├── inject/                 # Target agent writers
│   │   ├── base.ts             # Injection interface
│   │   ├── codex.ts            # Write .agenthandoff/injection.md for Codex
│   │   ├── claude-code.ts      # Write for Claude Code
│   │   └── generic.ts          # Generic markdown injection
│   │
│   ├── security/
│   │   ├── redact.ts           # Redact secrets, credentials, tokens
│   │   └── audit.ts            # Local audit trail logging
│   │
│   └── utils/
│       ├── config.ts           # Configuration
│       └── llm.ts              # LLM client (multi-provider, optional)
│
├── package.json
├── tsconfig.json
└── README.md
```

### Context Compression (Two Modes)

**Mode 1: Rule-Based (no LLM needed, default)**
```
git diff → extract changed files, additions, deletions
git log → extract recent commit messages
CLAUDE.md → extract decisions, conventions
.claude/todos.json → extract task state
Manual notes → include verbatim
↓
Template-based packet assembly
```

**Mode 2: LLM-Enhanced (optional, user provides API key)**
```
All Tier 1 sources → concatenate
↓
LLM prompt: "Extract from this context:
  - key decisions and their rationale
  - current task state (goal, progress, blockers, next steps)
  - conventions or patterns discovered
  - failed approaches and why they failed
  - open questions
  Be extremely concise. Max 1000 tokens."
↓
Structured packet with richer summarization
```

### Injection Strategy (Safe by Default)

Instead of appending to `AGENTS.md` or `CLAUDE.md`, we:

1. Write `.agenthandoff/injection.md` — a standalone handoff summary
2. Tell the user to reference it from their agent:
   - For Codex: add `See .agenthandoff/injection.md for handoff context` to AGENTS.md
   - For Claude Code: the file is auto-discovered if mentioned in CLAUDE.md
   - For Cursor: create `.cursor/rules/agenthandoff.mdc` pointing to the file
3. Later (MCP phase): serve it via MCP tools — zero file mutation needed

### Redaction & Privacy

Before any compression or storage:
- Scan for patterns: API keys, tokens, passwords, connection strings, `.env` values
- Redact with `[REDACTED:<type>]` markers
- Never send redacted content to remote LLMs
- All data stays local (project-scoped under `.agenthandoff/`)
- Local-only LLM option (Ollama) for compression
- Every capture/inject event logged to `.agenthandoff/audit.log`

---

## 6. IMPLEMENTATION ROADMAP (With Gates)

### Phase 0: Validation (Week 1)

**Goal**: Confirm the packet concept works before building anything.

Deliverables:
- [ ] Collect 10 real handoff scenarios manually (switch Claude Code → Codex, record what context was needed)
- [ ] Write 3 sample handoff packets by hand
- [ ] Test: give the handoff packet to Codex, measure if it resumes faster than cold start
- [ ] Define success threshold

**Exit criteria (must pass to continue):**
- Handoff packet measurably reduces time-to-first-correct-action vs cold start
- At least 3/5 test scenarios show improvement
- The packet format captures what the target agent actually needs

**Stop condition**: If hand-written packets don't help, the problem may not be solvable with static context transfer. Pivot to MCP-only approach or abandon.

---

### Phase 1: Packet Engine + CLI (Week 2-3)

**Goal**: `agenthandoff build` produces a trustworthy packet from Tier 1 sources.

Deliverables:
- [ ] CLI scaffolding (commander.js, TypeScript, npm package)
- [ ] Handoff packet JSON schema + TypeScript types
- [ ] Tier 1 source readers (git, instruction files, task files, manual notes)
- [ ] Rule-based packet builder (no LLM required)
- [ ] `agenthandoff build --from claude-code --to codex`
- [ ] `agenthandoff preview` (mandatory review step)
- [ ] `agenthandoff status`
- [ ] Redaction pass before storage
- [ ] Audit logging

**Exit criteria:**
- Packet builds deterministically from the same repo state
- Preview output is understandable without reading raw source data
- No secrets leak through the packet
- User can inspect and edit packet before injection

---

### Phase 2: Injection + Rollback (Week 4)

**Goal**: One safe, non-destructive injection path from Claude Code → Codex.

Deliverables:
- [ ] Codex injection formatter (writes `.agenthandoff/injection.md`)
- [ ] `agenthandoff inject --to codex`
- [ ] `agenthandoff clean` (removes injected artifacts)
- [ ] Injection provenance visible in the generated file (timestamp, source, review status)
- [ ] Claude Code injection formatter (reverse direction)

**Exit criteria:**
- 80% of test handoffs produce a useful resume point in the target agent
- No durable repo files modified by default
- `clean` fully rolls back injection artifacts
- Injected context has visible provenance

---

### Phase 3: LLM Compression + Evaluation (Week 5-6)

**Goal**: Prove the system works better than manual summaries.

Deliverables:
- [ ] Optional LLM compression mode (user provides API key)
- [ ] Ollama support for local-only compression
- [ ] Evaluation harness:
  - 10 repos, 3 handoff tasks each
  - Compare: no handoff vs manual summary vs AgentHandoff packet
  - Measure: tokens consumed, time-to-first-correct-action, redundant file reads

**Exit criteria:**
- Measurable improvement over manual summary in at least one key metric
- LLM compression doesn't lose critical context (validated by review)
- No severe trust failures in evaluation

**Stop condition**: If AgentHandoff packets don't outperform a hand-written summary, simplify to a template generator rather than a full extraction system.

---

### Phase 4: MCP Server (Week 7-8)

**Goal**: Expose packet data via MCP so any compatible agent can query context on demand.

**Prerequisite**: Packet format is stable from Phase 1-3.

Deliverables:
- [ ] MCP server exposing tools (not resources — tools have universal support):
  - `get_current_handoff` — returns the full packet
  - `get_decisions` — returns decisions only
  - `get_task_state` — returns current task state
  - `get_warnings` — returns warnings and failed attempts
- [ ] MCP config generator (auto-writes config for Claude Code, Cursor, Codex)
- [ ] Read-only by default (agents query, don't write)

**Exit criteria:**
- MCP adds adoption value rather than masking product uncertainty
- At least 2 agents successfully consume context via MCP
- Packet format hasn't needed breaking changes in 2+ weeks

---

### Phase 5: Adapter Expansion (Week 9-10)

**Goal**: Support top 5 agent pairs. Add adapters in descending order of source stability and user demand.

Deliverables:
- [ ] Cursor adapter (read .cursor/rules/, inject .cursor/rules/agenthandoff.mdc)
- [ ] Aider adapter (read CONVENTIONS.md, .aider.chat.history.md)
- [ ] Copilot adapter (read .github/copilot-instructions.md)
- [ ] Community adapter template + documentation
- [ ] Tier 2 source readers (Claude session JSONL, Aider chat log)

**Exit criteria:**
- Each adapter has a maintenance story (what breaks when the agent updates)
- Each adapter passes a compatibility test matrix
- Community can contribute new adapters using the template

---

## 7. MCP ADOPTION MATRIX

70+ clients support MCP as of 2026. Key agents and feature support:

| Agent | Resources | Tools | Prompts | Elicitation |
|-------|-----------|-------|---------|-------------|
| **Claude Code** | Yes | Yes | Yes | Yes |
| **ChatGPT** | - | Yes | - | - |
| **Cursor** | - | Yes | Yes | Yes |
| **VS Code Copilot** | - | Yes | - | - |
| **Codex (OpenAI)** | Yes | Yes | - | Yes |
| **Gemini CLI** | - | Yes | Yes | - |
| **Amazon Q CLI** | - | Yes | Yes | - |
| **Cline** | Yes | Yes | - | - |
| **Windsurf** | - | Yes | - | - |
| **goose (Block)** | Yes | Yes | Yes | Yes |

**Design implication**: Since Cursor and Copilot only support MCP **Tools** (not Resources), our MCP server exposes everything via Tools. Tools have universal support.

### Protocol Landscape

| Protocol | Purpose | Solves Our Problem? |
|----------|---------|-------------------|
| **MCP** (Anthropic) | Agent ↔ Tool/Data | **Yes** — as a context-serving layer (Phase 4) |
| **A2A** (Google) | Agent ↔ Agent delegation | No — enterprise workflow focus |
| **OpenAI Handoffs** | Intra-SDK agent transfer | No — OpenAI ecosystem only |
| **ACS** (Community) | Unified project instructions | Partial — static only, complementary |

---

## 8. TOKEN COST HYPOTHESES

> **These are hypotheses to be validated in Phase 3, not proven savings.**

### Hypothesis: Discovery Phase Cost Per Agent Switch (Without AgentHandoff)

| Activity | Estimated Tokens |
|----------|-----------------|
| File tree exploration | 500-2,000 |
| Config file reading | 1,000-5,000 |
| Architecture understanding | 5,000-20,000 |
| Relevant source files | 10,000-50,000 |
| Recent changes (git) | 2,000-10,000 |
| **Total per switch** | **20,000-80,000** |

### Hypothesis: With AgentHandoff Packet

| Activity | Estimated Tokens |
|----------|-----------------|
| Handoff packet | 1,000-3,000 |
| Targeted file reads (guided by packet) | 5,000-15,000 |
| **Total per switch** | **6,000-18,000** |

### Validation Plan (Phase 3)

- 10 repos, 3 handoff tasks each
- Three conditions: no handoff / manual summary / AgentHandoff packet
- Metrics:
  - Tokens consumed by target agent
  - Time-to-first-correct-action
  - Number of redundant file reads
  - Subjective trust score (1-5)
- **Continue only if**: AgentHandoff packet outperforms manual summary in at least one key metric

---

## 9. RISKS & MITIGATIONS

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Agent session formats change | High | v1 uses only Tier 1 (stable) sources. Tier 3 is experimental plugins |
| LLM compression loses important context | Medium | Rule-based mode as default. LLM is optional. Preview is mandatory |
| Privacy: sensitive data in packets | Medium | Redaction pass before storage. Local-only LLM option. Audit trail |
| Manual summaries are "good enough" | Medium | Phase 3 evaluation will measure. Stop condition defined |
| Agents solve this natively | Medium | Cross-agent is hard for single vendors. Open-source community moat |
| Packet format needs breaking changes | Medium | File-based storage is easy to migrate. Schema versioning from day 1 |
| Injection pollutes repo state | Low | `.agenthandoff/` is isolated. `clean` command rolls back. `.gitignore`-able |

---

## 10. NON-GOALS (v1)

- Support for 5+ agents (we start with Claude Code ↔ Codex)
- Reading undocumented editor internals (Tier 3 sources)
- Autonomous background capture (hooks/watchers)
- Conflict resolution across many agents
- Automatic writes into durable instruction files (CLAUDE.md, AGENTS.md)
- MCP server (deferred to Phase 4 after packet format is proven)
- Real-time sync between agents
- Team/multi-user context sharing
- Cloud storage or remote servers

---

## 11. DIFFERENTIATION & MOAT

| Solution | What It Does | How We're Different |
|----------|-------------|-------------------|
| ACS / AGENTS.md | Static project instructions | **Dynamic session context** — what happened in THIS session |
| Roundtable | Orchestrates which agent to do what | **Transfers context** between agents the dev already chose |
| BridgeMCP | Shared task board | **Shared mental model** — decisions, discoveries, failed approaches |
| Letta Code | Memory-first replacement agent | **Works WITH existing agents** — doesn't replace them |
| Context Hub | Fresh API docs | **Project-specific context** — not generic docs |

### The Moat

1. **Cross-vendor interoperability** — single vendors won't solve this for competitors
2. **Trusted, reviewable packets** — provenance and auditability as first-class features
3. **Handoff Packet as an open spec** — others can adopt the format
4. **Community-maintained adapters** — network effect as more agents are supported

### The Value Proposition

> **"Switch agents. Keep the context. Trust what's transferred."**

---

## 12. QUESTIONS TO ANSWER BEFORE BUILD

1. ~~What exact workflow is so painful that manual summaries are insufficient?~~ → Answered in Section 1 (ICP + JTBD)
2. ~~Which single agent pair is the wedge?~~ → Claude Code ↔ Codex (most popular CLI agents)
3. ~~What sources are stable enough?~~ → Answered in Section 4 (Tier 1 only for v1)
4. **Should we optimize for trust first or automation first?** → Trust first. Preview is mandatory.
5. **What is the review UX before injection?** → `agenthandoff preview` renders packet as formatted terminal output
6. **What is the rollback story?** → `agenthandoff clean` removes all `.agenthandoff/` injection artifacts
7. **How will we prove improvement?** → Phase 3 evaluation harness with explicit metrics and stop conditions

---

## 13. SUCCESS METRICS

### Phase 1 (Packet)
- Packet builds deterministically
- Preview is understandable without raw sources
- No secret leakage

### Phase 2 (Injection)
- 80% of test handoffs produce useful resume point
- Clean rollback works perfectly

### Phase 3 (Evaluation)
- Outperforms manual summary on at least one metric
- No severe trust failures

### Phase 4 (MCP)
- 2+ agents consume context via MCP successfully

### Long-term
- GitHub stars / npm downloads
- Community adapter contributions
- Adoption of the handoff packet spec by other tools
