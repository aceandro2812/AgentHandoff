import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync, readFileSync, writeFileSync, watchFile } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { getProjectRoot, getHandoffDir, PACKET_JSON } from '../utils/config.js';
import { HandoffPacket } from '../packet/schema.js';
import {
  handleGetCurrentHandoff,
  handleGetTaskState,
  handleGetDecisions,
  handleGetWarnings,
  handleGetRelatedFiles,
  handleGetSummary,
} from './tools.js';

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

export async function startMCPServer(): Promise<void> {
  const projectRoot = getProjectRoot();
  const packetPath = join(getHandoffDir(projectRoot), PACKET_JSON);

  let packet = loadPacket(packetPath);

  // Live-reload when packet file changes on disk
  if (existsSync(packetPath)) {
    watchFile(packetPath, { interval: 1000 }, () => {
      packet = loadPacket(packetPath);
    });
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
    'add_note',
    'Add a note to the current handoff packet from within an agent session.',
    { note: z.string().describe('The note to add to the packet') },
    async ({ note }) => {
      if (!packet) return noPacket();
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
      if (!packet) return noPacket();
      packet.decisions.push({
        statement,
        reason,
        related_files: files ?? [],
        confidence: 1.0,
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
      if (!packet) return noPacket();
      packet.warnings.push({ statement, source: source ?? 'session' });
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
      if (!packet) return noPacket();
      packet.failed_attempts.push({ what, why_failed, recommendation });
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
      if (!packet) return noPacket();
      packet.task_state = { goal, current_step, next_action, blocked_on };
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Task state updated: "${goal}"` }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
