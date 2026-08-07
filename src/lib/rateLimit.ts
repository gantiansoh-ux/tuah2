// ─── Simple in-memory rate limiter ───
// Production note: single-process memory map is fine for the current
// single pm2 instance. If we ever scale horizontally, swap for Redis.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20000;

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();

  // Prevent unbounded growth
  if (buckets.size > MAX_BUCKETS) {
    buckets.clear();
  }

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
