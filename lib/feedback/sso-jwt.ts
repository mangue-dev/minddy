import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Vérification du JWT SSO du board de feedback (MIN-37). Le backend du client
 * signe un HS256 court (exp ≤ 10 min) avec le sso_secret du board (distinct des
 * clés mdy_) et redirige l'utilisateur vers /f/<token>?sso=<jwt>.
 * Claims : sub = external_id (obligatoire), email?, name?.
 *
 * Implémentation pure node:crypto (pas de dépendance jose) : seul HS256 est
 * accepté (aucune confusion d'algorithme possible), comparaison en temps
 * constant, exp obligatoire.
 *
 * ## Deux garde-fous qui ne vivaient que dans le signeur (MIN-345)
 *
 * **Le plafond de durée de vie.** `SSO_MAX_TTL_SECONDS` était appliqué par
 * `signFeedbackSsoJwt`, c'est-à-dire par du code que le client N'EXÉCUTE PAS :
 * c'est SON backend qui signe, avec la bibliothèque JWT de son choix. Un `exp`
 * à un an était donc parfaitement accepté ici — et un jeton SSO est un
 * porteur d'identité complet, qui traverse une URL, des journaux et un
 * historique de navigation. Le plafond est désormais imposé à la VÉRIFICATION,
 * seul endroit qui tourne chez nous.
 *
 * **La consommation.** Un jeton restait rejouable pendant toute sa fenêtre :
 * l'URL fuitée (Referer, historique partagé, journal de proxy) ouvrait une
 * session de board. `tokenId` est l'identifiant unique à consommer — voir
 * `consumeSsoToken` (lib/server/feedback/sso-replay.ts), appelé par la route.
 * Il dérive de la SIGNATURE, pas d'un claim déclaré : la signature est déjà
 * unique par jeton et infalsifiable sans le secret, donc rien à exiger du
 * client. Le `jti` que pose notre signeur ne sert qu'à écarter la collision du
 * double-clic — deux jetons aux mêmes claims signés dans la même seconde
 * seraient sinon le MÊME jeton, et le second passerait pour un rejeu.
 */

export interface FeedbackSsoClaims {
  externalId: string;
  email: string | null;
  name: string | null;
}

export type SsoVerifyResult =
  | {
      ok: true;
      claims: FeedbackSsoClaims;
      /** À consommer une seule fois, par board. Dérivé de la signature. */
      tokenId: string;
      /** `exp` du jeton — borne la rétention de la trace de consommation. */
      expiresAt: number;
    }
  | {
      ok: false;
      error:
        | "malformed"
        | "bad_signature"
        | "expired"
        | "ttl_too_long"
        | "missing_sub";
    };

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function verifyFeedbackSsoJwt(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): SsoVerifyResult {
  if (typeof token !== "string" || !secret) return { ok: false, error: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment(headerB64);
  if (!header || header.alg !== "HS256") return { ok: false, error: "malformed" };

  const expected = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureB64, "base64url");
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, error: "bad_signature" };
  }

  const payload = decodeSegment(payloadB64);
  if (!payload) return { ok: false, error: "malformed" };

  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return { ok: false, error: "expired" };
  if (exp <= nowSeconds) return { ok: false, error: "expired" };
  // Le plafond, côté vérification (MIN-345). La tolérance couvre l'horloge du
  // signeur, qui n'est pas la nôtre : sans elle, un backend en avance de
  // quelques secondes verrait ses jetons parfaitement légitimes refusés.
  if (exp > nowSeconds + SSO_MAX_TTL_SECONDS + SSO_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: "ttl_too_long" };
  }

  const sub = payload.sub;
  if (typeof sub !== "string" || !sub.trim()) return { ok: false, error: "missing_sub" };

  const email =
    typeof payload.email === "string" && payload.email.includes("@")
      ? payload.email.trim().toLowerCase()
      : null;
  const name =
    typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;

  return {
    ok: true,
    claims: { externalId: sub.trim(), email, name },
    tokenId: createHash("sha256").update(signatureB64).digest("hex"),
    expiresAt: exp,
  };
}

/** Durée de vie maximale du JWT SSO : il ne sert qu'à la redirection immédiate. */
export const SSO_MAX_TTL_SECONDS = 600;

/** Écart d'horloge toléré entre le backend qui signe et nous, à la vérification. */
export const SSO_CLOCK_SKEW_SECONDS = 60;

export interface SignFeedbackSsoInput {
  /** Identifiant stable de l'utilisateur chez le client → claim `sub` (requis). */
  sub: string;
  email?: string | null;
  name?: string | null;
  /** Durée de vie en secondes ; bornée à {@link SSO_MAX_TTL_SECONDS} (10 min). */
  ttlSeconds?: number;
}

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Signe le JWT SSO (côté client du board) : HS256, `sub`/`email`/`name` + `exp`
 * court. Miroir de {@link verifyFeedbackSsoJwt} — même format, même algo, pas de
 * dépendance jose. Le résultat va dans `/f/<token>?sso=<jwt>`.
 */
export function signFeedbackSsoJwt(
  input: SignFeedbackSsoInput,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const ttl = Math.min(
    Math.max(1, Math.floor(input.ttlSeconds ?? SSO_MAX_TTL_SECONDS)),
    SSO_MAX_TTL_SECONDS
  );
  const headerB64 = encodeSegment({ alg: "HS256", typ: "JWT" });
  const payload: Record<string, unknown> = {
    sub: input.sub,
    // Le seul rôle du `jti` : rendre deux jetons aux mêmes claims, signés dans
    // la même seconde, DIFFÉRENTS. Sans lui, un double-clic sur « Partager un
    // retour » produit deux fois le même jeton, et la consommation prend le
    // second pour un rejeu (MIN-345).
    jti: randomBytes(12).toString("base64url"),
    iat: nowSeconds,
    exp: nowSeconds + ttl,
  };
  if (input.email) payload.email = input.email;
  if (input.name) payload.name = input.name;
  const payloadB64 = encodeSegment(payload);
  const signature = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}
