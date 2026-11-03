import {
  createAllStartupTiming,
  measureAllStartupPhase,
  type AllStartupTiming,
} from "@/lib/server/all-startup-timing";
import { loadGlobalBoardIssues, parseIssueStatusesParam } from "@/lib/server/global-board-issues";
import { categoryStore } from "@/lib/server/category-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAuthedUserWithRlsReads } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeIntegrationField } from "@/lib/server/integration-content";
import { buildMembersByProject } from "@/lib/server/project-members";
import { mapIssueRow } from "@/lib/server/issue-mapper";
import { ensureCycles, toCycleInfo, todayInTz } from "@/lib/server/cycles";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";
import type { IssueStatus } from "@/lib/issue-constants";
import type {
  BoardCycles,
  Category,
  IntegrationRef,
  IssueRelation,
  Objective,
} from "@/lib/types";

/** How many closed cycles the header's date-selector lists. */
const PAST_CYCLES_SHOWN = 8;

function cyclePrefsOf(user: User) {
  return resolveCyclePrefs(
    (user.user_metadata ?? null) as Record<string, unknown> | null
  );
}

/**
 * The board's RLS reads. They use the user's client only, never the service
 * role. Cycle reconciliation writes only cycles and issues, so every read but
 * the issues one can run while it does; `issues` is null when it must wait.
 */
function readBoardRows(supabase: SupabaseClient, actorId: string, timing: AllStartupTiming | undefined, withIssues: boolean,
  statuses: readonly IssueStatus[] | undefined) {
  // `Promise.resolve` sends each query now: a builder only runs once awaited.
  return {
    issues: withIssues ? readBoardIssues(supabase, actorId, timing, statuses) : null,
    projects: Promise.resolve(measureAllStartupPhase(timing, "projects", () => supabase.from("projects").select("id, owner_id").is("deleted_at", null))),
    categories: Promise.resolve(measureAllStartupPhase(timing, "categories", () => categoryStore(supabase, actorId).select("*").order("position"))),
    objectives: Promise.resolve(measureAllStartupPhase(timing, "objectives", () => objectiveStore(supabase).select("*"))),
    // ALL relation types: `blocks` feeds the cycle reco ordering, and the
    // full set powers the cards' relation chips + the side panel (RLS scopes
    // the rows to my projects).
    relations: Promise.resolve(measureAllStartupPhase(timing, "relations", () => supabase
      .from("issue_relations")
      .select("id, source_id, target_id, type, source_type, target_type"))),
  };
}

function readBoardIssues(supabase: SupabaseClient, actorId: string, timing: AllStartupTiming | undefined,
  statuses: readonly IssueStatus[] | undefined) {
  return Promise.resolve(measureAllStartupPhase(timing, "issues", () => loadGlobalBoardIssues(supabase, actorId, timing, statuses)));
}

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
 *
 * `?statuses=` narrows the issue slice only (lib/global-board-reads.ts): the
 * board paints its open columns from this response while GET /api/me/issues
 * reads the other statuses beside it.
 */
export async function GET(request: NextRequest) {
  const timing = createAllStartupTiming(request);
  const filter = parseIssueStatusesParam(new URL(request.url).searchParams);
  // The RLS reads overlap the live session check; the response and every
  // service-role read still wait for it. With cycles, the issues read waits
  // for the reconciliation, which writes through the service client.
  const auth = await measureAllStartupPhase(timing, "auth", () => getAuthedUserWithRlsReads(request,
    ({ user, supabase }) => filter
      ? Promise.resolve(readBoardRows(supabase, user.id, timing, !cyclePrefsOf(user).enabled, filter.statuses))
      : null));
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  if (!filter) return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  const service = getServiceClient();
  const rows = (await auth.reads) ?? readBoardRows(auth.supabase, auth.user.id, timing, !cyclePrefsOf(auth.user).enabled, filter.statuses);

  // Members and integrations need only the authorized project ids: they start
  // as soon as the projects read lands, beside the other reads.
  const people = rows.projects.then(async (projectsRes) => {
    if (projectsRes.error) return null;
    const projectRows = (projectsRes.data ?? []) as { id: string; owner_id: string }[];
    const projectIds = projectRows.map((project) => project.id);
    // Integrations across my projects — feeds the cross-project integration
    // filter (issues carry integration_id). Read via the service client like
    // members, then bucketed by project. Kind and revocation state let the client
    // hide integrations that cannot match a living board ticket.
    const [{ members }, { data: integrationRows }] = await Promise.all([
      // Owner (from projects) + collaborators (from project_members), resolved
      // to display names/avatars via the auth admin API (shared helper —
      // GET /api/me/search-index builds the same map for the command palette).
      measureAllStartupPhase(timing, "members", () => buildMembersByProject(service, projectRows, timing)),
      measureAllStartupPhase<{ data: IntegrationRef[] | null }>(timing, "integrations", () => projectIds.length
        ? service
            .from("integrations")
            .select("id, name, project_id, kind, revoked_at")
            .in("project_id", projectIds)
            .order("id", { ascending: true })
        : Promise.resolve({ data: [] as IntegrationRef[] })),
    ]);
    return { members, integrationRows };
  });
  // A failed projects read answers 500 below; nothing awaits `people` then.
  people.catch(() => {});

  // Cycles first: the reconciliation may move issues around (rollover,
  // auto-fill), and the issues read below must reflect it.
  const prefs = cyclePrefsOf(auth.user);
  let cycles: BoardCycles = { enabled: false, current: null, upcoming: [], past: [] };
  let issuesRead = rows.issues;
  if (prefs.enabled) {
    const ensured = await measureAllStartupPhase(timing, "cycles", () => ensureCycles({
      service,
      userId: auth.user.id,
      prefs,
      today: todayInTz(request.nextUrl.searchParams.get("tz")),
    }));
    cycles = {
      enabled: true,
      current: ensured.current ? toCycleInfo(ensured.current) : null,
      upcoming: ensured.upcoming.map(toCycleInfo),
      past: ensured.past.slice(0, PAST_CYCLES_SHOWN).map(toCycleInfo),
    };
    issuesRead = readBoardIssues(auth.supabase, auth.user.id, timing, filter.statuses);
  }

  const [issuesRes, projectsRes, categoriesRes, objectivesRes, relationsRes] =
    await Promise.all([issuesRead!, rows.projects, rows.categories, rows.objectives, rows.relations]);

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
  for (const c of (categoriesRes.data ?? []) as unknown as Category[]) {
    (categories[c.project_id] ??= []).push(c);
  }

  const objectives: Record<string, Objective[]> = {};
  for (const o of (objectivesRes.data ?? []) as Objective[]) {
    (objectives[o.project_id] ??= []).push(o);
  }

  const { members, integrationRows } = (await people)!;

  const integrations: Record<string, IntegrationRef[]> = {};
  await measureAllStartupPhase(timing, "integrations_decode", async () => {
    const decoded = await Promise.all(((integrationRows ?? []) as IntegrationRef[]).map(
      async (row) => ({...row, name:(await decodeIntegrationField(row,"name",row.name))!})));
    for (const row of decoded) (integrations[row.project_id] ??= []).push(row);
  });
  for(const rows of Object.values(integrations))
    rows.sort((a,b)=>a.name.localeCompare(b.name));

  const relations = (relationsRes.data ?? []) as IssueRelation[];

  const serialize = () => NextResponse.json({
    issues,
    members,
    categories,
    objectives,
    integrations,
    relations,
    cycles,
  });
  const response = timing ? timing.sync("json", serialize) : serialize();
  return timing ? timing.decorate(response) : response;
}
