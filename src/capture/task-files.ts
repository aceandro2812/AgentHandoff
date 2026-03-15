import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface TodoItem {
  content: string;
  status: string;
  priority: string;
}

export interface TaskContext {
  todos: TodoItem[];
  raw: string;
}

export function captureTaskFiles(projectRoot: string): TaskContext {
  // Claude Code todos
  const todoPath = join(projectRoot, '.claude', 'todos.json');
  if (existsSync(todoPath)) {
    try {
      const raw = readFileSync(todoPath, 'utf8');
      const parsed = JSON.parse(raw) as Array<{ content?: string; status?: string; priority?: string }>;
      const todos: TodoItem[] = parsed.map(t => ({
        content: t.content ?? '',
        status: t.status ?? 'pending',
        priority: t.priority ?? 'medium',
      }));
      return { todos, raw };
    } catch {
      // ignore parse errors
    }
  }

  return { todos: [], raw: '' };
}

export function formatTaskContext(ctx: TaskContext): string {
  if (ctx.todos.length === 0) return '';

  const pending = ctx.todos.filter(t => t.status !== 'completed');
  const done = ctx.todos.filter(t => t.status === 'completed');

  const lines: string[] = [];
  if (pending.length > 0) {
    lines.push('Active tasks:');
    for (const t of pending) {
      const prio = t.priority !== 'medium' ? ` [${t.priority}]` : '';
      lines.push(`  - ${t.content}${prio}`);
    }
  }
  if (done.length > 0) {
    lines.push('Completed tasks:');
    for (const t of done) {
      lines.push(`  ✓ ${t.content}`);
    }
  }

  return lines.join('\n');
}
