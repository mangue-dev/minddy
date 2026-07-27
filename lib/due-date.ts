// Shared parsing/formatting for issue due dates and objective target dates.
// Both are stored as ISO timestamps (timestamptz) so they can carry an hour —
// but legacy rows may still be a bare "YYYY-MM-DD". Both parse to a local Date
// here so the whole UI renders them uniformly.

/** Une valeur héritée « YYYY-MM-DD » : un jour calendaire, sans heure ni
    fuseau. Exporté parce que lib/due-soon.ts doit reconnaître la même forme. */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a stored due/target value into a local Date, or null when unset/invalid. */
export function parseDueDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // A bare date is local midnight; a full ISO string carries its own offset.
  const d = DATE_ONLY.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whether the value carries a meaningful time (i.e. not local midnight). */
export function dueDateHasTime(d: Date): boolean {
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

/**
 * Is the deadline behind us? A dated *hour* is late once it has passed; a bare
 * day is late only once the day is over — otherwise every issue due today would
 * render as overdue from midnight on.
 */
export function isDueDateOverdue(d: Date, now: number = Date.now()): boolean {
  if (dueDateHasTime(d)) return d.getTime() < now;
  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() < now;
}

/* ── Échéance en relatif ─────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Minuit local du jour d'une date — le repère des comptes en JOURS. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Jours calendaires entre deux instants, dans le fuseau du navigateur.
    `Math.round` absorbe les journées de 23 h ou 25 h des changements d'heure. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to) - startOfLocalDay(from)) / DAY_MS);
}

/**
 * Ce qu'il y a à DIRE d'une échéance, en relatif — la mise en mots (et sa
 * traduction) reste au composant.
 *
 * `named` couvre hier / aujourd'hui / demain, les trois jours qui ont un nom :
 * on les nomme plutôt que de les compter, en ajoutant l'heure si le ticket en
 * porte une (« demain à 14:00 »). Au-delà, `counted` donne un écart.
 */
export type RelativeDue =
  | { kind: "named"; day: "yesterday" | "today" | "tomorrow"; time: Date | null }
  | { kind: "counted"; days: number; hours: number; past: boolean };

/**
 * L'écart entre maintenant et une échéance, prêt à être mis en mots.
 *
 * Deux unités de mesure cohabitent, et c'est voulu : une échéance SANS heure se
 * compte en jours calendaires (une échéance au 30 est « dans 3 jours » le 27,
 * quelle que soit l'heure qu'il est), tandis qu'une échéance AVEC heure se
 * compte en durée réelle, ce qui permet le « dans 2 jours et 3 heures » qu'un
 * compte de jours seul ne saurait pas dire.
 */
export function relativeDue(d: Date, now: Date = new Date()): RelativeDue {
  const time = dueDateHasTime(d) ? d : null;
  const days = calendarDaysBetween(now, d);

  if (days >= -1 && days <= 1) {
    const day = days === 0 ? "today" : days === 1 ? "tomorrow" : "yesterday";
    return { kind: "named", day, time };
  }

  // Sans heure, la durée réelle mentirait : à 14 h, une échéance à J+3 est à
  // 2 jours et 10 heures de minuit, mais elle reste « dans 3 jours ».
  if (!time) return { kind: "counted", days: Math.abs(days), hours: 0, past: days < 0 };

  const diff = d.getTime() - now.getTime();
  // Arrondir à l'heure AVANT de découper, jamais après : tronquer dirait « dans
  // 2 jours et 2 heures » d'une échéance à 2 j 2 h 59, et arrondir les heures
  // seules pourrait produire un « 2 jours et 24 heures » qui n'existe pas.
  const hoursLeft = Math.round(Math.abs(diff) / HOUR_MS);
  return {
    kind: "counted",
    days: Math.floor(hoursLeft / 24),
    hours: hoursLeft % 24,
    past: diff < 0,
  };
}

/** The subset of Intl date options we use — narrow enough to stay assignable to
 *  both the DOM's `Intl.DateTimeFormatOptions` and next-intl's stricter type. */
export type DueDateFormatOptions = {
  day?: "numeric" | "2-digit";
  month?: "numeric" | "2-digit" | "short" | "long" | "narrow";
  year?: "numeric" | "2-digit";
  hour?: "numeric" | "2-digit";
  minute?: "numeric" | "2-digit";
};

/**
 * Intl options for rendering a due date. `compact` drops the year (for tight
 * spots like the card chip); the time is appended only when it isn't midnight,
 * so legacy date-only values stay clean.
 */
export function dueDateFormat(
  d: Date,
  opts: { compact?: boolean } = {},
): DueDateFormatOptions {
  const base: DueDateFormatOptions = opts.compact
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" };
  return dueDateHasTime(d)
    ? { ...base, hour: "2-digit", minute: "2-digit" }
    : base;
}
