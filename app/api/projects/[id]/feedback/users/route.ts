import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { eraseFeedbackUser } from "@/lib/server/feedback/erasure";
import { decodeFeedbackIdentityRow } from
  "@/lib/server/feedback/identity-content";

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
  const needle = query.toLocaleLowerCase();
  const users: TeamFeedbackUserOption[] = [];
  for (let offset = 0; users.length < LIMIT; offset += 200) {
    const { data, error } = await service.from("feedback_users")
      .select("id, project_id, email, name, pseudonym")
      .eq("project_id", id).is("erased_at", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + 199);
    if (error) return NextResponse.json({ error: "Unable to load feedback users" },
      { status: 500 });
    const rows = data ?? [];
    for (const row of rows) {
      const plain = await decodeFeedbackIdentityRow(row, id, guard.userId);
      if (!needle || plain.email?.toLocaleLowerCase().includes(needle) ||
          plain.name?.toLocaleLowerCase().includes(needle)) {
        users.push({ id: plain.id, email: plain.email, name: plain.name,
          pseudonym: plain.pseudonym });
        if (users.length === LIMIT) break;
      }
    }
    if (rows.length < 200) break;
  }
  return NextResponse.json({ users });
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
