import "server-only";

import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Cron route guard (MIN-118). Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`; without a deployed secret, the route is
 * unusable. The comparison goes through `timingSafeEqual` — a `!==` on the
 * header lets the duration of the comparison depend on the prefix provided, which
 * is in theory enough to reconstruct the secret byte by byte.
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}
