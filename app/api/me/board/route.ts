import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import { ensureCycles, toCycleInfo, todayInTz } from "@/lib/server/cycles";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";
import type { BoardCycles, Category, IssueRelation, Member, Objective } from "@/lib/types";

/** How many closed cycles the header's date-selector lists. */
const PAST_CYCLES_SHOWN = 8;

/**
 * GET /api/me/board — everything the cross-project "My/All" kanban needs, so it
 * can be a *real* board (drag between columns, inline pickers) and not a
 * read-only list (MIN-29).
 *
 * Issues, categories, objectives and `blocks` relations are read through the
 * user's client, so RLS (`can_access_project`) scopes them to my projects.
 * Members come from the service client (project_members isn't readable for
 * other users under RLS), mirroring GET /api/projects/[id]/members — the owner
 * isn't stored in project_members, so it's synthesized first from
 * projects.owner_id.
 *
 * Cycles (MIN-32): when the user has cycles enabled, this read lazily
 * reconciles their timeline (create/close/rollover/auto-fill — see
 * lib/server/cycles.ts) using `?tz=` to resolve the user's calendar day.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const service = getServiceClient();

  // Cycles first: the reconciliation may move issues around (rollover,
  // auto-fill), and the issues read below must reflect it.
  const prefs = resolveCyclePrefs(
    (auth.user.user_metadata ?? null) as Record<string, unknown> | null
  );
  let cycles: BoardCycles = { enabled: false, current: null, upcoming: [], past: [] };
  if (prefs.enabled) {
    const ensured = await ensureCycles({
      service,
      userId: auth.user.id,
      prefs,
      today: todayInTz(request.nextUrl.searchParams.get("tz")),
    });
    cycles = {
      enabled: true,
      current: ensured.current ? toCycleInfo(ensured.current) : null,
      upcoming: ensured.upcoming.map(toCycleInfo),
      past: ensured.past.slice(0, PAST_CYCLES_SHOWN).map(toCycleInfo),
    };
  }

  const [issuesRes, projectsRes, categoriesRes, objectivesRes, relationsRes] =
    await Promise.all([
      auth.supabase
        .from("issues")
        .select(ISSUE_SELECT)
        .order("position", { ascending: true })
        .order("number", { ascending: true }),
      auth.supabase.from("projects").select("id, owner_id").is("deleted_at", null),
      auth.supabase.from("categories").select("*"),
      auth.supabase.from("objectives").select("*"),
      // ALL relation types: `blocks` feeds the cycle reco ordering, and the
      // full set powers the cards' relation chips + the side panel (RLS scopes
      // the rows to my projects).
      auth.supabase
        .from("issue_relations")
        .select("id, source_id, target_id, type"),
    ]);

  const firstError =
    issuesRes.error ||
    projectsRes.error ||
    categoriesRes.error ||
    objectivesRes.error ||
    relationsRes.error;
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

  const relations = (relationsRes.data ?? []) as IssueRelation[];

  return NextResponse.json({ issues, members, categories, objectives, relations, cycles });
}
