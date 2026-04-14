import { describe, expect, it } from 'vitest';
import { serialize } from '../../src/server/sse.js';

describe('serialize', () => {
  it('serializes string data as-is', () => {
    expect(serialize({ event: 'foo', data: 'hello' })).toBe(
      'event: foo\ndata: hello\n\n',
    );
  });

  it('JSON-serializes non-string data', () => {
    const payload = serialize({ event: 'snapshot-changed', data: { x: 1 } });
    expect(payload).toBe(
      'event: snapshot-changed\ndata: {"x":1}\n\n',
    );
  });

  it('terminates with double newline for SSE framing', () => {
    const payload = serialize({ event: 'e', data: 'd' });
    expect(payload.endsWith('\n\n')).toBe(true);
  });
});
