/**
 * La CADENCE d'une routine (MIN-185) : quand elle repasse, et comment le dire.
 *
 * Logique PURE, partagée client + serveur (aucun import server-only) : le
 * wizard calcule le premier passage pour le montrer AVANT de créer, la fabrique
 * le calcule pour l'écrire, et le cron le recalcule à chaque réarmement. Une
 * seule fonction pour les trois, sinon l'écran promet une heure que la base ne
 * tient pas.
 *
 * **Structurée, pas une expression cron** : `frequency` + heure + minute + jour
 * + fuseau IANA. Une expression cron serait à écrire par l'utilisateur,
 * illisible dans l'UI, et à traduire quand même pour l'afficher.
 *
 * **Le fuseau est toujours explicite** — « 9 h » n'a pas de sens sans lui — et
 * un fuseau inconnu est REFUSÉ, jamais silencieusement ramené à UTC : une
 * routine qui part trois heures trop tôt tous les matins ne se remarque que sur
 * la facture. C'est l'écart avec `lib/due-soon.ts`, qui retombe sur UTC parce
 * qu'il ne fait que ranger un ticket dans une colonne.
 */

export type RoutineFrequency = "daily" | "weekly" | "monthly";

export const ROUTINE_FREQUENCIES: RoutineFrequency[] = ["daily", "weekly", "monthly"];

export function isRoutineFrequency(value: unknown): value is RoutineFrequency {
  return typeof value === "string" && (ROUTINE_FREQUENCIES as string[]).includes(value);
}

export interface RoutineSchedule {
  frequency: RoutineFrequency;
  /** 0–23, dans `timezone`. */
  hour: number;
  /** 0–59, dans `timezone`. */
  minute: number;
  /**
   * Les jours de semaine retenus, 0 = dimanche … 6 = samedi. `weekly`
   * seulement, et au moins un — une cadence hebdomadaire sans jour n'a aucune
   * occurrence. PLUSIEURS : « le lundi et le jeudi » est une cadence aussi
   * légitime que « le lundi », et la traiter comme un cas à part aurait
   * dédoublé le calcul du prochain passage.
   */
  weekdays?: number[] | null;
  /**
   * Les jours du mois retenus, 1–31. `monthly` seulement, au moins un. Un 31
   * sur un mois court retombe sur son dernier jour — et si un autre jour de la
   * liste tombe au même endroit, l'occurrence ne compte qu'une fois.
   */
  daysOfMonth?: number[] | null;
  /** Fuseau IANA (« Europe/Paris »). Jamais deviné. */
  timezone: string;
}

/** Levée par `nextRunAt` et `assertSchedule` — refus, jamais repli silencieux. */
export class RoutineScheduleError extends Error {
  constructor(readonly code: RoutineScheduleErrorCode) {
    super(code);
    this.name = "RoutineScheduleError";
  }
}

export type RoutineScheduleErrorCode =
  | "invalidFrequency"
  | "invalidHour"
  | "invalidMinute"
  | "invalidWeekday"
  | "invalidDayOfMonth"
  | "unknownTimezone";

/** Le fuseau est-il connu d'`Intl` ? (Un nom bricolé lève dans le formateur.) */
export function isKnownTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Valide la cadence, et refuse les incohérences de FORME autant que de valeur :
 * un `weekday` sur une cadence mensuelle est une cadence dont personne ne sait
 * dire ce qu'elle veut. C'est un refus et pas un champ ignoré — un champ ignoré
 * fait croire à l'appelant qu'il a été entendu.
 */
export function assertSchedule(schedule: RoutineSchedule): void {
  if (!isRoutineFrequency(schedule.frequency)) {
    throw new RoutineScheduleError("invalidFrequency");
  }
  if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23) {
    throw new RoutineScheduleError("invalidHour");
  }
  if (!Number.isInteger(schedule.minute) || schedule.minute < 0 || schedule.minute > 59) {
    throw new RoutineScheduleError("invalidMinute");
  }
  const weekdays = schedule.weekdays ?? [];
  const daysOfMonth = schedule.daysOfMonth ?? [];
  if (schedule.frequency === "weekly") {
    if (
      weekdays.length === 0 ||
      weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    ) {
      throw new RoutineScheduleError("invalidWeekday");
    }
  } else if (weekdays.length > 0) {
    throw new RoutineScheduleError("invalidWeekday");
  }
  if (schedule.frequency === "monthly") {
    if (
      daysOfMonth.length === 0 ||
      daysOfMonth.some((d) => !Number.isInteger(d) || d < 1 || d > 31)
    ) {
      throw new RoutineScheduleError("invalidDayOfMonth");
    }
  } else if (daysOfMonth.length > 0) {
    throw new RoutineScheduleError("invalidDayOfMonth");
  }
  if (!isKnownTimezone(schedule.timezone)) {
    throw new RoutineScheduleError("unknownTimezone");
  }
}

