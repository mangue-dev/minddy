/**
 * Le seul chemin d'authentification de l'app de bureau (MIN-291).
 *
 * ## Pourquoi il existe
 *
 * Google **refuse OAuth depuis un navigateur embarqué**, et un lien magique
 * reçu par mail s'ouvre de toute façon dans le navigateur par DÉFAUT, jamais
 * dans notre fenêtre. Deux contraintes, une seule issue : le tour se fait dans
 * le navigateur du système, et le résultat revient à l'app par un deep link
 * `minddy://auth?…`.
 *
 * ## Les deux moitiés, et pourquoi elles sont dans le même fichier
 *
 * `desktopAuthLinkFromCallback` est lue par le SERVEUR (app/auth/callback), qui
 * fabrique le lien ; `parseDesktopAuthLink` est lue par le MAIN PROCESS, qui le
 * reçoit. C'est un contrat entre deux process, du même genre que le contrat
 * i18n entre deux catalogues : les relire séparément ne le vérifie pas. Écrits
 * côte à côte, ils se testent en aller-retour (auth-link.test.ts).
 *
 * ## Ce que le serveur NE fait PAS sur ce chemin
 *
 * Ni `exchangeCodeForSession`, ni `verifyOtp`, ni le moindre cookie. Le
 * vérificateur PKCE vit dans le stockage de l'app, qui a démarré le tour ; le
 * serveur ne pourrait pas échanger le code même s'il le voulait. Il transmet, et
 * c'est tout. Le `token_hash` d'un lien mail est transmis INTACT pour la même
 * raison — il reste à usage unique, simplement c'est l'app qui l'use.
 *
 * ## Ce qu'un lien LISIBLE ne prouve pas (MIN-345)
 *
 * `parseDesktopAuthLink` répond à « est-ce exploitable ? », jamais à « est-ce
 * légitime ? ». macOS livre à l'app TOUT ce qui porte notre schéma, d'où qu'il
 * vienne : un `minddy://auth?code=…` reçu du système est un lien parfaitement
 * lisible, et connectait la fenêtre au compte de qui l'avait envoyé.
 *
 * D'où le `turn` : un nonce que l'app tire au DÉPART de son tour
 * (lib/desktop/auth-turn.ts), qu'elle glisse dans le `redirectTo`, qui traverse
 * le provider et revient ici. La fenêtre le compare à celui qu'elle a gardé —
 * c'est `components/desktop-auth-bridge.tsx` qui tranche, pas ce module.
 *
 * Un lien de MAIL, lui, n'en portera jamais : le gabarit GoTrue compose l'URL
 * lui-même, et le mail peut très bien être ouvert sur un autre appareil que
 * celui qui a demandé le compte. Celui-là se confirme à la main, dans la
 * fenêtre.
 */

import type { EmailOtpType } from "@supabase/supabase-js";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import {
  DESKTOP_AUTH_HOST,
  DESKTOP_PROTOCOL,
  DESKTOP_TURN_PARAM,
} from "@/lib/desktop/config";

/** Les types d'OTP qu'un lien mail peut porter (mêmes valeurs que GoTrue). */
const EMAIL_OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export function parseOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value)
    ? (value as EmailOtpType)
    : null;
}

/**
 * Ce qu'un deep link d'authentification transporte. Trois formes, une seule
 * entrée dans l'app — c'est le point de la chose.
 */
export type DesktopAuthLink =
  /** `turn` = le nonce du tour, quand l'app en a démarré un (MIN-345). Absent
   *  d'un lien reçu du système qu'on n'a pas provoqué — c'est tout son objet. */
  | { kind: "code"; code: string; next: string; turn?: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType; next: string; turn?: string }
  /** Le provider ou GoTrue a refusé. Les mêmes couples `error`/`reason` que la
   *  redirection web vers `/login`, pour que l'app affiche les mêmes phrases. */
  | { kind: "error"; error: string; reason: string };

/** `minddy://auth?…` — l'URL que le navigateur système ouvre pour réveiller l'app. */
export function buildDesktopAuthUrl(link: DesktopAuthLink): string {
  const params = new URLSearchParams();
  if (link.kind === "code") {
    params.set("code", link.code);
    if (link.next !== "/home") params.set("next", link.next);
    if (link.turn) params.set(DESKTOP_TURN_PARAM, link.turn);
  } else if (link.kind === "otp") {
    params.set("token_hash", link.tokenHash);
    params.set("type", link.type);
    if (link.next !== "/home") params.set("next", link.next);
    if (link.turn) params.set(DESKTOP_TURN_PARAM, link.turn);
  } else {
    params.set("error", link.error);
    params.set("reason", link.reason);
  }
  return `${DESKTOP_PROTOCOL}://${DESKTOP_AUTH_HOST}?${params.toString()}`;
}

/**
 * Ce que `/auth/callback` doit renvoyer à l'app, à partir de sa query.
 *
 * L'ordre est celui du handler web : un refus du provider d'abord (il rebondit
 * avec `error` et jamais de `code`), puis le code OAuth, puis l'OTP d'un lien
 * mail. Rien de tout ça = `missing_params`, et l'app le dira au lieu d'attendre.
 */
export function desktopAuthLinkFromCallback(
  params: URLSearchParams
): DesktopAuthLink {
  const providerError = params.get("error");
  if (providerError) {
    return {
      kind: "error",
      error: providerError === "access_denied" ? "oauth_denied" : "oauth_failed",
      reason: providerError,
    };
  }

  const next = sanitizeInternalRedirectPath(params.get("next"));
  // Le nonce du tour fait l'aller-retour par le provider : il était dans le
  // `redirectTo` que l'app a composé, il repart dans le deep link (MIN-345).
  const turn = params.get(DESKTOP_TURN_PARAM) ?? undefined;
  const code = params.get("code");
  if (code) return { kind: "code", code, next, turn };

  const tokenHash = params.get("token_hash");
  const type = parseOtpType(params.get("type"));
  if (tokenHash && type) return { kind: "otp", tokenHash, type, next, turn };

  return { kind: "error", error: "auth_callback_failed", reason: "missing_params" };
}

/**
 * Lit un deep link reçu par le système. Rend `null` pour tout ce qui n'est pas
 * un `minddy://auth` exploitable — macOS livre à l'app TOUT ce qui porte notre
 * schéma, y compris ce qu'on n'a jamais émis.
 */
export function parseDesktopAuthLink(raw: string): DesktopAuthLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DESKTOP_PROTOCOL}:`) return null;
  // `minddy://auth?x=1` parse l'hôte en `auth` ; `minddy:auth?x=1` le range dans
  // le chemin. Les deux formes circulent selon qui compose l'URL, on accepte les
  // deux plutôt que de perdre une connexion sur une barre oblique.
  const host = url.hostname || url.pathname.replace(/^\/*/, "");
  if (host !== DESKTOP_AUTH_HOST) return null;

  const params = url.searchParams;
  const error = params.get("error");
  if (error) {
    return { kind: "error", error, reason: params.get("reason") ?? error };
  }

  const next = sanitizeInternalRedirectPath(params.get("next"));
  const turn = params.get(DESKTOP_TURN_PARAM) ?? undefined;
  const code = params.get("code");
  if (code) return { kind: "code", code, next, turn };

  const tokenHash = params.get("token_hash");
  const type = parseOtpType(params.get("type"));
  if (tokenHash && type) return { kind: "otp", tokenHash, type, next, turn };

  return null;
}
