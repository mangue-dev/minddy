import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { verifyCriticalBackfillReadiness } from
  "@/lib/server/encryption/critical-backfill-readiness";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Run a read-only, content-free verification during a quiescent staging window. */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await verifyCriticalBackfillReadiness();
    return NextResponse.json(result, { status: result.ready ? 200 : 409,
      headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ready: false, error: "verification_failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
