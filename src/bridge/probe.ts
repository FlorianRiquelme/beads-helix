import { z } from 'zod';

export const HelixIdPayloadSchema = z.object({
  ok: z.literal(true),
  mode: z.enum(['deck', 'project']),
  projectId: z.union([z.string(), z.null()]),
  pid: z.number(),
});

export type HelixIdPayload = z.infer<typeof HelixIdPayloadSchema>;

export interface ProbeOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Probe `GET <baseUrl>/_helix-id` and return the parsed payload if a
 * compatible Helix server responds within the timeout. Any other outcome
 * (connection refused, non-helix shape, timeout, 4xx/5xx) returns null —
 * callers fall back to spawning a fresh server.
 *
 * Default timeout 500ms: fast enough for a human-perceivable CLI gesture,
 * long enough to tolerate a healthy loopback TCP handshake + JSON round-trip
 * on a loaded machine.
 */
export async function probeHelixServer(
  baseUrl: string,
  opts: ProbeOptions = {},
): Promise<HelixIdPayload | null> {
  const timeoutMs = opts.timeoutMs ?? 500;
  const fetchFn = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const normalized = baseUrl.replace(/\/+$/, '');
    const res = await fetchFn(`${normalized}/_helix-id`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }
    const parsed = HelixIdPayloadSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
