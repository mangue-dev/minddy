import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { harnessBundleManifest } from "@/lib/server/agent/harness-bundle";

/**
 * `GET /api/desktop/harness` — THE HARNESS MANIFESTO (MIN-293).
 *
 * The first of two surfaces by which a machine retrieves the code
 * which she will execute. It returns four numbers and two strings, and that's what
 * allows NOT to redownload 280 KB each turn: the launcher compares
 * the fingerprint to that of the file he already has under `userData`.
 *
 * ## What it is used for, and why it is authenticated
 *
 * The bundle carries NO secrets, and a test holds it
 * ([vm-bundle-secrets.test.ts](../../../../lib/server/agent/vm-bundle-secrets.test.ts)) :
 * it is written in each microVM, where the model runs from the shell. Open it in
 * anonymous would therefore not disclose anything that a run does not already disclose. But there is no
 * no reason to leave it within reach of a vacuum cleaner: the only person
 * who needs it is someone logged in, in the desktop app, on the verge
 * to play a trick. One more member in the list of things we serve at
 * whole world is one more member to defend.
 *
 * The app calls with its session (`session.defaultSession.fetch`), so the
 * cookies of the origin of the active channel: this is what guarantees that a shell in
 * preview receives the preview harness, not the production harness —
 * the origin serves the manifest AND the bundle AND the control plane, or neither
 * trois.
 *
 * ## Pas de cache
 *
 * `force-dynamic` and nothing to cache: the manifest changes every time
 * deployment, and an outdated fingerprint would cause the fork to be refused instead of
 * fix. That's two hundred bytes, requested once per round.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await harnessBundleManifest(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    /**
     * THE BUNDLE IS MISSING ON THIS DEPLOYMENT, and it's a build failure, not a
     * caller error: `npm run build:agent-vm` did not run, or
     * `outputFileTracingIncludes` did not ship it. A 503 says it to the
     * machine, which refuses its turn BEFORE the fork and writes it in its journal —
     * rather than an anonymous 500 that no one will know what to do with.
     */
    console.error("[desktop-harness] bundle indisponible:", (err as Error).message);
    return NextResponse.json(
      { error: "harness bundle unavailable on this deployment" },
      { status: 503 },
    );
  }
}
