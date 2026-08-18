import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { ensureCycles, toCycleInfo, todayInTz } from "@/lib/server/cycles";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";
import { CLOSED_STATUSES } from "@/lib/issue-constants";
import { dueSoonUpperBound, isDueSoon } from "@/lib/due-soon";
import type {
  BoardCycles,
  HomeSummaryFeedback,
  HomeSummaryIssue,
  HomeSummaryResponse,
  IssueRelation,
} from "@/lib/types";
import type { IssueStatus } from "@/lib/issue-constants";

/** How many cycles the date picker lists (aligned to /api/me/board). */
const PAST_CYCLES_SHOWN = 8;

/**
 * Dashboard ticket columns: what the sections display or
 * sort, nothing more.
 *
 * `projects!inner(deleted_at)` is not a displayed column, it is the FILTER
 * from the trash: putting a project in the trash does not affect its tickets
 * (DELETE /api/projects/[id]: “its tickets, objectives and feedback do not move
 * not"), and `can_access_project` does not look at `deleted_at` — the tickets of a
 * Project thrown away therefore continue to pass RLS. The overall board protects itself from it
 * client(`scopedIssues`, components/global-board.tsx); here it must be done in
 * SQL, otherwise the “+N others” — which come from `count: "exact"` — would count
 * what the list would have ruled out. Same join as the reconciliation of
 * cycles (lib/server/cycles.ts).
 */
const SUMMARY_ISSUE_COLUMNS =
  "id, project_id, number, title, status, priority, effort, due_date, cycle_id, created_at, updated_at, issue_categories(category_id), projects!inner(deleted_at)";

/**
 * How many near deadlines are there at most? The section only displays one
 * handle ; the ceiling is only there so that a very late account does not
 * not a dashboard a bottomless request.
 */
const DUE_SOON_LIMIT = 50;

/**
 * Ceilings of the “To be sorted” queue (MIN-104): never the entire queue — a project
 * who has let his triage slide should not weigh down the dashboard. There
 * section displays ten at most, on two projects at most; the margin is used
 * precisely so that after this second filter there remains enough to fill the ten
 * lines. The “+N others” that it announces remains EXACT: `count: "exact"`
 * counts the entire filtered set, `limit` only bounds the repatriated lines
 * (same request, same price).
 */
const TRIAGE_LIMIT = 30;
const NEW_FEEDBACK_LIMIT = 30;

/** Columns of a return from the “To be sorted” queue — cf. HomeSummaryFeedback. */
const SUMMARY_FEEDBACK_COLUMNS = "id, project_id, title, vote_count, created_at";

type SummaryRow = Omit<HomeSummaryIssue, "category_ids"> & {
  issue_categories?: { category_id: string }[] | null;
  /** Jointure de filtrage seulement — cf. SUMMARY_ISSUE_COLUMNS. */
  projects?: unknown;
};

/** The joining of categories happens in lines; the house wants ids. That of
 project only serves to filter the trash and does not go down to the client. */
function toSummaryIssue({
  issue_categories,
  projects: _projects,
  ...rest
}: SummaryRow): HomeSummaryIssue {
  return { ...rest, category_ids: (issue_categories ?? []).map((c) => c.category_id) };
}

/**
 * Returns still awaiting a team decision (MIN-104): `status = 'open'`
 * — the ticket promotion passes the post to `planned`
 * (lib/server/feedback/promote.ts) — and never a merge tombstone.
 *
 * Goes through the service client: all `feedback_*` tables are RLS deny-all
 * (see supabase/migrations/…_feedback.sql), so the “my projects” scope is
 * explicit here, from the ids read under RLS.
 *
 * A failure of this reading does not make it 500: the rest of the dashboard is
 * legitimate, the section simply omits returns.
 */
