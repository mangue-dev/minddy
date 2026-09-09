import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { prReadinessBatchResponse } from "@/lib/server/agent/pr-actions";

const MAX_BATCH_SIZE = 100;

/** Compact merge-readiness data for the pull request sidebar rows. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const prIds = [...new Set(request.nextUrl.searchParams.getAll("pr"))].filter(Boolean);
  if (prIds.length === 0 || prIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: "Invalid pull request batch" }, { status: 400 });
  }

  return prReadinessBatchResponse(auth.user.id, prIds);
}
