# Critique of `RESEARCH_AND_PLAN.md`

## Overall Assessment

The plan identifies a real pain point and a promising product wedge, but it is currently stronger as a narrative than as an executable plan. Its biggest weakness is that it jumps from market pain to a broad architecture without tightening the product boundary, validating the riskiest assumptions, or defining a trustworthy handoff model.

The opportunity is real. The current plan just needs to become sharper, narrower, and more falsifiable.

## What Is Strong Already

- The problem framing is intuitive and easy to recognize.
- The competitive landscape correctly spots a gap between static instructions and dynamic working context.
- The project has a crisp high-level positioning: cross-agent context continuity.
- The CLI-first framing is sensible for a developer tool.
- The plan already hints at the right primitives: capture, compress, store, inject.

## Highest-Priority Critiques

### 1. The plan treats the pain point as proven, but it is only plausibly validated

The research section is convincing, but the plan relies heavily on broad industry statements and directional token claims. That is not enough to justify what should be built first.

What is missing:

- A precise primary user: solo power user, AI-heavy indie hacker, staff engineer, or platform team.
- A precise triggering workflow: when exactly does handoff happen and why not just paste a summary manually?
- A baseline comparison against the current workaround: copy-pasted summaries, AGENTS.md edits, task files, chat export, or no handoff at all.
- A falsifiable success threshold for MVP: what level of improvement proves this is worth continuing?

Make it stronger:

- Define one ICP: `developers who switch between Claude Code and Codex on the same repo at least 3 times/day`.
- Define one core job: `resume useful work in the second agent within 60 seconds without re-explaining the project`.
- Add a small validation study before feature expansion: 5 users, 10 real handoffs, measure time-to-first-correct-action and token spend.

### 2. The MVP is still too wide

The stated MVP is Claude Code <-> Codex, which is good. But even Phase 1 still includes:

- CLI scaffolding
- 2 adapters
- compression
- SQLite
- 3 commands

That is already a full product slice. Then Phase 2 adds MCP immediately, which is premature.

Why this is risky:

- It creates too many moving parts before proving the handoff packet is actually useful.
- It mixes product validation with infrastructure ambition.
- It makes debugging harder because failures can come from capture, compression, storage, formatting, or injection.

Make it stronger:

- Redefine MVP as `manual, explicit, one-directional handoff from Claude Code to Codex`.
- Cut MCP from the initial proof.
- Cut multi-agent storage abstraction until one handoff path is trusted.
- Start with `capture -> review -> inject` only.

### 3. The plan assumes adapters can reliably read each agent's internal state

This is one of the biggest technical risks and it is underweighted. Reading private app data, undocumented SQLite stores, session directories, or editor internals is brittle and likely to break often across OSes and agent versions.

Examples of risky assumptions:

- Parsing Cursor internal SQLite state
- Parsing Windsurf or Codeium app data
- Reading session formats that may change without warning
- Inferring "Claude-authored commits" from git history

This is not just maintenance risk. It can kill trust if handoffs become inconsistent.

Make it stronger:

- Rank sources by stability:
  - Tier 1: explicit files the user controls (`AGENTS.md`, `CLAUDE.md`, git diff, git status, todo files, manual notes)
  - Tier 2: documented/exportable histories
  - Tier 3: private internal app databases
- For v1, only use Tier 1 and one carefully selected Tier 2 source.
- Treat internal-state adapters as experimental plugins, not core product assumptions.

### 4. The injection model is unsafe and conceptually muddy

Appending transient session context into durable instruction files like `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` is dangerous.

Why:

- Durable instruction files should contain stable policy, not noisy session residue.
- Repeated appends will create prompt drift and stale guidance.
- It creates unclear ownership: what came from the project vs what came from one session?
- It raises security and trust issues if sensitive context is permanently written into repo files.

Make it stronger:

- Separate `durable project instructions` from `ephemeral handoff context`.
- Use a dedicated generated artifact such as `.agenthandoff/current-handoff.md`.
- Inject by reference where possible, not by mutating core instruction files.
- Every injected context block should carry provenance, timestamp, and confidence.

