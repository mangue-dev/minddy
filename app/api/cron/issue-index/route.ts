import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { runIssueIndexBackfill } from "@/lib/server/issue-relation-inference";

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
    const result = await runIssueIndexBackfill();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error("[issue-index] backfill failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
