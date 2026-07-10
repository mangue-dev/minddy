import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérification du JWT SSO du board de feedback (MIN-37). Le backend du client
 * signe un HS256 court (exp ≤ 10 min recommandé) avec le sso_secret du board
 * (distinct des clés mdy_) et redirige l'utilisateur vers /f/<token>?sso=<jwt>.
 * Claims : sub = external_id (obligatoire), email?, name?.
 *
 * Implémentation pure node:crypto (pas de dépendance jose) : seul HS256 est
 * accepté (aucune confusion d'algorithme possible), comparaison en temps
 * constant, exp obligatoire.
 */

export interface FeedbackSsoClaims {
  externalId: string;
  email: string | null;
  name: string | null;
}

export type SsoVerifyResult =
  | { ok: true; claims: FeedbackSsoClaims }
  | { ok: false; error: "malformed" | "bad_signature" | "expired" | "missing_sub" };

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

  const sub = payload.sub;
  if (typeof sub !== "string" || !sub.trim()) return { ok: false, error: "missing_sub" };

  const email =
    typeof payload.email === "string" && payload.email.includes("@")
      ? payload.email.trim().toLowerCase()
      : null;
  const name =
    typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;

  return { ok: true, claims: { externalId: sub.trim(), email, name } };
}

/** Durée de vie maximale du JWT SSO : il ne sert qu'à la redirection immédiate. */
export const SSO_MAX_TTL_SECONDS = 600;

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
