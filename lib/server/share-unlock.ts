import "server-only";

import { cookies, headers } from "next/headers";

import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { clientIpFromHeaders } from "@/lib/server/request-ip";
import { isCustomPublicHost, publicCookiePath } from "@/lib/server/custom-domains";
import {
  clearShareUnlockFailures,
  recordShareUnlockFailure,
  shareUnlockAttemptsLeft,
} from "@/lib/server/share-unlock-attempts";
import {
  SHARE_UNLOCK_COOKIE,
  getPublicShareTarget,
  unlockCookieMatches,
  unlockCookieValue,
  verifySharePassword,
} from "@/lib/server/view-shares";

/**
 * Le DÉVERROUILLAGE d'un partage protégé par mot de passe — une seule fois,
 * pour toutes ses cibles (MIN-283).
 *
 * Deux surfaces le déclenchent : le formulaire d'une vue partagée
 * (`/share/[token]`) et celui d'une page publiée (`/p/[token]`). Elles ne
 * partagent pas leur rendu, mais elles partagent tout ce qui touche au
 * secret — la limite de tentatives, la borne avant scrypt, la comparaison en
 * temps constant, la valeur du cookie. C'est exactement ce qu'il ne faut pas
 * écrire deux fois : la deuxième copie est celle qui rate la prochaine
 * correction.
 *
 * Ce qui reste à l'appelant : la redirection. Elle dépend de la route, et
 * `redirect()` lève — l'appeler ici masquerait le résultat de cette fonction.
 *
 * ── Deux compteurs, pas un (MIN-347) ──────────────────────────────────────
 *
 * La limite en mémoire coupe le martèlement pour rien, mais elle ne voit qu'une
 * instance et repart à zéro à chaque déploiement : sur la seule porte du produit
 * dont le secret est un mot de passe choisi à la main, ce n'était pas un frein,
 * c'était un délai. Les échecs sont donc rangés en base
 * ([share-unlock-attempts.ts](./share-unlock-attempts.ts)), et lus AVANT scrypt.
 */

/** Clé du namespace i18n PublicShare, rendue sous le formulaire. */
export type ShareUnlockError = "wrongPassword" | "tooManyAttempts";

export type ShareUnlockResult =
  /** Déverrouillé (cookie posé), ou déjà public : il n'y a rien à déverrouiller. */
  | { ok: true }
  | { ok: false; error: ShareUnlockError };

/** Borne avant scrypt : au-delà, inutile de dériver — c'est faux. Alignée sur
    les routes PUT de partage (MIN-118). */
const MAX_PASSWORD_LENGTH = 256;

export async function unlockShareWithPassword({
  token,
  password,
  cookiePath,
}: {
  token: string;
  password: unknown;
  /** Path du cookie sur host primaire : `/share/<token>` ou `/p/<token>`. Un
      seul nom de cookie sert donc n'importe quel nombre de partages. */
  cookiePath: string;
}): Promise<ShareUnlockResult> {
  // Porte anonyme : on limite par IP visiteur — celle du dernier relais de
  // confiance, jamais la tête de `x-forwarded-for` (choisie par l'appelant).
  const ip = clientIpFromHeaders(await headers());
  const { allowed } = checkSessionRateLimit(ip, `share-unlock:${token}`, {
    limit: 10,
  });
  if (!allowed) return { ok: false, error: "tooManyAttempts" };

  const target = await getPublicShareTarget(token);
  if (!target) return { ok: false, error: "wrongPassword" };
  const { share } = target;

  // Passé en « public » entre-temps : il n'y a plus rien à déverrouiller, la
  // page se re-rend telle quelle.
  if (share.level !== "password" || !share.password_salt || !share.password_hash) {
    return { ok: true };
  }

  // Deuxième ligne, celle qui survit à un déploiement : les échecs rangés en
  // base. Elle se lit APRÈS la résolution du partage — sans partage, il n'y a
  // rien à compter — mais AVANT scrypt, qui est ce qu'on refuse de payer.
  if (!(await shareUnlockAttemptsLeft(share.id, ip))) {
    return { ok: false, error: "tooManyAttempts" };
  }

  if (
    typeof password !== "string" ||
    password.length > MAX_PASSWORD_LENGTH ||
    !verifySharePassword(password, share.password_salt, share.password_hash)
  ) {
    recordShareUnlockFailure(share.id, ip);
    return { ok: false, error: "wrongPassword" };
  }
  clearShareUnlockFailures(share.id, ip);

  (await cookies()).set(
    SHARE_UNLOCK_COOKIE,
    unlockCookieValue(share.token, share.password_hash),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Sur domaine personnalisé, la racine : le path visible n'y contient
      // jamais le token, et la VALEUR du cookie reste liée à ce partage-ci.
      path: publicCookiePath(await isCustomPublicHost(), cookiePath),
      maxAge: 7 * 24 * 3600,
    }
  );
  return { ok: true };
}

/**
 * Le visiteur a-t-il le droit de voir CE partage ?
 *
 * Un partage « public » est ouvert ; un partage « password » ne révèle RIEN —
 * pas même le nom de ce qu'il protège — tant que le cookie ne correspond pas.
 * La valeur du cookie est déterministe sur (token, empreinte) : changer le mot
 * de passe invalide tous les cookies en circulation sans tenir la moindre
 * session.
 */
export async function isShareUnlocked(share: {
  level: "password" | "public";
  token: string;
  password_hash: string | null;
}): Promise<boolean> {
  if (share.level === "public") return true;
  if (!share.password_hash) return false;
  const cookie = (await cookies()).get(SHARE_UNLOCK_COOKIE)?.value;
  return unlockCookieMatches(cookie, share.token, share.password_hash);
}
