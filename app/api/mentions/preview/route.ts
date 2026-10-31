import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { isPreviewMentionType } from "@/lib/mention-preview";
import { previewMentionTarget } from "@/lib/server/mention-preview";

const NO_STORE = { "Cache-Control": "private, no-store" };
const PREVIEWS_PER_MINUTE = 240;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/mentions/preview?type=&id=&project= — the hover card of one
 * mention (MIN-879). `project` is a skill's project, or for any other type
 * the project the mention is read in (a member's role there). Answer:
 * `{ preview }`, `null` when the target is unknown, deleted or not the
 * reader's to see, indistinguishably. See lib/server/mention-preview.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "mention-preview", { limit: PREVIEWS_PER_MINUTE });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const id = params.get("id") ?? "";
  const project = params.get("project");
  if (!isPreviewMentionType(type) || !id || id.length > 64 || (project !== null && !UUID.test(project))) {
    return NextResponse.json({ error: "Invalid mention" }, { status: 400, headers: NO_STORE });
  }
  const preview = await previewMentionTarget(
    auth.user.id,
    { type, id, ...(type === "skill" && project ? { meta: { project } } : {}) },
    type === "skill" ? null : project,
  );
  return NextResponse.json({ preview }, { headers: NO_STORE });
}