async function loadNewFeedback(
  projectIds: string[]
): Promise<{ posts: HomeSummaryFeedback[]; total: number }> {
  if (projectIds.length === 0) return { posts: [], total: 0 };
  const { data, count, error } = await getServiceClient()
    .from("feedback_posts")
    .select(SUMMARY_FEEDBACK_COLUMNS, { count: "exact" })
    .is("deleted_at", null)
    .in("project_id", projectIds)
    .eq("status", "open")
    .is("merged_into_id", null)
    .order("created_at", { ascending: true })
    .limit(NEW_FEEDBACK_LIMIT);
  if (error) {
    console.error("[api/me/summary] feedback load failed:", error.message);
    return { posts: [], total: 0 };
  }
  const posts = (data ?? []) as HomeSummaryFeedback[];
  return { posts, total: count ?? posts.length };
}

/**
 * GET /api/me/summary — the bare essentials of the dashboard (MIN-89).
 *
 * Why a separate route rather than GET /api/me/board: this one is the load
 * useful cross-project *kanban* — ALL tickets from ALL my projects, in
 * complete lines (description + plan, up to 64 KB each), plus relationships,
 * members, integrations, categories and goals. The reception,
 * displays three counters and three cycle lines. So she made the request
 * the heaviest part of the app to use a fraction of a percent.
 *
 * Here: the counters are `count` SQL (no line goes up), and only
 * tickets from the current cycle — plus, since MIN-96, those whose expiry date
 * approach — are materialized, in reduced columns.
 *
 * Like /api/me/board, reading first reconciles the cycle timeline
 * (creation/closing/rollover/auto-fill — lib/server/cycles.ts), because this
 * reconciliation MOVES tickets and reading must take this into account.
 * Tickets, relationships and categories pass through the user's client:
 * RLS (`can_access_project`) limits everything to my projects.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // The browser time zone serves two purposes: to reconcile the timeline of
  // cycles, and to count the days remaining before a deadline (MIN-96).
  const tz = request.nextUrl.searchParams.get("tz");
  const today = todayInTz(tz);

  const prefs = resolveCyclePrefs(
    (auth.user.user_metadata ?? null) as Record<string, unknown> | null
  );
  let cycles: BoardCycles = { enabled: false, current: null, upcoming: [], past: [] };
  if (prefs.enabled) {
    const ensured = await ensureCycles({
      service: getServiceClient(),
      userId: auth.user.id,
      prefs,
      today,
    });
    cycles = {
      enabled: true,
      current: ensured.current ? toCycleInfo(ensured.current) : null,
      upcoming: ensured.upcoming.map(toCycleInfo),
      past: ensured.past.slice(0, PAST_CYCLES_SHOWN).map(toCycleInfo),
    };
  }

  const currentCycleId = cycles.current?.id ?? null;

  // `head: true` + `count: "exact"` returns NO rows, just the total —
  // that's the whole point in relation to the board, which counted on the client side after
  // have downloaded each ticket. Only one remains: the card that aligned
  // “open / in progress / to me” gave way to “Waiting for me”, which
  // shows lines to act on rather than numbers.
  const [totalRes, cycleIssuesRes, dueSoonRes, triageRes, myProjectsRes] =
    await Promise.all([
      // All statuses combined: onboarding asks “have you already created a
      // ticket? ”, to which a completed ticket answers yes (lib/use-onboarding.ts).
      auth.supabase
        .from("issues")
        .select("id, projects!inner(deleted_at)", { count: "exact", head: true })
        .is("projects.deleted_at", null)
        .is("deleted_at", null),
      currentCycleId
        ? auth.supabase
            .from("issues")
            .select(SUMMARY_ISSUE_COLUMNS)
            .is("projects.deleted_at", null)
            .is("deleted_at", null)
            .eq("cycle_id", currentCycleId)
        : Promise.resolve({ data: [], error: null }),
      // Close deadlines (MIN-96): SQL prefilter on the largest window
      // (XL, 8 days) with no lower bound — an overdue ticket remains overdue —
      // then isDueSoon tightens the window clean to everyone's effort. Sorting
      // is already that of the section: the oldest deadline first.
      auth.supabase
        .from("issues")
        .select(SUMMARY_ISSUE_COLUMNS)
        .is("projects.deleted_at", null)
        .is("deleted_at", null)
        .not("due_date", "is", null)
        .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
        .lte("due_date", dueSoonUpperBound(today))
        .order("due_date", { ascending: true })
        .limit(DUE_SOON_LIMIT),
      // “To be sorted” file (MIN-104): tickets in triage, the OLDEST
      // first — in a queue, the one who waited the longest is the one who
      // rots, and so this is what the section shows first.
      auth.supabase
        .from("issues")
        .select(SUMMARY_ISSUE_COLUMNS, { count: "exact" })
        .is("projects.deleted_at", null)
        .is("deleted_at", null)
        .eq("status", "triage")
        .order("created_at", { ascending: true })
        .limit(TRIAGE_LIMIT),
      // My projects, for the sole purpose of limiting the service-role reading of feedback
      // (loadNewFeedback) : RLS `projects_select` = owner ∪ membre.
      auth.supabase.from("projects").select("id").is("deleted_at", null),
    ]);

  const firstError =
    totalRes.error ||
    cycleIssuesRes.error ||
    dueSoonRes.error ||
    triageRes.error ||
    myProjectsRes.error;
  if (firstError) {
    console.error("[api/me/summary] load failed:", firstError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // Leaves now (the call starts the request) and waits at the bottom: she
  // thus covers the sequential pass of the cycle relations.
  const newFeedbackPromise = loadNewFeedback(
    ((myProjectsRes.data ?? []) as { id: string }[]).map((p) => p.id)
  );

  const cycleIssues: HomeSummaryIssue[] = (
    (cycleIssuesRes.data ?? []) as SummaryRow[]
  ).map(toSummaryIssue);

  const triage: HomeSummaryIssue[] = ((triageRes.data ?? []) as SummaryRow[]).map(
    toSummaryIssue
  );
  const triageTotal = triageRes.count ?? triage.length;

  const dueSoon: HomeSummaryIssue[] = ((dueSoonRes.data ?? []) as SummaryRow[])
    .map(toSummaryIssue)
    .filter((issue) => isDueSoon(issue, today, tz));

  // “Receipt” order of the card: a ticket is blocked by tickets which, in turn,
  // may be OUT of the cycle. We therefore only trace the relationships that affect
  // a ticket from the cycle, then the status of the tickets opposite — instead of all the
  // graph and all the statuses of the board.
  let relations: IssueRelation[] = [];
  const blockerStatuses: Record<string, IssueStatus> = {};
  const cycleIssueIds = cycleIssues.map((i) => i.id);

  if (cycleIssueIds.length > 0) {
    const list = `(${cycleIssueIds.join(",")})`;
    const { data: relationRows } = await auth.supabase
      .from("issue_relations")
      .select("id, source_id, target_id, type")
      .or(`source_id.in.${list},target_id.in.${list}`);
    relations = (relationRows ?? []) as IssueRelation[];

    const inCycle = new Set(cycleIssueIds);
    const counterpartIds = [
      ...new Set(
        relations
          .flatMap((r) => [r.source_id, r.target_id])
          .filter((id) => !inCycle.has(id))
      ),
    ];
    if (counterpartIds.length > 0) {
      // Same trash filter: a blocker in a discarded project no longer blocks
      // nothing — otherwise he would keep his ticket indefinitely at the bottom of
      // the receipt order, for a reason that has become invisible.
      const { data: statusRows } = await auth.supabase
        .from("issues")
        .select("id, status, projects!inner(deleted_at)")
        .is("projects.deleted_at", null)
        .is("deleted_at", null)
        .in("id", counterpartIds);
      for (const row of (statusRows ?? []) as { id: string; status: IssueStatus }[]) {
        blockerStatuses[row.id] = row.status;
      }
    }
  }

  const newFeedback = await newFeedbackPromise;

  const body: HomeSummaryResponse = {
    counts: { total: totalRes.count ?? 0 },
    cycles,
    cycleIssues,
    dueSoon,
    triage,
    triageTotal,
    newFeedback: newFeedback.posts,
    newFeedbackTotal: newFeedback.total,
    relations,
    blockerStatuses,
  };
  return NextResponse.json(body);
}
