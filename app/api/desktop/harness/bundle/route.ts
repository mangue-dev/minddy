import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  harnessBundleManifest,
  harnessBundleSource,
} from "@/lib/server/agent/harness-bundle";

/**
 * `GET /api/desktop/harness/bundle` — THE HARNESS BYTES (MIN-293).
 *
 * The second half of the delivery, separated from the manifest
 * ([../route.ts](../route.ts)) for a reason that is not storage: the
 * manifest is requested EVERY round, the bytes only when the fingerprint has
 * exchange. Serving them together would make 280 KB per turn for two hundred
 * useful bytes.
 *
 * ## Imprint header is not the guarantee
 *
 * `x-minddy-harness-sha256` is there so that the download is verified without a
 * second round trip, and that's it. **What really protects is
 * rechecking the disk file, just before the fork**: the bundle is
 * the only code not signed by Apple that the app executes, it lives under `userData` and
 * it is writable by the model under the same UID. A control that would not have
 * instead of downloading would let a tour rewrite the harness of the tour
 * following turn — see [lib/desktop/harness-bundle.ts](../../../../../lib/desktop/harness-bundle.ts).
 *
 * ## `text/plain`, not `text/javascript`
 *
 * Nothing here should look like a script that a browser might load. THE
 * only client is a `fetch` of the main process, which writes the body to disk;
 * an executable `content-type` and an absent `content-disposition` would be a
 * invitation to use it differently. The `nosniff` goes with it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let source: string;
  let sha256: string;
  try {
    [source, { sha256 }] = await Promise.all([
      harnessBundleSource(),
      harnessBundleManifest(),
    ]);
  } catch (err) {
    console.error("[desktop-harness] bundle indisponible:", (err as Error).message);
    return NextResponse.json(
      { error: "harness bundle unavailable on this deployment" },
      { status: 503 },
    );
  }

  return new NextResponse(source, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      "content-disposition": 'attachment; filename="minddy-harness.js"',
      "x-minddy-harness-sha256": sha256,
      "cache-control": "no-store",
    },
  });
}
