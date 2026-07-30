import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSED_STATUSES } from "@/lib/server/issue-reads";
import { EFFORTS } from "@/lib/issue-constants";
import type {
  HeatmapDay,
  StatsCycleEffort,
  StatsCycles,
  StatsWeek,
  StatsWorkload,
  UserStats,
} from "@/lib/types";

/** Forme brute renvoyée par la fonction SQL get_user_stats. */
interface RawStats {
  totals: {
    created: number;
    completed: number;
    projects: number;
    tasks_completed: number;
  };
  per_project: Array<{
    name: string | null;
    color: string | null;
    deleted: boolean;
    created: number;
    completed: number;
  }>;
  days: Array<{ date: string; count: number; issues: number; tasks: number }>;
}

/** Forme brute renvoyée par la fonction SQL get_cycle_stats (MIN-58). */
interface RawCycleStats {
  avg_completion_offset_days: number | null;
  completion_offset_sample: number | null;
  avg_issues_per_cycle: number | null;
  cycle_count: number | null;
  by_effort: Array<{
    effort: StatsCycleEffort["effort"];
    avg_seconds: number | null;
    sample: number | null;
  }>;
}

/** Ordre d'affichage des efforts (xs→xl) — indexe le tri du by_effort brut. */
const EFFORT_ORDER = new Map(EFFORTS.map((e, i) => [e.value, i] as const));

/** Nombre fini ou null (le RPC renvoie des numériques Postgres = string|number). */
function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Mappe la sortie brute du RPC cycles vers la forme cliente (MIN-58). */
function toCycles(raw: RawCycleStats | null): StatsCycles {
  const byEffort = (raw?.by_effort ?? [])
    .map((r) => ({
      effort: r.effort,
      avgSeconds: num(r.avg_seconds) ?? 0,
      sample: num(r.sample) ?? 0,
    }))
    .filter((r) => r.sample > 0 && EFFORT_ORDER.has(r.effort))
    .sort((a, b) => (EFFORT_ORDER.get(a.effort)! - EFFORT_ORDER.get(b.effort)!));
  return {
    avgCompletionOffsetDays: num(raw?.avg_completion_offset_days),
    completionOffsetSample: num(raw?.completion_offset_sample) ?? 0,
    avgIssuesPerCycle: num(raw?.avg_issues_per_cycle),
    cycleCount: num(raw?.cycle_count) ?? 0,
    byEffort,
  };
}

const DAY_MS = 86_400_000;

/** YYYY-MM-DD d'un Date pris comme minuit UTC (dates « nues », sans fuseau). */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fenêtre de la heatmap dans le fuseau `tz`, sans lib de dates :
 *   - `end`   = aujourd'hui (date locale de l'utilisateur) ;
 *   - `start` = le dimanche du bloc de 53 semaines qui se termine ce jour ;
 *   - `since` = `start` − 1 jour (marge pour ne rater aucun event de bord ;
 *               les jours antérieurs à `start` sont ignorés à la densification).
 * On calcule « aujourd'hui-en-tz » via Intl, puis on manipule des dates nues en
 * UTC (aucune dérive de fuseau puisqu'on ne raisonne qu'en jours calendaires).
 */
