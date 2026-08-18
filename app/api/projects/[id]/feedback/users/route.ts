import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { eraseFeedbackUser } from "@/lib/server/feedback/erasure";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * People already known to the project, for the entry author selector
 * internal — and their deletion on request (DELETE, GDPR art. 17).
 *
 * Entering a return in someone's name required retyping their head email,
 * to the letter: a mistake and a SECOND identity is born, with its
 * own pseudonym and his own voice. Those who have already written or voted are
 * therefore offered, and free entry remains open for new ones.
 *
 * Real identities (email, name): this is the team view, like `team-queries`.
 */

const LIMIT = 20;

export interface TeamFeedbackUserOption {
  id: string;
  email: string | null;
  name: string | null;
  pseudonym: string;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const service = getServiceClient();
  let select = service
    .from("feedback_users")
    .select("id, email, name, pseudonym")
    .eq("project_id", id)
    // A deleted identity no longer has either email or name: offering it would amount to
    // offer an empty line to the selector, and let people believe that we can still
    // write on behalf of someone who has asked to disappear.
    .is("erased_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (query) {
    // `%` and `,` are metacharacters of the PostgREST `or` syntax:
    // letting pass would let a keystroke change the form of the query.
    const needle = query.replace(/[%,()]/g, " ");
    select = select.or(`email.ilike.%${needle}%,name.ilike.%${needle}%`);
  }

  const { data } = await select;
  return NextResponse.json({ users: (data ?? []) as TeamFeedbackUserOption[] });
}

/**
 * Deletion of a participant, at the request of the interested party (GDPR art. 17).
 *
 * Keeps `requireProjectMember` like all feedback team routes:
 * who can rotate the board's public token or erase its SSO secret can
 * honor an erasure request. Make it the only exception reserved for
 * owner would make a right dependent on an internal hierarchy.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const userId = request.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const result = await eraseFeedbackUser({ projectId: id, userId });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "notFound" ? 404 : 500 }
    );
  }
  return NextResponse.json({ report: result.report });
}
