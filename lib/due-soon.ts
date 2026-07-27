// Fenêtre « échéance proche » du tableau de bord (MIN-96).
//
// La fenêtre n'est pas la même pour tous les tickets : elle vaut le POIDS du
// ticket, en jours — xs 1, s 2, m 3, l 5, xl 8. C'est la suite de Fibonacci que
// lib/cycle.ts utilise déjà comme points d'effort, donc on la RÉUTILISE au lieu
// de la redéclarer : un XS ne mérite l'attention que la veille, un XL doit être
// vu huit jours avant, et un ticket non estimé compte comme un M.
//
// Tout se compte en JOURS CALENDAIRES du fuseau de l'utilisateur, jamais en
// millisecondes : « il reste 1 jour » veut dire « c'est demain sur le
// calendrier », pas « dans 24 heures ». C'est aussi la convention SQL du dépôt
// pour les échéances (`(due_date at time zone p_tz)::date`, cf.
// supabase/migrations/20260804090000_cycle_stats.sql).

import { EFFORT_POINTS, effortToPoints } from "./cycle";
import { DATE_ONLY } from "./due-date";
import {
  isClosedStatus,
  type IssueEffort,
  type IssueStatus,
} from "./issue-constants";

const DAY_MS = 86_400_000;

/** La fenêtre la plus large (XL) — c'est elle qui borne le préfiltre SQL. */
export const DUE_SOON_MAX_DAYS = EFFORT_POINTS.xl;

/** Le jour calendaire d'un instant, dans un fuseau donné ("YYYY-MM-DD").
    `en-CA` est le raccourci ISO d'Intl — même recette que `todayInTz`. */
export function calendarDayInTz(date: Date, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC" }).format(date);
  } catch {
    // Fuseau inconnu (en-tête bricolé) : UTC plutôt qu'une exception.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(date);
  }
}

/** Écart en jours entre deux jours calendaires "YYYY-MM-DD" (`to` − `from`).
    Les deux passent par minuit UTC, donc aucun changement d'heure ne s'y
    glisse : un jour calendaire y fait toujours 24 h. */
export function daysBetweenDays(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/** Décale un jour calendaire de `n` jours. */
export function addDays(day: string, n: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms + n * DAY_MS).toISOString().slice(0, 10);
}

/** Le jour calendaire d'une échéance stockée, dans le fuseau de l'utilisateur. */
export function dueDateCalendarDay(
  dueDate: string,
  tz: string | null | undefined,
): string | null {
  // Une valeur héritée sans heure EST déjà un jour calendaire (la colonne était
  // un `date` avant 20260707120000) : la faire passer par un fuseau la
  // décalerait d'un jour.
  if (DATE_ONLY.test(dueDate)) return dueDate;
  const d = new Date(dueDate);
  return Number.isNaN(d.getTime()) ? null : calendarDayInTz(d, tz);
}

/** Jours restants avant l'échéance : 0 le jour même, négatif en retard.
    `null` quand la valeur stockée est illisible. */
export function daysUntilDue(
  dueDate: string,
  today: string,
  tz?: string | null,
): number | null {
  const day = dueDateCalendarDay(dueDate, tz);
  return day === null ? null : daysBetweenDays(today, day);
}

/** Le strict nécessaire pour trancher — n'importe quelle ligne de ticket s'y
    conforme (le board complet comme les colonnes réduites de la home). */
export interface DueSoonCandidate {
  due_date: string | null;
  effort: IssueEffort | null;
  status: IssueStatus;
}

/**
 * Le ticket entre-t-il dans la section ? Ouvert, daté, et à moins de jours de
 * son échéance que son effort ne pèse.
 *
 * Les tickets EN RETARD y restent : leur écart est négatif, donc toujours sous
 * la fenêtre. Les statuts clos sortent — done et canceled comme le demande la
 * spec, plus duplicate, dont l'échéance ne veut plus rien dire.
 */
export function isDueSoon(
  issue: DueSoonCandidate,
  today: string,
  tz?: string | null,
): boolean {
  if (!issue.due_date || isClosedStatus(issue.status)) return false;
  const days = daysUntilDue(issue.due_date, today, tz);
  return days !== null && days <= effortToPoints(issue.effort);
}

/**
 * Borne haute du préfiltre SQL : un instant dont on est sûr qu'il tombe APRÈS
 * la fin du dernier jour retenu, quel que soit le fuseau (±14 h au pire, d'où
 * les deux jours de marge). Le filtre exact reste `isDueSoon` — celui-ci ne
 * sert qu'à ne pas ramener toutes les échéances de la base.
 */
export function dueSoonUpperBound(today: string): string {
  return `${addDays(today, DUE_SOON_MAX_DAYS + 2)}T00:00:00.000Z`;
}
