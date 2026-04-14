import type { StreamingApi } from 'hono/utils/stream';

export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Registry of connected SSE clients. Server broadcasts snapshot-changed
 * events to every active stream.
 */
export class SseHub {
  private readonly clients = new Set<StreamingApi>();

  add(stream: StreamingApi): void {
    this.clients.add(stream);
  }

  remove(stream: StreamingApi): void {
    this.clients.delete(stream);
  }

  size(): number {
    return this.clients.size;
  }

  async broadcast(event: SseEvent): Promise<void> {
    const payload = serialize(event);
    const dead: StreamingApi[] = [];
    await Promise.all(
      Array.from(this.clients).map(async (stream) => {
        try {
          await stream.write(payload);
        } catch {
          dead.push(stream);
        }
      }),
    );
    for (const d of dead) this.clients.delete(d);
  }

  async heartbeat(): Promise<void> {
    const payload = `: heartbeat\n\n`;
    const dead: StreamingApi[] = [];
    await Promise.all(
      Array.from(this.clients).map(async (stream) => {
        try {
          await stream.write(payload);
        } catch {
          dead.push(stream);
        }
      }),
    );
    for (const d of dead) this.clients.delete(d);
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients).map(async (stream) => {
        try {
          await stream.close();
        } catch {
          // stream already closed
        }
      }),
    );
    this.clients.clear();
  }
}

export function serialize(event: SseEvent): string {
  const data = typeof event.data === 'string'
    ? event.data
    : JSON.stringify(event.data);
  return `event: ${event.event}\ndata: ${data}\n\n`;
}
