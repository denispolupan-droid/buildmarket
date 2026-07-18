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

/**
 * Extract the client IP from request headers.
 *
 * On Vercel `x-real-ip` is set by the trusted edge to the actual peer, so we
 * prefer it. For `x-forwarded-for` we take the LAST entry (appended by the
 * trusted proxy) — the leading entries can be spoofed by the client, which
 * would let an attacker rotate the header to bypass per-IP rate limits.
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}
