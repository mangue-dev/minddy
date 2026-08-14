/**
 * Second facteur (MIN-132) — le peu de logique partagée entre le proxy, l'API et
 * le client. Isomorphe volontairement : pas de `server-only` ici, ce module est
 * lu dans les trois runtimes.
 *
 * ## Pourquoi un drapeau dans `app_metadata`
 *
 * L'enforcement pose deux questions : « cette session est-elle en aal2 ? » et
 * « ce compte a-t-il un facteur enrôlé ? ». La première se lit dans le JWT
 * (claim `aal`, signé). La seconde, non : Supabase l'expose via
 * `session.user.factors`, qui vient du COOKIE. Or qui a volé la session peut
 * réécrire ce cookie et retirer `factors` — c'est-à-dire désactiver le garde-fou
 * exactement dans le scénario que la 2FA existe pour couvrir.
 *
 * D'où `app_metadata.mfa_enabled`, écrit côté serveur avec la clé de service (le
 * client ne peut pas écrire `app_metadata`) et embarqué dans chaque JWT frappé
 * ensuite. `getClaims()` en vérifie la signature localement : la réponse est
 * gratuite et non falsifiable.
 *
 * Contrepartie assumée : le drapeau est figé jusqu'au prochain rafraîchissement
 * du jeton (≤ 1 h). À l'activation, on rafraîchit la session tout de suite ET on
 * révoque les autres sessions — sinon un jeton `aal1` déjà volé resterait valide
 * jusqu'à son propre refresh.
 */

/** Clé du drapeau dans `app_metadata`. */
export const MFA_ENABLED_CLAIM = "mfa_enabled";

/** Code d'erreur renvoyé par l'API quand la session n'est pas montée en aal2. */
export const MFA_REQUIRED_CODE = "mfa_required";

/** Nombre de codes de récupération émis d'un coup. */
export const RECOVERY_CODE_COUNT = 10;

export function hasMfaEnabled(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") return false;
  return (appMetadata as Record<string, unknown>)[MFA_ENABLED_CLAIM] === true;
}

/**
 * Vrai quand le compte a un facteur enrôlé mais que la session n'est pas montée
 * au second niveau — donc : il reste un challenge à passer.
 *
 * Le refus est GLOBAL, pas limité à une liste de routes sensibles. Une liste
 * demanderait d'y penser à chaque nouvelle route, et une liste qu'on oublie de
 * compléter est une faille qui ne se voit pas. Comme le challenge est posé juste
 * après le mot de passe, on n'est de toute façon en `aal1` que si on a abandonné
 * la connexion en cours de route.
 */
export function needsMfaChallenge(
  claims: { aal?: unknown; app_metadata?: unknown } | null | undefined
): boolean {
  if (!claims) return false;
  return hasMfaEnabled(claims.app_metadata) && claims.aal !== "aal2";
}

/**
 * Payload d'un JWT, SANS vérification de signature. Réservé au proxy, qui ne
 * fait que router : il choisit d'envoyer une session vers l'écran de challenge,
 * il n'autorise aucune donnée. Un jeton bricolé y passerait et se ferait refuser
 * par la première requête API — `getAuthedUser`, lui, vérifie la signature.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Traduit un échec de `challengeAndVerify` en clé de message.
 *
 * GoTrue répond en anglais et en jargon — « Invalid TOTP code entered ». Le
 * remonter tel quel à l'écran, c'est afficher un message qui n'est ni dans la
 * langue de la personne ni dans ses mots, au moment précis où elle est déjà
 * bloquée dehors. On ne garde donc du serveur que la DISTINCTION utile : code
 * refusé, trop d'essais, ou le reste.
 *
 * Les trois clés existent dans `Auth` et dans `AccountSecurity` — les deux
 * écrans qui vérifient un code — avec la formulation propre à chacun.
 */
export type MfaErrorKey =
  | "mfaInvalidCode"
  | "mfaTooManyAttempts"
  | "mfaGenericError";

export function mfaVerifyErrorKey(error: unknown): MfaErrorKey {
  const err = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof err?.code === "string" ? err.code : "";
  const status = typeof err?.status === "number" ? err.status : 0;

  if (code === "over_request_rate_limit" || status === 429) {
    return "mfaTooManyAttempts";
  }
  // `mfa_verification_failed` est le cas courant ; le repli sur 4xx couvre les
  // variantes de GoTrue sans les nommer une par une (elles changent, le sens
  // « ce code ne passe pas » reste).
  if (
    code.startsWith("mfa_verification") ||
    (status >= 400 && status < 500)
  ) {
    return "mfaInvalidCode";
  }
  return "mfaGenericError";
}

/**
 * Format d'un code de récupération : TROIS groupes de quatre caractères en
 * Crockford base32 (sans I, L, O, U — les confusions à l'oral et à la copie).
 *
 * Douze caractères, donc 60 bits par code (MIN-347). Les deux groupes d'origine
 * n'en portaient que 40 : assez contre une devinette en ligne, pas assez contre
 * une base qui fuit — 2⁴⁰ empreintes se balaient hors ligne en quelques
 * secondes sur une carte graphique. L'entropie et le KDF vont ensemble : le
 * hachage lent de [lib/server/mfa.ts](server/mfa.ts) rend le balayage coûteux,
 * ces 20 bits de plus le rendent inutile. Un groupe de plus à recopier est le
 * prix, sur un geste qu'on fait une fois dans sa vie.
 */
export const RECOVERY_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Caractères significatifs d'un code, tirets exclus. */
export const RECOVERY_CODE_LENGTH = 12;
const RECOVERY_CODE_RE =
  /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Découpe en groupes de quatre : la seule forme sous laquelle un code circule. */
export function formatRecoveryCode(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join("-");
}

/**
 * Normalise ce que la personne a tapé : majuscules, tirets rétablis, espaces et
 * séparations parasites retirés. Renvoie `null` si ça ne peut pas être un code —
 * ce qui évite d'aller taper la base pour une saisie manifestement à côté.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (cleaned.length !== RECOVERY_CODE_LENGTH) return null;
  const formatted = formatRecoveryCode(cleaned);
  return RECOVERY_CODE_RE.test(formatted) ? formatted : null;
}
