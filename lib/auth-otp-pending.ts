import type { EmailOtpType } from "@supabase/supabase-js";

import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { parseOtpType } from "@/lib/desktop/auth-link";

/**
 * Le jeton d'un lien e-mail, mis en attente le temps qu'on demande à la
 * personne si elle a bien demandé CE tour d'authentification (MIN-345).
 *
 * ## Ce qu'on répare
 *
 * `GET /auth/callback?token_hash=…&type=magiclink` ouvrait une session. Une
 * navigation, un jeton, et le navigateur est connecté — à un compte que rien ne
 * rattache à la personne devant l'écran. C'est la fixation de session dans sa
 * forme la plus simple : l'attaquant demande un lien pour SON compte, l'envoie
 * à sa victime, et tout ce qu'elle écrit ensuite est écrit chez lui.
 *
 * Le chemin OAuth, lui, n'a pas ce défaut et n'a rien à faire ici : le
 * vérificateur PKCE vit dans un cookie posé au DÉPART du tour, et
 * `exchangeCodeForSession` échoue sans lui. Le tour y est déjà lié à son
 * initiateur, et par une preuve plus forte qu'un nonce à nous.
 *
 * ## Pourquoi un cookie plutôt qu'un nonce dans le lien
 *
 * Parce que le lien ne peut pas en porter un. Le gabarit GoTrue le compose
 * lui-même (`{{ .RedirectTo }}?token_hash=…`) : rien de ce qu'on ajoute à
 * `emailRedirectTo` n'y survit proprement. Et surtout, un nonce posé au départ
 * exigerait d'ouvrir le mail DANS le navigateur qui a demandé le lien — ce qui
 * casserait l'invitation, qui n'a par nature aucun tour de départ chez son
 * destinataire, et la confirmation d'inscription lue sur le téléphone.
 *
 * Donc : on ne consomme rien sur un `GET`. Le jeton attend dans ce cookie —
 * `httpOnly` (aucun script n'y touche) et `SameSite=Lax` (un `POST` venu d'un
 * autre site ne l'emporte pas, donc ne peut pas le faire consommer) — et la
 * session ne naît que du `POST` d'une personne qui a lu à qui elle se connecte.
 *
 * Module pur, sans `server-only` : c'est ce qui le rend testable des deux côtés
 * du contrat, celui qui écrit le cookie et celui qui le lit.
 */

export const AUTH_PENDING_COOKIE = "mdy_auth_pending";

/** Le temps qu'on laisse pour lire l'écran et cliquer. Le jeton GoTrue, lui,
    a sa propre expiration, plus courte le plus souvent — la nôtre ne la
    prolonge pas, elle borne juste la traînée du cookie. */
export const AUTH_PENDING_TTL_SECONDS = 15 * 60;

export interface PendingOtp {
  tokenHash: string;
  type: EmailOtpType;
  /** Où aller une fois la session ouverte — déjà passé au tamis. */
  next: string;
}

export function encodePendingOtp(pending: PendingOtp): string {
  return Buffer.from(
    JSON.stringify({
      h: pending.tokenHash,
      t: pending.type,
      n: pending.next,
    })
  ).toString("base64url");
}

/** Rend `null` sur tout ce qui n'est pas un jeton en attente exploitable — un
    cookie tronqué, périmé dans sa forme, ou un `type` que GoTrue ne connaît
    pas. Le `next` repasse au tamis : ce cookie a beau être le nôtre, il a fait
    un aller-retour par le navigateur. */
export function decodePendingOtp(raw: string | undefined | null): PendingOtp | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const { h, t, n } = parsed as { h?: unknown; t?: unknown; n?: unknown };
    const type = parseOtpType(typeof t === "string" ? t : null);
    if (typeof h !== "string" || !h || !type) return null;
    return {
      tokenHash: h,
      type,
      next: sanitizeInternalRedirectPath(typeof n === "string" ? n : null),
    };
  } catch {
    return null;
  }
}

/** Les options du cookie, à l'écriture comme à l'effacement — les deux DOIVENT
    porter le même `path`, sans quoi la suppression rate sa cible et le jeton
    consommé reste dans le navigateur. */
export function authPendingCookieOptions(maxAgeSeconds = AUTH_PENDING_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge: maxAgeSeconds,
  };
}
