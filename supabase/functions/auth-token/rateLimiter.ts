/**
 * Intentional per-isolate in-memory rate limiter for `auth-token` (see ADR-0001 §4.5).
 *
 * Trade-off: avoids adding PostgreSQL latency and availability coupling on every OAuth code exchange
 * or token refresh. Parallel Edge isolates and cold starts maintain independent local windows,
 * while Cloudflare WAF and upstream Google OAuth quotas provide outer defense-in-depth.
 * Unattributed requests (missing client IP headers) share a stricter fallback bucket stored outside
 * the per-IP map so callers cannot bypass or poison throttling, and tracked keys are hard-capped
 * to prevent memory/CPU exhaustion.
 */

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const MAX_REQUESTS_PER_WINDOW = 30;
export const MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW = 10;

const CLEANUP_THRESHOLD = 500;
const MAX_TRACKED_KEYS = 2_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequestsPerIp?: number;
  maxUnattributedRequests?: number;
  cleanupThreshold?: number;
  maxTrackedKeys?: number;
  now?: () => number;
}

export interface RateLimiter {
  check(clientIp: string | undefined): RateLimitResult;
  reset(): void;
  size(): number;
}

function computeRetryAfterSeconds(resetAt: number, currentTime: number): number {
  return Math.max(1, Math.ceil((resetAt - currentTime) / 1000));
}

function recordWindowHit(
  entry: RateLimitEntry | undefined,
  limit: number,
  windowMs: number,
  currentTime: number,
): { entry: RateLimitEntry; result: RateLimitResult } {
  if (!entry || currentTime >= entry.resetAt) {
    const resetAt = currentTime + windowMs;
    const limited = limit < 1;
    return {
      entry: { count: 1, resetAt },
      result: {
        limited,
        retryAfterSeconds: limited ? computeRetryAfterSeconds(resetAt, currentTime) : 0,
      },
    };
  }

  entry.count++;
  if (entry.count > limit) {
    return {
      entry,
      result: {
        limited: true,
        retryAfterSeconds: computeRetryAfterSeconds(entry.resetAt, currentTime),
      },
    };
  }

  return { entry, result: { limited: false, retryAfterSeconds: 0 } };
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const maxRequestsPerIp = options.maxRequestsPerIp ?? MAX_REQUESTS_PER_WINDOW;
  const maxUnattributedRequests =
    options.maxUnattributedRequests ?? MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW;
  const cleanupThreshold = options.cleanupThreshold ?? CLEANUP_THRESHOLD;
  const maxTrackedKeys = options.maxTrackedKeys ?? MAX_TRACKED_KEYS;
  const now = options.now ?? Date.now;

  const entries = new Map<string, RateLimitEntry>();
  let unattributedEntry: RateLimitEntry | undefined;
  let earliestResetAt = Number.POSITIVE_INFINITY;

  function pruneExpired(currentTime: number): void {
    let nextEarliest = Number.POSITIVE_INFINITY;
    for (const [key, value] of entries.entries()) {
      if (currentTime >= value.resetAt) {
        entries.delete(key);
      } else if (value.resetAt < nextEarliest) {
        nextEarliest = value.resetAt;
      }
    }
    earliestResetAt = nextEarliest;
  }

  function recordUnattributedHit(currentTime: number): RateLimitResult {
    const hit = recordWindowHit(unattributedEntry, maxUnattributedRequests, windowMs, currentTime);
    unattributedEntry = hit.entry;
    return hit.result;
  }

  function recordIpHit(normalizedIp: string, currentTime: number): RateLimitResult {
    const existing = entries.get(normalizedIp);
    if (!existing && entries.size >= maxTrackedKeys) {
      if (currentTime >= earliestResetAt) {
        pruneExpired(currentTime);
      }
      if (entries.size >= maxTrackedKeys) {
        return recordUnattributedHit(currentTime);
      }
    }

    const hit = recordWindowHit(existing, maxRequestsPerIp, windowMs, currentTime);
    if (hit.entry !== existing) {
      entries.set(normalizedIp, hit.entry);
    }
    if (hit.entry.resetAt < earliestResetAt) {
      earliestResetAt = hit.entry.resetAt;
    }
    return hit.result;
  }

  return {
    check(clientIp: string | undefined): RateLimitResult {
      const currentTime = now();
      if (entries.size >= cleanupThreshold && currentTime >= earliestResetAt) {
        pruneExpired(currentTime);
      }

      const normalizedIp = clientIp?.trim() || undefined;
      return normalizedIp
        ? recordIpHit(normalizedIp, currentTime)
        : recordUnattributedHit(currentTime);
    },
    reset(): void {
      entries.clear();
      unattributedEntry = undefined;
      earliestResetAt = Number.POSITIVE_INFINITY;
    },
    size(): number {
      return entries.size;
    },
  };
}

const defaultRateLimiter = createRateLimiter();

export function checkRateLimit(clientIp: string | undefined): RateLimitResult {
  return defaultRateLimiter.check(clientIp);
}
