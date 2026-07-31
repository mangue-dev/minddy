// Récurrence d'un ticket (MIN-136) : les cadences et le calcul de la prochaine
// échéance. Partagé client/serveur — le picker s'en sert pour annoncer la
// prochaine date, lib/server/recurrence.ts pour la poser sur l'occurrence
// suivante. Aucune dépendance : ni React, ni next-intl, ni supabase.

import { isDueDateOverdue, parseDueDate } from "./due-date";

export const RECURRENCE_CADENCES = ["daily", "weekly", "monthly", "yearly"] as const;

export type RecurrenceCadence = (typeof RECURRENCE_CADENCES)[number];

export const isRecurrenceCadence = (v: unknown): v is RecurrenceCadence =>
  typeof v === "string" && (RECURRENCE_CADENCES as readonly string[]).includes(v);

/** Cadence ou null — ce que vaut le champ dans un payload d'API. */
export const isRecurrenceOrNull = (v: unknown): v is RecurrenceCadence | null =>
  v === null || isRecurrenceCadence(v);

/**
 * L'identifiant de la SÉRIE d'un ticket : son `recurrence_series_id`, ou son
 * propre id. Le ticket d'origine ne porte pas de série — sa série, c'est lui ;
 * chaque occurrence qu'il engendre reçoit son id. Une convention plutôt qu'une
 * écriture de plus à la création, et une seule façon de grouper une série.
 */
export function seriesIdOf(issue: {
  id: string;
  recurrence_series_id?: string | null;
}): string {
  return issue.recurrence_series_id ?? issue.id;
}

const DAY_MS = 86_400_000;

/** Garde-fou de la boucle de rattrapage : elle part d'une estimation, donc
    deux ou trois tours suffisent toujours. Au-delà, une date aberrante. */
const MAX_STEPS = 64;

/**
 * L'échéance de l'occurrence suivante.
 *
 * `base` est l'échéance de l'occurrence qui vient d'être terminée : c'est elle
 * qui donne le rythme, pas la date de clôture — une revue du lundi terminée le
 * mercredi retombe bien sur le lundi suivant. Et un ticket resté ouvert trois
 * mois ne produit pas une occurrence déjà en retard : on avance d'autant de
 * cadences qu'il faut pour repasser devant `now`.
 *
 * Le quantième est CLAMPÉ : le 31 janvier + 1 mois donne le 28 février (le 29
 * les années bissextiles), pas le 3 mars comme le ferait `setUTCMonth` seul. Et
 * chaque pas se recalcule depuis `base`, jamais depuis le résultat clampé —
 * une échéance de fin de mois le reste au mois suivant.
 *
 * Le calcul travaille sur les composantes UTC, faute de connaître le fuseau de
 * qui que ce soit : minddy ne le stocke nulle part. Deux écarts en découlent,
 * assumés — l'heure murale glisse d'une heure aux changements d'heure, et le
 * clamp de fin de mois peut tomber un jour trop tard pour une échéance sans
 * heure posée à l'est de Greenwich (minuit à Paris, c'est la veille 23 h UTC).
 */
export function nextDueDate(
  base: Date,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): Date {
  return advanceFrom(base, cadence, now, 1);
}

/**
 * L'échéance de DÉPART d'une récurrence : la date choisie si elle est encore
 * devant, sinon la première occurrence à venir.
 *
 * Ce que l'utilisateur désigne dans le calendrier, c'est le rythme — « le
 * lundi », « le 3 du mois » — pas une date figée. Choisir lundi dernier en
 * hebdomadaire veut donc dire « tous les lundis », et la prochaine échéance est
 * lundi prochain : un ticket récurrent ne naît pas en retard.
 *
 * Contrairement à {@link nextDueDate}, qui avance TOUJOURS d'au moins une
 * cadence (l'occurrence terminée doit céder la place), celle-ci peut ne pas
 * bouger du tout.
 */
export function startDueDate(
  base: Date,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): Date {
  return advanceFrom(base, cadence, now, 0);
}

/**
 * Avance `base` d'au moins `minSteps` cadences, puis autant qu'il faut pour ne
 * plus être en retard — « en retard » au sens du reste de l'app
 * ({@link isDueDateOverdue}) : une échéance sans heure vaut jusqu'au bout de sa
 * journée, une échéance datée jusqu'à son heure.
 */
