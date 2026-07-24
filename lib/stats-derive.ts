import type { HeatmapDay, StatProjectBucket } from "./types";

/** Nombre → chaîne localisée (virgule FR, point EN), 1 décimale par défaut. */
export function fmtNum(value: number, locale: string, digits = 1): string {
  return value.toLocaleString(locale, { maximumFractionDigits: digits });
}

/** Durée de complétion lisible : minutes < 90 min, heures < 48 h, sinon jours.
 *  Renvoie la clé de message d'unité + la valeur déjà arrondie. */
export function durationParts(seconds: number): {
  key: "durationMinutes" | "durationHours" | "durationDays";
  value: number;
} {
  const minutes = seconds / 60;
  if (minutes < 90) return { key: "durationMinutes", value: Math.round(minutes) };
  const hours = seconds / 3600;
  if (hours < 48) return { key: "durationHours", value: Math.round(hours * 10) / 10 };
  return { key: "durationDays", value: Math.round((seconds / 86400) * 10) / 10 };
}

/** Streak courant (jours consécutifs finissant à aujourd'hui, avec grâce si le
 *  jour courant est encore vide) + record sur la fenêtre. */
export function computeStreaks(days: HeatmapDay[]): {
  current: number;
  longest: number;
} {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i === days.length - 1) continue; // aujourd'hui vide : pas de rupture
    else break;
  }
  return { current, longest };
}

/** Totaux de la fenêtre de la heatmap (les 12 derniers mois), pour donner un
 *  chiffre de tête à la grille de carrés plutôt que de la laisser sans échelle. */
export function heatmapTotals(days: HeatmapDay[]): {
  total: number;
  issues: number;
  tasks: number;
  activeDays: number;
} {
  let total = 0;
  let issues = 0;
  let tasks = 0;
  let activeDays = 0;
  for (const d of days) {
    total += d.count;
    issues += d.issues;
    tasks += d.tasks;
    if (d.count > 0) activeDays++;
  }
  return { total, issues, tasks, activeDays };
}

/** Part d'un projet dans le total des tickets terminés, en % entier (0 si le
 *  total est nul). Sert le libellé, pas la largeur de barre — celle-ci se
 *  compare au plus gros projet pour rester lisible quand tout est petit. */
export function projectShare(bucket: StatProjectBucket, total: number): number {
  if (total <= 0) return 0;
  return Math.round((bucket.completed / total) * 100);
}

/** Total des tickets terminés tous projets confondus (base des parts). */
export function projectsTotal(buckets: StatProjectBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.completed, 0);
}

/**
 * Jour calendaire (YYYY-MM-DD) d'un instant ISO dans le fuseau `tz`.
 *
 * Sert à situer la date d'inscription sur la heatmap : en passant `heatmap.tz`,
 * on refait EXACTEMENT le bucketing que le serveur applique aux événements
 * (`to_char((occurred_at at time zone p_tz)::date, ...)`), donc la case marquée
 * est bien celle du bon jour, y compris pour un compte créé à 23 h à Paris.
 * `en-CA` est le raccourci habituel pour obtenir un ISO court via Intl.
 */
export function dayInZone(
  iso: string | null | undefined,
  tz: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(date);
  }
}
