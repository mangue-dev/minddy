/**
 * In-memory per-user rate limiter for session-authenticated API routes.
 * Prevents abuse from authenticated users on internal endpoints.
 *
 * This is intentionally in-memory: it resets on deploy, which is acceptable
 * for session-based routes.
 *
 * The key is a user id on authenticated routes, and `ip:<addr>`
 * (`lib/server/request-ip.ts`) on the anonymous ones — a per-user window means
 * nothing where there is no user.
 */

import { NextResponse } from "next/server";

const DEFAULT_WINDOW_MS = 60_000; // 1 minute

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Periodic cleanup to prevent memory leaks (every 5 minutes)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of windows) {
    if (now >= entry.resetAt) windows.delete(key);
  }
}

export interface SessionRateLimitConfig {
  /** Max requests per window per user. Default: 60. */
  limit?: number;
  /** Window length in milliseconds. Default: 60_000 (1 minute). */
  windowMs?: number;
}

export function checkSessionRateLimit(
  userId: string,
  routeKey: string,
  config?: SessionRateLimitConfig
): { allowed: boolean; retryAfter: number } {
  cleanup();

  const limit = config?.limit ?? 60;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();
  const key = `${userId}:${routeKey}`;
  const entry = windows.get(key);

  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return { allowed: true, retryAfter: 0 };
}

/**
 * Le limiteur ET son refus, en un appel : `null` = passe, sinon la 429 à rendre.
 *
 * La même dizaine de lignes était recopiée route par route (MIN-348 en a
 * branché huit de plus) ; une garde qu'on recopie est une garde qu'on finit par
 * poser à moitié — sans l'en-tête `Retry-After`, ou après le travail coûteux
 * qu'elle devait éviter.
 */
export function rateLimitRefusal(
  key: string,
  routeKey: string,
  config?: SessionRateLimitConfig
): NextResponse | null {
  const rate = checkSessionRateLimit(key, routeKey, config);
  if (rate.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests", retry_after: rate.retryAfter },
    { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
  );
}
