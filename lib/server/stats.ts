import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSED_STATUSES } from "@/lib/server/issue-reads";
import type { HeatmapDay, StatsWorkload, UserStats } from "@/lib/types";

/** Forme brute renvoyée par la fonction SQL get_user_stats. */
interface RawStats {
  totals: { created: number; completed: number; projects: number };
  per_project: Array<{
    name: string | null;
    color: string | null;
    deleted: boolean;
    created: number;
    completed: number;
  }>;
  days: Array<{ date: string; count: number }>;
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
  const counts = new Map(sparse.map((d) => [d.date, d.count]));
  const days: HeatmapDay[] = [];
  const endDate = new Date(`${end}T00:00:00Z`);
  for (let t = new Date(`${start}T00:00:00Z`).getTime(); t <= endDate.getTime(); t += DAY_MS) {
    const date = ymd(new Date(t));
    days.push({ date, count: counts.get(date) ?? 0 });
  }
  return days;
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

  const [statsRes, workloadRes] = await Promise.all([
    supabase.rpc("get_user_stats", { p_tz: tz, p_since: since }),
    // Charge actuelle : issues ouvertes qui me sont assignées (live, RLS scope
    // les projets accessibles). Détaché non requis — c'est un instantané du présent.
    supabase
      .from("issues")
      .select("status")
      .eq("assignee_id", userId)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`),
  ]);

  if (statsRes.error) throw new Error(statsRes.error.message);
  const raw = (statsRes.data ?? {}) as RawStats;

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
  };
}
