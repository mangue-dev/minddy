import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { ensureCycles, toCycleInfo, todayInTz } from "@/lib/server/cycles";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";
import type {
  BoardCycles,
  HomeSummaryIssue,
  HomeSummaryResponse,
  IssueRelation,
} from "@/lib/types";
import type { IssueStatus } from "@/lib/issue-constants";

/** Combien de cycles clos le sélecteur de dates liste (aligné sur /api/me/board). */
const PAST_CYCLES_SHOWN = 8;

/**
 * Statuts « en jeu », miroir exact du seau `open` de HomeGlobalCard : ni les
 * statuts clos (done/canceled/duplicate), ni triage — qui précède le board et
 * n'entre dans aucun des deux compteurs.
 */
const OPEN_STATUSES: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review"];

/** Colonnes d'un ticket de cycle : ce que la carte affiche ou ordonne, rien de plus. */
const CYCLE_ISSUE_COLUMNS =
  "id, project_id, number, title, status, priority, effort, cycle_id, issue_categories(category_id)";

/**
 * GET /api/me/summary — le strict nécessaire du tableau de bord (MIN-89).
 *
 * Pourquoi une route à part plutôt que GET /api/me/board : celui-ci est la charge
 * utile du *kanban* cross-projet — TOUS les tickets de TOUS mes projets, en
 * lignes complètes (description + plan, jusqu'à 64 Ko pièce), plus les relations,
 * les membres, les intégrations, les catégories et les objectifs. L'accueil, lui,
 * affiche trois compteurs et trois lignes de cycle. Elle montait donc la requête
 * la plus lourde de l'app pour en utiliser une fraction de pourcent.
 *
 * Ici : les compteurs sont des `count` SQL (aucune ligne ne remonte), et seuls
 * les tickets du cycle courant sont matérialisés, en colonnes réduites.
 *
 * Comme /api/me/board, la lecture réconcilie d'abord la timeline des cycles
 * (création/clôture/rollover/auto-remplissage — lib/server/cycles.ts), car cette
 * réconciliation DÉPLACE des tickets et la lecture doit en tenir compte.
 * Les tickets, relations et catégories passent par le client de l'utilisateur :
 * RLS (`can_access_project`) borne le tout à mes projets.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const prefs = resolveCyclePrefs(
    (auth.user.user_metadata ?? null) as Record<string, unknown> | null
  );
  let cycles: BoardCycles = { enabled: false, current: null, upcoming: [], past: [] };
  if (prefs.enabled) {
    const ensured = await ensureCycles({
      service: getServiceClient(),
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

  const currentCycleId = cycles.current?.id ?? null;

  // Compteurs : `head: true` + `count: "exact"` ne renvoie AUCUNE ligne, juste le
  // total — c'est tout l'intérêt par rapport au board, qui les comptait côté
  // client après avoir téléchargé chaque ticket.
  const countQuery = () =>
    auth.supabase.from("issues").select("id", { count: "exact", head: true });

  const [openRes, inProgressRes, mineRes, totalRes, cycleIssuesRes] = await Promise.all([
    countQuery().in("status", OPEN_STATUSES),
    countQuery().eq("status", "in_progress"),
    countQuery().in("status", OPEN_STATUSES).eq("assignee_id", auth.user.id),
    // Tous statuts confondus : l'onboarding demande « as-tu déjà créé un
    // ticket ? », auquel un ticket terminé répond oui (lib/use-onboarding.ts).
    countQuery(),
    currentCycleId
      ? auth.supabase
          .from("issues")
          .select(CYCLE_ISSUE_COLUMNS)
          .eq("cycle_id", currentCycleId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError =
    openRes.error ||
    inProgressRes.error ||
    mineRes.error ||
    totalRes.error ||
    cycleIssuesRes.error;
  if (firstError) {
    console.error("[api/me/summary] load failed:", firstError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  type CycleRow = Omit<HomeSummaryIssue, "category_ids"> & {
    issue_categories?: { category_id: string }[] | null;
  };
  const cycleIssues: HomeSummaryIssue[] = ((cycleIssuesRes.data ?? []) as CycleRow[]).map(
    ({ issue_categories, ...rest }) => ({
      ...rest,
      category_ids: (issue_categories ?? []).map((c) => c.category_id),
    })
  );

  // Ordre « reco » de la carte : un ticket est bloqué par des tickets qui, eux,
  // peuvent être HORS du cycle. On ne remonte donc que les relations qui touchent
  // un ticket du cycle, puis le statut des tickets d'en face — au lieu de tout le
  // graphe et de tous les statuts du board.
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
      const { data: statusRows } = await auth.supabase
        .from("issues")
        .select("id, status")
        .in("id", counterpartIds);
      for (const row of (statusRows ?? []) as { id: string; status: IssueStatus }[]) {
        blockerStatuses[row.id] = row.status;
      }
    }
  }

  const body: HomeSummaryResponse = {
    counts: {
      open: openRes.count ?? 0,
      inProgress: inProgressRes.count ?? 0,
      mine: mineRes.count ?? 0,
      total: totalRes.count ?? 0,
    },
    cycles,
    cycleIssues,
    relations,
    blockerStatuses,
  };
  return NextResponse.json(body);
}
