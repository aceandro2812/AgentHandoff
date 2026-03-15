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
      if (!packet) {
        return {
          content: [{ type: 'text' as const, text: 'No handoff packet found. Run `agenthandoff build` first.' }],
          isError: true,
        };
      }
      packet.manual_notes.push(note);
      writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
      return { content: [{ type: 'text' as const, text: `Note added: "${note}"` }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