function heatmapWindow(tz: string): { start: string; end: string; since: string } {
  let todayStr: string;
  try {
    todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
  const today = new Date(`${todayStr}T00:00:00Z`);
  // 52 semaines en arrière, puis recul jusqu'au dimanche de cette semaine.
  const anchor = new Date(today.getTime() - 364 * DAY_MS);
  const startSunday = new Date(anchor.getTime() - anchor.getUTCDay() * DAY_MS);
  const since = new Date(startSunday.getTime() - DAY_MS);
  return { start: ymd(startSunday), end: ymd(today), since: since.toISOString() };
}

/** Densifie la série sparse du RPC en un point par jour de `start` à `end`. */
function densify(start: string, end: string, sparse: RawStats["days"]): HeatmapDay[] {
  const byDate = new Map(sparse.map((d) => [d.date, d]));
  const days: HeatmapDay[] = [];
  const endDate = new Date(`${end}T00:00:00Z`);
  for (let t = new Date(`${start}T00:00:00Z`).getTime(); t <= endDate.getTime(); t += DAY_MS) {
    const date = ymd(new Date(t));
    const hit = byDate.get(date);
    days.push({
      date,
      count: hit?.count ?? 0,
      issues: hit?.issues ?? 0,
      tasks: hit?.tasks ?? 0,
    });
  }
  return days;
}

/**
 * Élan récent, lu dans la série dense (qui se termine aujourd'hui, dans le
 * fuseau de l'utilisateur) : les 7 derniers jours, et les 7 d'avant pour la
 * tendance. Pas de requête supplémentaire — la heatmap couvre déjà l'année.
 */
function weekTotals(days: HeatmapDay[]): StatsWeek {
  const sum = (slice: HeatmapDay[], pick: (d: HeatmapDay) => number) =>
    slice.reduce((total, d) => total + pick(d), 0);
  const last = days.slice(-7);
  const previous = days.slice(-14, -7);
  return {
    completed: sum(last, (d) => d.count),
    issues: sum(last, (d) => d.issues),
    tasks: sum(last, (d) => d.tasks),
    previous: sum(previous, (d) => d.count),
  };
}

/**
 * Agrège les statistiques personnelles de l'utilisateur courant.
 * `supabase` doit être le client RLS (route handler) : le RPC est SECURITY
 * INVOKER, donc auth.uid() = l'appelant et il ne lit que ses propres lignes.
 */
export async function getUserStats(
  supabase: SupabaseClient,
  { tz, userId }: { tz: string; userId: string }
): Promise<UserStats> {
  const { start, end, since } = heatmapWindow(tz);

  const [statsRes, workloadRes, cycleRes] = await Promise.all([
    supabase.rpc("get_user_stats", { p_tz: tz, p_since: since }),
    // Charge actuelle : issues ouvertes qui me sont assignées (live, RLS scope
    // les projets accessibles). Détaché non requis — c'est un instantané du présent.
    supabase
      .from("issues")
      .select("status")
      .is("deleted_at", null)
      .eq("assignee_id", userId)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`),
    // Stats de cycle (MIN-58) : cadence, tickets/cycle, durée par effort.
    supabase.rpc("get_cycle_stats", { p_tz: tz }),
  ]);

  if (statsRes.error) throw new Error(statsRes.error.message);
  const raw = (statsRes.data ?? {}) as RawStats;

  // Best-effort : une erreur du RPC cycles (ex. fonction pas encore déployée)
  // n'invalide pas la page — on retombe sur une section cycles vide.
  if (cycleRes.error) {
    console.error("[api/stats] cycle stats failed:", cycleRes.error.message);
  }
  const cycles = toCycles(
    cycleRes.error ? null : ((cycleRes.data ?? null) as RawCycleStats | null)
  );

  const days = densify(start, end, raw.days ?? []);
  const max = days.reduce((m, d) => Math.max(m, d.count), 0);

  const assignedRows = (workloadRes.data ?? []) as Array<{ status: string }>;
  const workload: StatsWorkload = {
    assignedOpen: assignedRows.length,
    inProgress: assignedRows.filter((r) => r.status === "in_progress").length,
  };

  return {
    totals: {
      created: raw.totals?.created ?? 0,
      completed: raw.totals?.completed ?? 0,
      projects: raw.totals?.projects ?? 0,
      tasksCompleted: raw.totals?.tasks_completed ?? 0,
    },
    perProject: (raw.per_project ?? []).map((p) => ({
      name: p.name,
      color: p.color,
      deleted: p.deleted,
      created: p.created,
      completed: p.completed,
    })),
    heatmap: { tz, start, end, max, days },
    workload,
    week: weekTotals(days),
    cycles,
  };
}