### 5. The context model is not rigorous enough yet

The current categories are directionally right, but the model is too coarse to support trust, conflict handling, and future automation.

What is missing:

- Provenance: where each context item came from
- Evidence strength: inferred vs explicit vs user-confirmed
- Scope: repository-wide, task-local, file-local, or session-local
- Freshness: when it was last validated
- Conflict semantics: replace, merge, or keep both

Make it stronger:

- Introduce a formal handoff packet schema with fields like:
  - `type`
  - `statement`
  - `source`
  - `evidence`
  - `confidence`
  - `scope`
  - `last_verified_at`
  - `related_files`
- Split context into:
  - facts
  - decisions
  - active task state
  - warnings
  - failed attempts
  - open questions

### 6. The plan underestimates privacy and security concerns

The privacy section is too light for a tool that may read chat logs, codebase context, git history, and local agent state.

What is missing:

- Redaction rules for secrets, credentials, tokens, customer data, and proprietary snippets
- Project isolation guarantees so context from repo A never leaks into repo B
- Local-only mode as a first-class workflow, not a footnote
- Auditability: what was captured, what was compressed, what was injected

Make it stronger:

- Make `preview before inject` mandatory in v1.
- Add redaction passes before compression.
- Store project-scoped data under a deterministic per-repo namespace.
- Log every capture/inject event with a local audit trail.

### 7. The roadmap lacks explicit verification gates

The phases are understandable, but they are feature lists, not decision gates. A stronger plan needs kill criteria and advancement criteria.

Example of what is missing:

- How do you know the MVP is good enough to justify MCP?
- What failure rate is acceptable for extraction?
- What benchmark proves injected context helps more than a manual summary?

Make it stronger:

- Add phase exit criteria.
- Require measured success before unlocking the next phase.
- Add explicit "stop if false" conditions.

### 8. MCP is likely a phase-too-early abstraction

MCP may eventually be the right interoperability layer, but the current plan elevates it too quickly. The product's first question is not "can agents query this via MCP?" It is "does a trustworthy handoff packet materially improve the next agent's output?"

Make it stronger:

- Treat MCP as a delivery mechanism, not the product core.
- Prove the packet first.
- Add MCP only after the packet format, review flow, and injection strategy are stable.

### 9. The token savings section is too confident for pre-build math

The directional point is fair, but the exact savings table reads like output metrics before the system exists.

Make it stronger:

- Reframe current numbers as hypotheses.
- Add a benchmark plan:
  - 10 repos
  - 3 handoff tasks each
  - no handoff vs manual summary vs AgentHandoff
- Measure:
  - tokens consumed
  - time-to-first-correct-action
  - number of redundant file reads
  - subjective trust score

### 10. The differentiation is good, but the moat is not yet clear

"Shared memory across agents" is a compelling concept, but it is not yet a durable moat. Vendors may add partial versions natively.

Make it stronger:

- Define the moat around:
  - cross-vendor interoperability
  - high-trust provenance and reviewability
  - explicit handoff packet standard
  - community-maintained adapters
- Consider making the handoff packet a spec others can adopt.

## Recommended Reframe

The strongest version of this project is not:

`a universal system that reads every agent's internal state and writes context back everywhere`

The strongest version is:

`a trusted, reviewable handoff packet system that helps one agent resume work from another with minimal re-discovery`

That reframe does three important things:

- narrows the first product
- improves reliability
- creates a format that can later power MCP, adapters, and ecosystem adoption

## Stronger MVP Definition

### v1 Goal

Enable a developer to move from Claude Code to Codex on the same repository using a generated handoff packet that is:

- explicit
- reviewable
- project-scoped
- safe to inject

### v1 Inputs

- git status
- git diff summary
- selected project instruction files
- optional user note
- optional stable Claude session summary source

### v1 Outputs

- `.agenthandoff/current-handoff.md`
- `.agenthandoff/current-handoff.json`
- a short injection-ready summary for Codex

### v1 Non-Goals

- support for 5+ agents
- undocumented editor internals
- autonomous background capture
- conflict resolution across many agents
- automatic writes into durable instruction files
- MCP server

