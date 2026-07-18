/**
 * Fenêtre d'usage courante (MIN-72, plans annuels). La facturation peut être
 * ANNUELLE, mais l'usage se réinitialise TOUS LES MOIS : on découpe la période
 * Stripe en sous-cycles mensuels ancrés sur le jour de la période (le
 * `current_period_start`). Un abonné annuel paye une fois par an mais retrouve
 * son budget chaque mois, à la même date. Repris de la logique testée d'AutoKap.
 *
 * L'annuel est détecté par la DURÉE de la période Stripe (> 45 j), pas par une
 * config d'env : la fenêtre reste correcte même si les price IDs annuels ne
 * sont pas encore renseignés. Module pur (dates UTC), sans dépendance serveur.
 */

export interface UsageWindow {
  /** Début de la fenêtre courante (ISO). */
  start: string;
  /** Fin de la fenêtre = date du prochain reset (ISO). */
  end: string;
}

/** Au-delà de cette durée, la période Stripe est annuelle (mensuel ≤ 31 j). */
const YEARLY_MIN_PERIOD_MS = 45 * 24 * 60 * 60 * 1000;

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Date au même jour/heure que l'ancre, projetée sur (year, monthIndex), le jour
 *  clampé au dernier jour du mois cible (ex. ancre le 31 → 28/29 en février). */
function anchoredUtcDate(anchor: Date, year: number, monthIndex: number): Date {
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, monthIndex));
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

/** Début du sous-cycle mensuel courant pour un abonnement annuel. */
export function yearlyCycleStart(anchor: Date, now: Date): Date {
  let cycleStart = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth());
  if (cycleStart.getTime() > now.getTime()) {
    cycleStart = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth() - 1);
  }
  // Jamais avant le début réel de l'abonnement.
  return cycleStart.getTime() < anchor.getTime() ? new Date(anchor) : cycleStart;
}

/** Prochain reset mensuel (fin du sous-cycle courant) pour un abonnement annuel. */
export function yearlyNextReset(anchor: Date, now: Date): Date {
  let nextReset = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth());
  if (nextReset.getTime() <= now.getTime()) {
    nextReset = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth() + 1);
  }
  return nextReset;
}

/**
 * Fenêtre d'usage à partir d'une période Stripe stockée. Mensuel → la période
 * telle quelle. Annuel → le sous-cycle mensuel courant, `end` clampé à la fin
 * de la période annuelle (le renouvellement fera repartir les sous-cycles).
 */
export function resolveUsageWindow(params: {
  periodStart: string;
  periodEnd: string;
  now?: Date;
}): UsageWindow | null {
  const start = new Date(params.periodStart);
  const end = new Date(params.periodEnd);
  const now = params.now ?? new Date();

  if (!isValidDate(start) || !isValidDate(end) || end.getTime() < start.getTime()) {
    return null;
  }

  const isYearly = end.getTime() - start.getTime() > YEARLY_MIN_PERIOD_MS;
  if (!isYearly) {
    return { start: params.periodStart, end: params.periodEnd };
  }

  const cycleStart = yearlyCycleStart(start, now);
  const nextReset = yearlyNextReset(start, now);
  const clampedEnd = nextReset.getTime() > end.getTime() ? end : nextReset;
  return { start: cycleStart.toISOString(), end: clampedEnd.toISOString() };
}
