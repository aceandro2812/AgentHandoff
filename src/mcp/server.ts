import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync, readFileSync, writeFileSync, watchFile } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { getProjectRoot, getHandoffDir, ensureHandoffDir, getProjectId, appendAuditLog, PACKET_JSON, PACKET_MD } from '../utils/config.js';
import { HandoffPacket, SUPPORTED_SOURCE_AGENTS, SUPPORTED_TARGET_AGENTS, SourceAgent, TargetAgent } from '../packet/schema.js';
import { buildPacket, mergePackets } from '../packet/builder.js';
import { renderPacketAsMarkdown } from '../packet/renderer.js';
import {
  handleGetCurrentHandoff,
  handleGetTaskState,
  handleGetDecisions,
  handleGetWarnings,
  handleGetRelatedFiles,
  handleGetSummary,
} from './tools.js';
import { searchContext, formatSearchResults } from './search.js';

function noPacket() {
  return {
    content: [{ type: 'text' as const, text: 'No handoff packet found. Run `agenthandoff build` first.' }],
    isError: true,
  };
}

function loadPacket(packetPath: string): HandoffPacket | null {
  if (!existsSync(packetPath)) return null;
  try {
    return JSON.parse(readFileSync(packetPath, 'utf8')) as HandoffPacket;
  } catch {
    return null;
  }
}

function createMinimalPacket(projectRoot: string): HandoffPacket {
  return {
    schema_version: '1.0',
    project_id: getProjectId(projectRoot),
    project_path: projectRoot,
    created_at: new Date().toISOString(),
    source_agent: 'claude-code',
    target_agent: 'generic',
    task_state: undefined,
    decisions: [],
    facts: [],
    warnings: [],
    failed_attempts: [],
    related_files: [],
    open_questions: [],
    manual_notes: [],
    provenance: {
      capture_method: 'agent-self-reported',
      sources_used: [],
      review_status: 'draft',
    },
  };
}

