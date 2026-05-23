/**
 * Simple sliding-window in-memory rate limiter.
 *
 * Works per serverless instance (no shared state across instances).
 * It's a first line of defence against obvious abuse from a single IP —
 * a proper solution would use Redis/Upstash, but this is zero-dependency.
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// Evict stale keys every ~5 minutes to avoid memory leaks in long-lived instances
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of store.entries()) {
    if (win.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * @param key       Unique identifier, typically `ip:route`
 * @param limit     Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds
 * @returns `true` if the request is allowed, `false` if it should be rejected
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) return false;

  existing.count += 1;
  return true;
}

/** Extract the best available IP from Next.js request headers */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}
