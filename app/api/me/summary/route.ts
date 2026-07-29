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

/** Combien de cycles clos le sélecteur de dates liste (aligné sur /api/me/board). */
const PAST_CYCLES_SHOWN = 8;

/**
 * Statuts « en jeu », miroir exact du seau `open` de HomeGlobalCard : ni les
 * statuts clos (done/canceled/duplicate), ni triage — qui précède le board et
 * n'entre dans aucun des deux compteurs.
 */
const OPEN_STATUSES: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review"];

/** Colonnes d'un ticket du tableau de bord : ce que les cartes affichent ou
    ordonnent, rien de plus. */
const SUMMARY_ISSUE_COLUMNS =
  "id, project_id, number, title, status, priority, effort, due_date, cycle_id, created_at, issue_categories(category_id)";

/**
 * Combien d'échéances proches remontent au plus. La section n'en affiche qu'une
 * poignée ; le plafond n'est là que pour qu'un compte très en retard ne fasse
 * pas d'un tableau de bord une requête sans fond.
 */
const DUE_SOON_LIMIT = 50;

/**
 * Plafonds de la file « À trier » (MIN-104) : jamais la file entière — un projet
 * qui a laissé filer son triage ne doit pas alourdir le tableau de bord. La
 * section en affiche dix au plus, sur deux projets au plus ; la marge sert
 * justement à ce qu'après ce second filtre il reste de quoi remplir les dix
 * lignes. Le « +N autres » qu'elle annonce, lui, reste EXACT : `count: "exact"`
 * compte tout l'ensemble filtré, `limit` ne borne que les lignes rapatriées
 * (même requête, même prix).
 */
const TRIAGE_LIMIT = 30;
const NEW_FEEDBACK_LIMIT = 30;

/** Colonnes d'un retour de la file « À trier » — cf. HomeSummaryFeedback. */
const SUMMARY_FEEDBACK_COLUMNS = "id, project_id, title, vote_count, created_at";

type SummaryRow = Omit<HomeSummaryIssue, "category_ids"> & {
  issue_categories?: { category_id: string }[] | null;
};

/** La jointure des catégories arrive en lignes ; la home veut des ids. */
function toSummaryIssue({ issue_categories, ...rest }: SummaryRow): HomeSummaryIssue {
  return { ...rest, category_ids: (issue_categories ?? []).map((c) => c.category_id) };
}

/**
 * Retours qui attendent encore une décision d'équipe (MIN-104) : `status = 'open'`
 * — la promotion en ticket, elle, passe le post à `planned`
 * (lib/server/feedback/promote.ts) — et jamais un tombstone de merge.
 *
 * Passe par le client service : toutes les tables `feedback_*` sont RLS deny-all
 * (cf. supabase/migrations/…_feedback.sql), donc la portée « mes projets » est
 * explicite ici, à partir des ids lus, eux, sous RLS.
 *
 * Une panne de cette lecture ne rend pas 500 : le reste du tableau de bord est
 * légitime, la section se contente d'omettre les retours.
 */
async function loadNewFeedback(
  projectIds: string[]
): Promise<{ posts: HomeSummaryFeedback[]; total: number }> {
  if (projectIds.length === 0) return { posts: [], total: 0 };
  const { data, count, error } = await getServiceClient()
    .from("feedback_posts")
    .select(SUMMARY_FEEDBACK_COLUMNS, { count: "exact" })
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
 * les tickets du cycle courant — plus, depuis MIN-96, ceux dont l'échéance
 * approche — sont matérialisés, en colonnes réduites.
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

  // Le fuseau du navigateur sert deux fois : à réconcilier la timeline des
  // cycles, et à compter les jours qui restent avant une échéance (MIN-96).
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

  // Compteurs : `head: true` + `count: "exact"` ne renvoie AUCUNE ligne, juste le
  // total — c'est tout l'intérêt par rapport au board, qui les comptait côté
  // client après avoir téléchargé chaque ticket.
  const countQuery = () =>
    auth.supabase.from("issues").select("id", { count: "exact", head: true });

  const [
    openRes,
    inProgressRes,
    mineRes,
    totalRes,
    cycleIssuesRes,
    dueSoonRes,
    triageRes,
    myProjectsRes,
  ] = await Promise.all([
      countQuery().in("status", OPEN_STATUSES),
      countQuery().eq("status", "in_progress"),
      countQuery().in("status", OPEN_STATUSES).eq("assignee_id", auth.user.id),
      // Tous statuts confondus : l'onboarding demande « as-tu déjà créé un
      // ticket ? », auquel un ticket terminé répond oui (lib/use-onboarding.ts).
      countQuery(),
      currentCycleId
        ? auth.supabase
            .from("issues")
            .select(SUMMARY_ISSUE_COLUMNS)
            .eq("cycle_id", currentCycleId)
        : Promise.resolve({ data: [], error: null }),
      // Échéances proches (MIN-96) : SQL préfiltre sur la fenêtre la plus large
      // (XL, 8 jours) sans borne basse — un ticket en retard reste en retard —
      // puis isDueSoon resserre à la fenêtre propre à l'effort de chacun. Le tri
      // est déjà celui de la section : la plus vieille échéance d'abord.
      auth.supabase
        .from("issues")
        .select(SUMMARY_ISSUE_COLUMNS)
        .not("due_date", "is", null)
        .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
        .lte("due_date", dueSoonUpperBound(today))
        .order("due_date", { ascending: true })
        .limit(DUE_SOON_LIMIT),
      // File « À trier » (MIN-104) : les tickets en triage, le plus ANCIEN
      // d'abord — sur une file d'attente, ce qui a le plus patienté est ce qui
      // pourrit, et c'est donc ce que la section montre en premier.
      auth.supabase
        .from("issues")
        .select(SUMMARY_ISSUE_COLUMNS, { count: "exact" })
        .eq("status", "triage")
        .order("created_at", { ascending: true })
        .limit(TRIAGE_LIMIT),
      // Mes projets, à seule fin de borner la lecture service-role du feedback
      // (loadNewFeedback) : RLS `projects_select` = owner ∪ membre.
      auth.supabase.from("projects").select("id").is("deleted_at", null),
    ]);

  const firstError =
    openRes.error ||
    inProgressRes.error ||
    mineRes.error ||
    totalRes.error ||
    cycleIssuesRes.error ||
    dueSoonRes.error ||
    triageRes.error ||
    myProjectsRes.error;
  if (firstError) {
    console.error("[api/me/summary] load failed:", firstError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // Part maintenant (l'appel démarre la requête) et s'attend tout en bas : elle
  // recouvre ainsi la passe séquentielle des relations du cycle.
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

  const newFeedback = await newFeedbackPromise;

  const body: HomeSummaryResponse = {
    counts: {
      open: openRes.count ?? 0,
      inProgress: inProgressRes.count ?? 0,
      mine: mineRes.count ?? 0,
      total: totalRes.count ?? 0,
    },
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
