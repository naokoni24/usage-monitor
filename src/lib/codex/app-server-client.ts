import 'server-only';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Thin JSON-RPC 2.0 client for `codex app-server` over stdio, covering only
 * the account/rate-limit read methods this app needs. Spawns a dedicated
 * short-lived child process per sync cycle - this never touches any other
 * Codex process (e.g. an interactive CLI/TUI session) running on the machine,
 * and only ever terminates the process it spawned itself.
 *
 * Reference: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
 */

interface JsonRpcIncoming {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
  params?: unknown;
}

export class CodexAppServerError extends Error {
  constructor(
    message: string,
    public readonly kind: 'spawn_failed' | 'method_not_supported' | 'timeout' | 'protocol_error',
  ) {
    super(message);
  }
}

const DEFAULT_COMMAND: [string, string[]] = ['codex', ['app-server']];
const REQUEST_TIMEOUT_MS = 10_000;

function resolveCommand(): [string, string[]] {
  const commandLine = (process.env.CODEX_APP_SERVER_COMMAND ?? '').trim();
  if (!commandLine) return DEFAULT_COMMAND;
  const [cmd, ...args] = commandLine.split(/\s+/);
  return [cmd, args];
}

export class CodexAppServerSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private initialized: Promise<void> | null = null;

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let message: JsonRpcIncoming;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if (message.error) {
        reject(new CodexAppServerError(message.error.message, classifyError(message.error)));
      } else {
        resolve(message.result);
      }
    }
    // Notifications (no `id`) are ignored - we only need request/response data.
  }

  private spawnChild(): ChildProcessWithoutNullStreams {
    const [cmd, args] = resolveCommand();
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line));

    child.once('error', (err) => {
      const wrapped = new CodexAppServerError(`Failed to launch Codex app-server: ${err.message}`, 'spawn_failed');
      for (const { reject } of this.pending.values()) reject(wrapped);
      this.pending.clear();
    });
    child.once('exit', (code) => {
      if (this.pending.size === 0) return;
      const wrapped = new CodexAppServerError(`Codex app-server exited unexpectedly (code ${code})`, 'spawn_failed');
      for (const { reject } of this.pending.values()) reject(wrapped);
      this.pending.clear();
    });

    return child;
  }

  private sendRequest<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ method, id, params }) + '\n';

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerError(`${method} timed out`, 'timeout'));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      this.child!.stdin.write(payload);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    this.child?.stdin.write(JSON.stringify({ method, params }) + '\n');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        this.child = this.spawnChild();
        await this.sendRequest('initialize', {
          clientInfo: { name: 'ai-usage-monitor', title: 'AI Usage Monitor', version: '0.1.0' },
          capabilities: { experimentalApi: false },
        });
        this.sendNotification('initialized', {});
      })();
    }
    await this.initialized;
  }

  async request<T>(method: string, params: unknown = {}): Promise<T> {
    await this.ensureInitialized();
    return this.sendRequest<T>(method, params);
  }

  /** Ends the child process we spawned. Never touches other Codex processes. */
  close(): void {
    const child = this.child;
    if (child && !child.killed) {
      child.stdin.end();
      setTimeout(() => {
        if (!child.killed) child.kill();
      }, 2000);
    }
    this.child = null;
    this.initialized = null;
    this.pending.clear();
  }
}

function classifyError(error: { code: number; message: string }): CodexAppServerError['kind'] {
  if (error.code === -32601) return 'method_not_supported';
  return 'protocol_error';
}