export async function startMCPServer(): Promise<void> {
  const projectRoot = getProjectRoot();
  const handoffDir  = ensureHandoffDir(projectRoot);
  const packetPath  = join(handoffDir, PACKET_JSON);
  const mdPath      = join(handoffDir, PACKET_MD);

  let packet: HandoffPacket | null = loadPacket(packetPath);
  let watcherActive = existsSync(packetPath);

  // Live-reload when packet file changes on disk
  if (watcherActive) {
    watchFile(packetPath, { interval: 1000 }, () => {
      packet = loadPacket(packetPath);
    });
  }

  // Auto-initialize packet on first write — no human CLI step required.
  // Also starts the file-watcher if it wasn't running yet.
  function ensurePacket(): HandoffPacket {
    if (packet) return packet;
    packet = createMinimalPacket(projectRoot);
    writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
    if (!watcherActive) {
      watchFile(packetPath, { interval: 1000 }, () => { packet = loadPacket(packetPath); });
      watcherActive = true;
    }
    return packet;
  }

  const server = new McpServer({ name: 'agenthandoff', version: '0.1.0' });

  server.tool(
    'get_current_handoff',
    'Get the full AgentHandoff context packet. Read at session start to understand previous agent work.',
    {},
    async () => handleGetCurrentHandoff(packet),
  );

  server.tool(
    'get_task_state',
    'Get current task state: goal, progress, blockers, and next action.',
    {},
    async () => handleGetTaskState(packet),
  );

  server.tool(
    'get_decisions',
    'Get all recorded architectural decisions and their rationale.',
    {},
    async () => handleGetDecisions(packet),
  );

  server.tool(
    'get_warnings',
    'Get warnings and failed approaches — things to avoid.',
    {},
    async () => handleGetWarnings(packet),
  );

  server.tool(
    'get_related_files',
    'Get the list of files most relevant to the current task.',
    {},
    async () => handleGetRelatedFiles(packet),
  );

  server.tool(
    'get_summary',
    'Get a brief summary of the handoff packet: item counts, route, current goal.',
    {},
    async () => handleGetSummary(packet),
  );

  server.tool(
    'get_context_for_task',
    'Search the handoff packet for context relevant to a specific task. Returns only the most relevant decisions, warnings, and failed attempts — far fewer tokens than get_current_handoff.',
    {
      task:  z.string().describe('Describe the task you are about to work on'),
      scope: z.string().optional().describe('Optional file path or module to focus on (e.g. "src/auth/*")'),
      top_k: z.number().optional().describe('Max items to return (default: 8)'),
    },
    async ({ task, scope, top_k }) => {
      if (!packet) return noPacket();
      const results = searchContext(packet, task, scope, top_k ?? 8);
      const text = formatSearchResults(results, task);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'add_note',
    'Add a note to the current handoff packet from within an agent session.',
    { note: z.string().describe('The note to add to the packet') },
    async ({ note }) => {
      packet = ensurePacket();
      packet.manual_notes.push(note);
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Note added: "${note}"` }] };
    },
  );

  // ── Live push tools: call these DURING a session to build context in real-time.
  // Much better than trying to extract context after the fact.

  server.tool(
    'push_decision',
    'Record an architectural decision made in this session. Call this whenever you choose between approaches.',
    {
      statement: z.string().describe('The decision: what was chosen and why'),
      reason:    z.string().optional().describe('Rationale for the decision'),
      files:     z.array(z.string()).optional().describe('Related file paths'),
    },
    async ({ statement, reason, files }) => {
      packet = ensurePacket();
      packet.decisions.push({
        statement,
        reason,
        related_files: files ?? [],
        confidence: 1.0,
        added_at: new Date().toISOString(),
      });
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Decision recorded: "${statement}"` }] };
    },
  );

  server.tool(
    'push_warning',
    'Record a warning or constraint discovered in this session. Call this when you find something the next agent must know.',
    {
      statement: z.string().describe('The warning: what to avoid or be careful about'),
      source:    z.string().optional().describe('Where this warning came from'),
    },
    async ({ statement, source }) => {
      packet = ensurePacket();
      packet.warnings.push({ statement, source: source ?? 'session', added_at: new Date().toISOString() });
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Warning recorded: "${statement}"` }] };
    },
  );

  server.tool(
    'push_failed_attempt',
    'Record an approach that was tried and failed. Call this after hitting a dead end so the next agent does not repeat it.',
    {
      what:           z.string().describe('What was attempted'),
      why_failed:     z.string().describe('Why it failed'),
      recommendation: z.string().optional().describe('What to try instead'),
    },
    async ({ what, why_failed, recommendation }) => {
      packet = ensurePacket();
      packet.failed_attempts.push({ what, why_failed, recommendation, added_at: new Date().toISOString() });
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Failed attempt recorded: "${what}"` }] };
    },
  );

  server.tool(
    'set_task_state',
    'Update the current task state. Call this whenever the goal, current step, or next action changes.',
    {
      goal:        z.string().describe('The overall task goal'),
      current_step: z.string().optional().describe('What is being worked on right now'),
      next_action:  z.string().optional().describe('The specific next action when handing off'),
      blocked_on:   z.string().optional().describe('What is blocking progress, if anything'),
    },
    async ({ goal, current_step, next_action, blocked_on }) => {
      packet = ensurePacket();
      packet.task_state = { goal, current_step, next_action, blocked_on };
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Task state updated: "${goal}"` }] };
    },
  );

  // ── initialize_handoff ────────────────────────────────────────────────────
  // Call this at session start to declare identity and goal.
  // Works even with no pre-existing packet — creates one automatically.
  server.tool(
    'initialize_handoff',
    'Start a new handoff session. Declare your agent identity and the target agent. Safe to call at any time — creates the packet if it does not exist, or updates identity fields if it does.',
    {
      source_agent: z.enum(SUPPORTED_SOURCE_AGENTS).describe('The agent starting this session (e.g. "claude-code")'),
      target_agent: z.enum(SUPPORTED_TARGET_AGENTS).describe('The agent that will receive the handoff (e.g. "codex")'),
      goal: z.string().optional().describe('Top-level goal for this session'),
    },
    async ({ source_agent, target_agent, goal }) => {
      packet = ensurePacket();
      packet.source_agent = source_agent;
      packet.target_agent = target_agent;
      packet.created_at   = new Date().toISOString();
      if (goal) packet.task_state = { ...packet.task_state, goal };
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      appendAuditLog(projectRoot, `initialize_handoff: ${source_agent} → ${target_agent}`);
      return { content: [{ type: 'text' as const, text:
        `Handoff initialized: ${source_agent} → ${target_agent}` +
        (goal ? `\nGoal: ${goal}` : '') +
        '\n\nPush context as you work:\n  push_decision / push_warning / push_failed_attempt / add_fact / set_task_state\n\nWhen ready to hand off:\n  build_handoff',
      }] };
    },
  );

  // ── add_fact ──────────────────────────────────────────────────────────────
  server.tool(
    'add_fact',
    'Record a factual observation about the codebase or project state. Use for things that are true and useful for the next agent to know, but are not decisions or warnings.',
    {
      statement:     z.string().describe('The fact to record'),
      related_files: z.array(z.string()).optional().describe('Files this fact relates to'),
    },
    async ({ statement, related_files }) => {
      packet = ensurePacket();
      packet.facts.push({
        statement,
        source:        'agent-session',
        related_files: related_files ?? [],
        added_at:      new Date().toISOString(),
      });
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Fact recorded: "${statement}"` }] };
    },
  );

  // ── add_open_question ─────────────────────────────────────────────────────
  server.tool(
    'add_open_question',
    'Record an unresolved question for the next agent to investigate.',
    {
      question: z.string().describe('The open question to record'),
    },
    async ({ question }) => {
      packet = ensurePacket();
      packet.open_questions.push(question);
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Open question recorded: "${question}"` }] };
    },
  );

  // ── build_handoff ─────────────────────────────────────────────────────────
  // The core autonomous tool. Captures git state, session history, and
  // instruction files, then merges with everything pushed during this session.
  // Writes both current-handoff.json and current-handoff.md.
  server.tool(
    'build_handoff',
    'Finalize and write the complete handoff packet. Captures git state, session history, and project instruction files automatically, then merges with every decision/warning/fact you pushed during this session. Call this when you are ready to hand off to another agent. No CLI command needed.',
    {
      target_agent: z.enum(SUPPORTED_TARGET_AGENTS).optional().describe('Override the target agent (default: whatever was set in initialize_handoff, or "generic")'),
      use_llm:      z.boolean().optional().describe('Use LLM compression for smarter extraction (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)'),
    },
    async ({ target_agent, use_llm }) => {
      const pushed = packet; // snapshot current in-memory state
      const srcAgent = (pushed?.source_agent ?? 'claude-code') as SourceAgent;
      const tgtAgent = (target_agent ?? pushed?.target_agent ?? 'generic') as TargetAgent;

      let buildResult;
      try {
        buildResult = await buildPacket({
          projectRoot,
          sourceAgent: srcAgent,
          targetAgent: tgtAgent,
          useLLM: use_llm ?? false,
        });
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Build failed: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }

      const merged = pushed
        ? mergePackets(buildResult.packet, pushed)
        : buildResult.packet;

      writeFileSync(packetPath, JSON.stringify(merged, null, 2), 'utf8');
      writeFileSync(mdPath, renderPacketAsMarkdown(merged), 'utf8');
      packet = merged;
      appendAuditLog(projectRoot, `build_handoff via MCP: ${srcAgent} → ${tgtAgent} (llm=${use_llm ?? false})`);

      const warnings = buildResult.warnings.length
        ? `\nBuild warnings:\n${buildResult.warnings.map(w => `  ⚠ ${w}`).join('\n')}`
        : '';

      return { content: [{ type: 'text' as const, text:
        `Handoff built and written.\n` +
        `  Decisions:      ${merged.decisions.length}\n` +
        `  Facts:          ${merged.facts.length}\n` +
        `  Warnings:       ${merged.warnings.length}\n` +
        `  Failed attempts:${merged.failed_attempts.length}\n` +
        `  Related files:  ${merged.related_files.length}\n` +
        `  Sources used:   ${buildResult.sourcesUsed.join(', ') || 'none'}` +
        warnings +
        `\n\nFiles written:\n  ${packetPath}\n  ${mdPath}` +
        `\n\nThe next agent can read context with get_current_handoff or get_context_for_task.`,
      }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