/** Les champs d'un instant, LUS dans un fuseau (le pendant de `getUTC*`). */
interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = dimanche … 6 = samedi. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // `hour12: false` rend minuit « 24 » sur certaines ICU : on le ramène à 0.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** Décalage du fuseau à cet instant, en millisecondes (positif à l'est). */
function offsetMs(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // La milliseconde ne traverse pas `formatToParts` : on la remet, sinon
  // l'offset porterait un résidu sous la seconde.
  return asUtc - (at.getTime() - at.getMilliseconds());
}

/**
 * L'instant UTC où l'horloge de `timeZone` affiche cette date et cette heure.
 *
 * Deux passes, et c'est le changement d'heure qui les impose : le décalage à
 * appliquer dépend de l'instant qu'on cherche, qu'on ne connaît pas encore. La
 * première passe donne un candidat, la seconde le corrige avec le décalage
 * VRAI de ce candidat. Aux deux bascules annuelles :
 *  - heure inexistante (le printemps saute 2 h → 3 h) : le résultat retombe
 *    après le saut, soit la première heure qui existe — jamais la veille ;
 *  - heure doublée (l'automne rejoue 2 h → 3 h) : on retient la PREMIÈRE
 *    occurrence, celle que l'horloge affiche en premier.
 */
function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = new Date(wanted - offsetMs(new Date(wanted), timeZone));
  return new Date(wanted - offsetMs(firstGuess, timeZone));
}

/** Nombre de jours du mois (1-indexé) — pour ramener un 31 sur un mois court. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Le PROCHAIN passage, strictement après `from`.
 *
 * « Strictement » est la règle : appelée avec `from` exactement sur l'échéance
 * — ce que fait le cron au moment de réarmer — elle AVANCE d'une période. Sans
 * ça, une routine réarmée sur elle-même repartirait en boucle au tour suivant.
 *
 * Le calcul se fait sur l'horloge LOCALE du fuseau, pas en ajoutant des
 * millisecondes : « tous les lundis à 9 h » reste 9 h de part et d'autre du
 * changement d'heure, ce qu'un `+7 × 86 400 000` ne tient pas.
 */
export function nextRunAt(schedule: RoutineSchedule, from: Date): Date {
  assertSchedule(schedule);
  const tz = schedule.timezone;
  const now = zonedParts(from, tz);

  if (schedule.frequency === "daily") {
    // Aujourd'hui à l'heure dite, sinon demain. On repart de la date locale et
    // on ajoute des JOURS de calendrier, jamais 24 h.
    for (let add = 0; add <= 2; add++) {
      const d = new Date(Date.UTC(now.year, now.month - 1, now.day + add));
      const at = zonedTimeToUtc(
        tz,
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
        schedule.hour,
        schedule.minute,
      );
      if (at.getTime() > from.getTime()) return at;
    }
    // Inatteignable : deux jours d'avance couvrent tous les décalages.
    throw new RoutineScheduleError("invalidFrequency");
  }

  if (schedule.frequency === "weekly") {
    // Plusieurs jours possibles : on regarde CHAQUE jour retenu, on garde la
    // première occurrence à venir. Deux semaines d'horizon suffisent (le pire
    // cas est « aujourd'hui, mais l'heure est passée »).
    const targets = [...new Set(schedule.weekdays as number[])];
    let best: Date | null = null;
    for (const target of targets) {
      let delta = (target - now.weekday + 7) % 7;
      for (let attempt = 0; attempt < 2; attempt++) {
        const d = new Date(Date.UTC(now.year, now.month - 1, now.day + delta));
        const at = zonedTimeToUtc(
          tz,
          d.getUTCFullYear(),
          d.getUTCMonth() + 1,
          d.getUTCDate(),
          schedule.hour,
          schedule.minute,
        );
        if (at.getTime() > from.getTime()) {
          if (!best || at.getTime() < best.getTime()) best = at;
          break;
        }
        delta += 7;
      }
    }
    if (!best) throw new RoutineScheduleError("invalidWeekday");
    return best;
  }

  // Mensuel : chaque jour demandé, ramené au dernier jour des mois plus courts —
  // « le 31 » sur février veut dire la fin de février, pas « on saute ce mois ».
  // Deux jours de la liste peuvent donc tomber au MÊME endroit (30 et 31 en
  // février) : c'est une occurrence, pas deux, et prendre le minimum le règle
  // sans avoir à dédoublonner.
  const wantedDays = [...new Set(schedule.daysOfMonth as number[])];
  for (let add = 0; add <= 2; add++) {
    const year = now.year + Math.floor((now.month - 1 + add) / 12);
    const month = ((now.month - 1 + add) % 12) + 1;
    const last = daysInMonth(year, month);
    let best: Date | null = null;
    for (const wanted of wantedDays) {
      const at = zonedTimeToUtc(
        tz,
        year,
        month,
        Math.min(wanted, last),
        schedule.hour,
        schedule.minute,
      );
      if (at.getTime() > from.getTime() && (!best || at.getTime() < best.getTime())) {
        best = at;
      }
    }
    if (best) return best;
  }
  throw new RoutineScheduleError("invalidDayOfMonth");
}

