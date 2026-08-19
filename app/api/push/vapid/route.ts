import { NextResponse } from "next/server";
import { capability } from "@/lib/server/capabilities";

/**
 * GET /api/push/vapid — the server's VAPID public key (MIN-183).
 *
 * PUBLIC, without authentication, and that's correct: this key is precisely
 * that which each subscribing browser already has, in plain text, in its
 * `PushSubscription`. It identifies the server, it does not authorize anything — it is the
 * PRIVATE half who signs the shipments.
 *
 * The only caller is the service worker's `pushsubscriptionchange` handler:
 * when the browser runs a subscription on its own, the worker must
 * resubscribe, and it doesn't have access to inlined variables in the client bundle
 * (`MINDDY_PUBLIC_VAPID_PUBLIC_KEY` is supplied at process start, never embedded in the build).
 *
 * `key: null` when push is not configured — the worker stops there instead
 * than subscribing with `undefined`.
 */
export function GET() {
  return NextResponse.json({
    key: capability("webPush").configured
      ? process.env.MINDDY_PUBLIC_VAPID_PUBLIC_KEY!.trim()
      : null,
  });
}