function advanceFrom(
  base: Date,
  cadence: RecurrenceCadence,
  now: Date,
  minSteps: number,
): Date {
  // Partir d'une estimation plutôt que de `minSteps` : sans elle, une échéance
  // vieille de dix ans en quotidien ferait quelques milliers de tours.
  let steps = Math.max(minSteps, estimateSteps(base, cadence, now));
  let next = addCadence(base, cadence, steps);
  for (let i = 0; isDueDateOverdue(next, now.getTime()) && i < MAX_STEPS; i++) {
    steps += 1;
    next = addCadence(base, cadence, steps);
  }
  return next;
}

/**
 * Les occurrences d'une série qui tombent entre `from` et `to`, `base`
 * comprise. Sert au calendrier du picker, qui montre en bleu les prochaines
 * échéances du ticket : elles sortent de la MÊME arithmétique que celle qui les
 * posera vraiment (clamp de fin de mois compris), donc ce qui est surligné est
 * exactement ce qui arrivera.
 *
 * Rien avant `base` : une récurrence ne remonte pas le temps.
 */
export function occurrencesBetween(
  base: Date,
  cadence: RecurrenceCadence,
  from: Date,
  to: Date,
  max = 64,
): Date[] {
  const out: Date[] = [];
  // Démarrer près de `from` plutôt qu'à `base` : une série vieille de dix ans
  // n'a pas à être déroulée jour par jour pour afficher un mois.
  const first = Math.max(0, estimateSteps(base, cadence, from));
  for (let i = 0; i < max * 2 && out.length < max; i++) {
    const d = addCadence(base, cadence, first + i);
    if (d.getTime() > to.getTime()) break;
    if (d.getTime() >= from.getTime()) out.push(d);
  }
  return out;
}

/** Combien de cadences séparent `base` de `now`, arrondi PAR DÉFAUT : la boucle
    d'appel n'avance que vers l'avant, elle ne doit jamais partir trop loin. */
function estimateSteps(base: Date, cadence: RecurrenceCadence, now: Date): number {
  const diff = now.getTime() - base.getTime();
  if (diff <= 0) return 0;
  switch (cadence) {
    case "daily":
      return Math.floor(diff / DAY_MS);
    case "weekly":
      return Math.floor(diff / (7 * DAY_MS));
    case "monthly":
      return (
        (now.getUTCFullYear() - base.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - base.getUTCMonth())
      );
    case "yearly":
      return now.getUTCFullYear() - base.getUTCFullYear();
  }
}

/** `base` avancée de `steps` cadences (voir le clamp du quantième ci-dessus). */
function addCadence(base: Date, cadence: RecurrenceCadence, steps: number): Date {
  const next = new Date(base.getTime());
  switch (cadence) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + steps);
      return next;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7 * steps);
      return next;
    case "monthly":
      return shiftMonths(base, steps);
    case "yearly":
      return shiftMonths(base, 12 * steps);
  }
}

/** Décale de `months` mois en gardant le quantième, clampé à la fin du mois. */
function shiftMonths(base: Date, months: number): Date {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + months;
  const day = base.getUTCDate();
  // Jour 0 du mois suivant = dernier jour du mois visé.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(base.getTime());
  next.setUTCFullYear(year, month, Math.min(day, lastDay));
  return next;
}

/**
 * La prochaine échéance à partir d'une valeur STOCKÉE (ISO, ou l'ancienne forme
 * « YYYY-MM-DD »), rendue en ISO. Null quand il n'y a pas de date de départ
 * exploitable — une récurrence sans échéance n'existe pas (l'API la refuse),
 * mais une ligne écrite avant cette règle pourrait encore traîner.
 */
export function nextDueDateISO(
  storedDueDate: string | null | undefined,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): string | null {
  const base = parseDueDate(storedDueDate);
  if (!base) return null;
  return nextDueDate(base, cadence, now).toISOString();
}

/**
 * L'échéance de départ d'une récurrence, à partir d'une valeur STOCKÉE — voir
 * {@link startDueDate}. Rendue TELLE QUELLE si elle n'est pas déjà passée, pour
 * qu'une écriture qui ne change rien n'en ait pas l'air (l'événement d'activité
 * et le format d'origine sont préservés).
 */
export function startDueDateISO(
  storedDueDate: string | null | undefined,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): string | null {
  const base = parseDueDate(storedDueDate);
  if (!base) return null;
  if (!isDueDateOverdue(base, now.getTime())) return storedDueDate ?? null;
  return startDueDate(base, cadence, now).toISOString();
}