/**
 * Traduit une cadence en une phrase, avec le catalogue i18n de l'appelant.
 *
 * Elle sert au récapitulatif du wizard ET à l'en-tête de la routine : la MÊME
 * fonction, sinon les deux surfaces finissent par dire deux choses de la même
 * routine. Les trois messages portent des placeholders (`{time}`, `{weekday}`,
 * `{day}`, `{timezone}`) — ils s'appellent donc avec leurs valeurs.
 */
export function describeSchedule(
  schedule: RoutineSchedule,
  t: (
    key:
      | "cadenceDaily"
      | "cadenceWeekly"
      | "cadenceMonthly"
      | "cadenceDailyShort"
      | "cadenceWeeklyShort"
      | "cadenceMonthlyShort",
    values: Record<string, string | number>,
  ) => string,
  opts?: {
    weekdayLabel?: (weekday: number) => string;
    locale?: string;
    /**
     * Sans le fuseau — la version de la COLONNE. « (Europe/Paris) » y prend
     * plus de place que la cadence elle-même, sur une ligne qui doit se
     * parcourir du regard. Le fuseau se lit dans la routine, où il compte
     * vraiment : c'est là qu'on vérifie à quelle heure elle part.
     */
    omitTimezone?: boolean;
  },
): string {
  const time = formatTimeOfDay(schedule.hour, schedule.minute, opts?.locale);
  const short = opts?.omitTimezone === true;
  if (schedule.frequency === "daily") {
    return short
      ? t("cadenceDailyShort", { time })
      : t("cadenceDaily", { time, timezone: schedule.timezone });
  }
  if (schedule.frequency === "weekly") {
    // Les jours DANS L'ORDRE de la semaine, quel que soit l'ordre où ils ont
    // été cochés — « lundi et jeudi », jamais « jeudi et lundi ».
    const days = sortedWeekdays(schedule.weekdays);
    const weekday = joinList(
      days.map((d) => opts?.weekdayLabel?.(d) ?? weekdayName(d, opts?.locale)),
      opts?.locale,
    );
    return short
      ? t("cadenceWeeklyShort", { weekday, time })
      : t("cadenceWeekly", { weekday, time, timezone: schedule.timezone });
  }
  const days = [...new Set(schedule.daysOfMonth ?? [1])].sort((a, b) => a - b);
  const day = joinList(days.map(String), opts?.locale);
  return short
    ? t("cadenceMonthlyShort", { day, time })
    : t("cadenceMonthly", { day, time, timezone: schedule.timezone });
}

/**
 * Les jours de semaine triés dans l'ordre où la SEMAINE les présente — lundi
 * d'abord, dimanche à la fin —, et non dans l'ordre 0–6 d'`Intl`, qui ferait
 * commencer la liste par dimanche.
 */
export function sortedWeekdays(weekdays: number[] | null | undefined): number[] {
  const rank = (d: number) => (d + 6) % 7;
  return [...new Set(weekdays ?? [1])].sort((a, b) => rank(a) - rank(b));
}

/** « lundi, mardi et jeudi » — la conjonction est celle de la langue. */
function joinList(parts: string[], locale?: string): string {
  if (parts.length <= 1) return parts[0] ?? "";
  try {
    return new Intl.ListFormat(locale || "en-US", {
      style: "long",
      type: "conjunction",
    }).format(parts);
  } catch {
    return parts.join(", ");
  }
}

/** « 09:00 » / « 9:00 AM » selon la locale — l'heure telle qu'on la lit. */
export function formatTimeOfDay(hour: number, minute: number, locale?: string): string {
  // Le 4 janvier 1970 est un dimanche en UTC : n'importe quelle date fait
  // l'affaire, seule l'heure est formatée.
  const at = new Date(Date.UTC(1970, 0, 4, hour, minute));
  return new Intl.DateTimeFormat(locale || "en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/** Le nom du jour de semaine dans la langue de l'utilisateur. */
export function weekdayName(weekday: number, locale?: string): string {
  // 4 janvier 1970 = dimanche : +weekday donne le bon jour.
  const at = new Date(Date.UTC(1970, 0, 4 + (weekday % 7)));
  return new Intl.DateTimeFormat(locale || "en-US", {
    timeZone: "UTC",
    weekday: "long",
  }).format(at);
}

/**
 * Le nom du jour, capitale en tête — la forme d'un LIBELLÉ de champ (« Lundi »),
 * qui n'est pas celle d'un mot DANS une phrase (« chaque lundi »). Le français
 * écrit les jours en minuscule au fil du texte : capitaliser partout aurait
 * abîmé la phrase de cadence pour arranger le sélecteur.
 */
export function weekdayLabel(weekday: number, locale?: string): string {
  const name = weekdayName(weekday, locale);
  return name.charAt(0).toLocaleUpperCase(locale || "en-US") + name.slice(1);
}

/** Le fuseau du navigateur, ou UTC hors navigateur (le wizard le préremplit). */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