## Stronger Architecture Direction

### Core Primitive: Handoff Packet

Before adapters and MCP, define a packet:

```json
{
  "project_id": "repo-hash",
  "created_at": "ISO-8601",
  "source_agent": "claude-code",
  "target_agent": "codex",
  "task_state": {
    "goal": "",
    "current_step": "",
    "blocked_on": "",
    "next_action": ""
  },
  "facts": [],
  "decisions": [],
  "warnings": [],
  "failed_attempts": [],
  "related_files": [],
  "provenance": [],
  "review_status": "draft|approved"
}
```

This should be the product center of gravity.

### Storage

SQLite is reasonable later, but for the first slice, file-based artifacts may be enough:

- easier to inspect
- easier to debug
- easier to diff
- lower implementation overhead

Recommendation:

- start with file-backed packets
- introduce SQLite only when multi-session querying becomes necessary

## Revised Roadmap With Gates

### Phase 0: Validation and Constraints

Deliverables:

- 5 user interviews or workflow observations
- 10 sample handoffs collected manually
- source stability ranking for each planned adapter
- redaction/privacy policy for local capture

Exit criteria:

- one ICP chosen
- one handoff workflow chosen
- one success threshold defined

### Phase 1: Packet and Review Flow

Deliverables:

- handoff packet schema
- packet generator from git + manual notes + stable files
- review command: `agenthandoff preview`
- export command: `agenthandoff build --from claude-code --to codex`

Exit criteria:

- user can inspect packet before injection
- packet is understandable without reading raw source logs
- repeated builds on same state are deterministic enough

### Phase 2: Claude Code -> Codex Injection

Deliverables:

- Codex formatter
- one safe injection path that does not pollute durable repo instructions
- rollback/remove command

Exit criteria:

- 80% of test handoffs produce a useful resume point
- no permanent repo-file pollution by default
- injection provenance is visible

### Phase 3: Evaluation Harness

Deliverables:

- benchmark repos and tasks
- no-handoff vs manual-summary vs packet comparison
- metrics report

Exit criteria:

- measurable improvement over manual summary in at least one key metric
- no severe trust failures

### Phase 4: Optional MCP Exposure

Deliverables:

- read-only MCP tools over approved packet data
- `get_current_handoff`
- `get_decisions`
- `get_task_state`

Exit criteria:

- packet format already stable
- MCP adds adoption value rather than masking product uncertainty

### Phase 5: Adapter Expansion

Deliverables:

- add adapters only in descending order of source stability and user demand

Exit criteria:

- each adapter has a maintenance story
- each adapter passes a compatibility test matrix

## Specific Edits the Original Plan Should Make

### Replace broad claims with hypotheses

Change language such as:

- "60-80% token reduction"
- "5-15 min warm-up eliminated"
- "high impact"

Into:

- "We hypothesize"
- "We will measure"
- "We will continue only if"

### Add a non-goals section

Without non-goals, the current plan invites premature platform expansion.

### Add trust and safety as first-class product requirements

The plan should explicitly state:

- no silent capture from unstable/private sources by default
- no permanent mutation of core instruction files by default
- no remote compression without explicit user choice

### Add provenance everywhere

Every context item should answer:

- who said this
- where it came from
- when it was captured
- whether it was verified

## Questions the Plan Must Answer Before Build Starts

1. What exact workflow is so painful that manual summaries are insufficient?
2. Which single agent pair is the wedge, and why?
3. What sources are stable enough for reliable extraction?
4. Should the product optimize for trust first or automation first?
5. What is the review UX before context is injected?
6. What is the rollback story if bad context is injected?
7. How will you prove improvement over a hand-written handoff note?

## Bottom Line

This project is promising, but the current plan is trying to win too much too early. The right move is to narrow the product to a trusted handoff packet for one agent pair, prove that it materially improves resume quality, and only then expand into MCP, many adapters, and richer memory infrastructure.

If you make that shift, the plan becomes much more credible technically, much safer operationally, and much stronger as a real product roadmap.
