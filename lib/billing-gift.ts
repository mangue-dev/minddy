/**
 * Offrir un plan pour un temps donné — l'override admin (MIN-72) porte
 * désormais une ÉCHÉANCE.
 *
 * Rien ne vient reprendre le cadeau : l'échéance est stockée sur le compte
 * (`billing_accounts.admin_override_expires_at`) et la RÉSOLUTION du plan
 * l'ignore dès qu'elle est passée. Le droit tombe donc à la seconde près, sans
 * dépendre d'un cron ni d'un webhook — le balayage horaire
 * (`expireAdminOverrides`) ne fait que nettoyer la ligne après coup.
 *
 * Module pur (dates UTC), importable client ET serveur : l'admin choisit une
 * DURÉE, le serveur la transforme en date. Le client n'envoie jamais l'échéance
 * elle-même — c'est l'horloge du serveur qui fait foi.
 */

export const GIFT_DURATIONS = [
  "7d",
  "1m",
  "3m",
  "6m",
  "1y",
  "unlimited",
] as const;

export type GiftDuration = (typeof GIFT_DURATIONS)[number];

/** La durée proposée par défaut : « offrir un mois » est le geste courant. */
export const DEFAULT_GIFT_DURATION: GiftDuration = "1m";

/** Durées exprimées en mois de calendrier (le reste se compte en jours). */
const GIFT_MONTHS: Partial<Record<GiftDuration, number>> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function coerceGiftDuration(value: unknown): GiftDuration | null {
  return typeof value === "string" &&
    (GIFT_DURATIONS as readonly string[]).includes(value)
    ? (value as GiftDuration)
    : null;
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * `from` + n mois de calendrier, jour clampé au dernier jour du mois cible :
 * un mois offert le 31 janvier finit le 28 février, pas le 3 mars. Même règle
 * que les sous-cycles annuels (lib/billing-cycle.ts).
 */
function addUtcMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const monthIndex = from.getUTCMonth() + months;
  const target = new Date(Date.UTC(year, monthIndex, 1));
  const day = Math.min(
    from.getUTCDate(),
    daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth())
  );
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  );
}

/** L'échéance d'un cadeau posé maintenant (ISO). `null` = sans limite. */
export function giftExpiresAt(
  duration: GiftDuration,
  from: Date = new Date()
): string | null {
  if (duration === "unlimited") return null;
  const months = GIFT_MONTHS[duration];
  if (months) return addUtcMonths(from, months).toISOString();
  return new Date(from.getTime() + 7 * DAY_MS).toISOString();
}

/**
 * Un cadeau dont l'échéance est passée ne donne plus rien. Une date illisible
 * ne compte PAS comme expirée : on ne retire pas un droit sur un doute de
 * parsing (la colonne est un `timestamptz`, le cas ne devrait pas exister).
 */
export function isGiftExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return false;
  return at <= now;
}
