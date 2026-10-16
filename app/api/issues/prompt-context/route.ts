import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  MAX_PROMPT_CONTEXT_ISSUES,
  readIssuePromptContext,
} from "@/lib/server/issue-prompt-context";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/issues/prompt-context?ids=<uuid>,<uuid>…
 * Linked pull requests and repository of up to 50 issues, for the copied
 * issue prompts (MIN-719). Read-only, no forge call: it serves what minddy
 * already stores. Issues the caller cannot see are omitted.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_PROMPT_CONTEXT_ISSUES || !ids.every((id) => UUID.test(id))) {
    return NextResponse.json({ error: "invalidIssueIds" }, { status: 400 });
  }

  try {
    const issues = await readIssuePromptContext(auth.supabase, ids, auth.user.id);
    return NextResponse.json({ issues }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[issues/prompt-context] read failed");
    return NextResponse.json({ error: "Unable to read prompt context" }, { status: 500 });
  }
}
