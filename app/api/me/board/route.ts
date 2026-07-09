import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import type { Category, Member, Objective } from "@/lib/types";

/**
 * GET /api/me/board — everything the cross-project "My/All" kanban needs, so it
 * can be a *real* board (drag between columns, inline pickers) and not a
 * read-only list (MIN-29).
 *
 * Issues, categories and objectives are read through the user's client, so RLS
 * (`can_access_project`) scopes them to my projects. Members come from the
 * service client (project_members isn't readable for other users under RLS),
 * mirroring GET /api/projects/[id]/members — the owner isn't stored in
 * project_members, so it's synthesized first from projects.owner_id.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const [issuesRes, projectsRes, categoriesRes, objectivesRes] = await Promise.all([
    auth.supabase
      .from("issues")
      .select(ISSUE_SELECT)
      .order("position", { ascending: true })
      .order("number", { ascending: true }),
    auth.supabase.from("projects").select("id, owner_id").is("deleted_at", null),
    auth.supabase.from("categories").select("*"),
    auth.supabase.from("objectives").select("*"),
  ]);

  const firstError =
    issuesRes.error || projectsRes.error || categoriesRes.error || objectivesRes.error;
  if (firstError) {
    console.error("[api/me/board] load failed:", firstError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const issues = (issuesRes.data ?? []).map(mapIssueRow);

  const categories: Record<string, Category[]> = {};
  for (const c of (categoriesRes.data ?? []) as Category[]) {
    (categories[c.project_id] ??= []).push(c);
  }

  const objectives: Record<string, Objective[]> = {};
  for (const o of (objectivesRes.data ?? []) as Objective[]) {
    (objectives[o.project_id] ??= []).push(o);
  }

  // Members: owner (from projects) + collaborators (from project_members), all
  // resolved to display names/avatars via the auth admin API.
  const projectRows = (projectsRes.data ?? []) as {
    id: string;
    owner_id: string;
  }[];
  const projectIds = projectRows.map((p) => p.id);

  const service = getServiceClient();
  const { data: memberRows } = projectIds.length
    ? await service
        .from("project_members")
        .select("project_id, user_id, role")
        .in("project_id", projectIds)
        .order("created_at", { ascending: true })
    : { data: [] as { project_id: string; user_id: string }[] };

  const usersById = await fetchAuthUsersById(service, [
    ...projectRows.map((p) => p.owner_id),
    ...(memberRows ?? []).map((m) => m.user_id as string),
  ]);

  const members: Record<string, Member[]> = {};
  for (const p of projectRows) {
    members[p.id] = [
      {
        user_id: p.owner_id,
        ...toNamed(usersById.get(p.owner_id)),
        role: "owner",
        is_owner: true,
      },
    ];
  }
  for (const m of (memberRows ?? []) as { project_id: string; user_id: string }[]) {
    (members[m.project_id] ??= []).push({
      user_id: m.user_id,
      ...toNamed(usersById.get(m.user_id)),
      role: "member",
      is_owner: false,
    });
  }

  return NextResponse.json({ issues, members, categories, objectives });
}
