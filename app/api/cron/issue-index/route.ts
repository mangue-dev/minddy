import { withEventActor } from "@/lib/server/supabase-fetch";
import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { runIssueIndexBackfill } from "@/lib/server/issue-relation-inference";
import { runAsBackgroundAiWork } from "@/lib/server/ai-consent";

/**
 * The issue index backfill (MIN-717): existing issues, imports, forge copies
 * and issues whose index version an admin replaced get their vector here,
 * 100 issues per run from a resumable cursor, billed to each project's owner
 * under the owner's indexing preference and budget. Up-to-date rows cost
 * nothing. It never links issues: relations are only inferred for issues
 * someone writes or edits.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // AI runs under each account's answer in the mobile app (MIN-907).
    const result = await runAsBackgroundAiWork(() => runIssueIndexBackfill());
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error("[issue-index] backfill failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** Index backfill writes are maintenance for the event journal (MIN-926). */
const handleAsMaintenance = (request: Parameters<typeof handle>[0]) =>
  withEventActor({ kind: "maintenance" }, () => handle(request));

export const GET = handleAsMaintenance;
export const POST = handleAsMaintenance;
