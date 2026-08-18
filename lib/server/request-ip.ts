import "server-only";

/**
 * Client IP for rate limiting public surfaces.
 *
 * The catch is in `x-forwarded-for`: it's a LIST, and its
 * HEAD entry is the one the caller sent. Reading it means letting a client
 * choose its own counter — a different header for each request and the limit no longer limits anything.
 *
 * What is trustworthy is what the last trusted relay,
 * wrote, i.e. ours :
 * - `x-vercel-forwarded-for` and `x-real-ip` are set by the platform and
 * overwrite what the client would have sent under these names;
 * - in `x-forwarded-for`, the QUEUE entry is the one added by the relay the
 * closer to us; the previous ones come from the caller.
 *
 * Fallback "unknown": a shared bucket is better than no limit.
 */
export function getClientIp(request: Request): string {
  return (
    lastHop(request.headers.get("x-vercel-forwarded-for")) ??
    lastHop(request.headers.get("x-real-ip")) ??
    lastHop(request.headers.get("x-forwarded-for")) ??
    "unknown"
  );
}

/** Same from a `Headers` already read (server actions, `headers()`). */
export function clientIpFromHeaders(headers: Headers): string {
  return (
    lastHop(headers.get("x-vercel-forwarded-for")) ??
    lastHop(headers.get("x-real-ip")) ??
    lastHop(headers.get("x-forwarded-for")) ??
    "unknown"
  );
}

function lastHop(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(",");
  return parts[parts.length - 1]?.trim() || null;
}
