import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Verification of the JWT SSO of the feedback board (MIN-37). The client backend
 * signs a short HS256 (exp ≤ 10 min) with the sso_secret of the board (distinct from
 * mdy_ keys) and redirects the user to /f/<token>?sso=<jwt>.
 * Claims : sub = external_id (obligatoire), email?, name?.
 *
 * Pure node:crypto implementation (no jose dependency): only HS256 is
 * accepted (no possible algorithm confusion), time comparison
 * constant, exp obligatoire.
 *
 * ## Two guardrails who only lived in the signer (MIN-345)
 *
 * **The lifetime cap.** `SSO_MAX_TTL_SECONDS` was applied by
 * `signFeedbackSsoJwt`, that is to say by code that the client DOES NOT EXECUTE:
 * it is HIS backend which signs, with the JWT library of his choice. A `exp`
 * to one year was therefore perfectly accepted here — and an SSO token is a
 * full identity bearer, which traverses a URL, logs and a
 * browsing history. The ceiling is now imposed on VERIFICATION,
 * seul endroit qui tourne chez nous.
 *
 * **Consumption.** A token remained replayable throughout its window:
 * the leaked URL (Referer, shared history, proxy log) opened a
 * board session. `tokenId` is the unique identifier to consume — see
 * `consumeSsoToken` (lib/server/feedback/sso-replay.ts), called by route.
 * It derives from the SIGNATURE, not from a declared claim: the signature is already
 * unique per token and unfalsifiable without the secret, therefore nothing to require from the
 * customer. The `jti` that our signer poses only serves to avoid the collision of the
 * double-click — two tokens to the same claims signed in the same second
 * would otherwise be the SAME token, and the second would be considered a replay.
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
      /** To be consumed only once, per board. Derived from the signature. */
      tokenId: string;
      /** `exp` of the token — limits the retention of the consumption trace. */
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
  // The ceiling, verification side (MIN-345). The tolerance covers the clock of
  // signer, which is not ours: without it, a backend in advance of
  // a few seconds would see his perfectly legitimate tokens refused.
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

/** Maximum lifetime of JWT SSO: it is only used for immediate redirection. */
export const SSO_MAX_TTL_SECONDS = 600;

/** Clock deviation tolerated between the signing backend and us, upon verification. */
export const SSO_CLOCK_SKEW_SECONDS = 60;

export interface SignFeedbackSsoInput {
  /** Stable user identifier at the client → claim `sub` (required). */
  sub: string;
  email?: string | null;
  name?: string | null;
  /** Lifespan in seconds; limited to {@link SSO_MAX_TTL_SECONDS} (10 min). */
  ttlSeconds?: number;
}

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Sign the JWT SSO (client side of the board): HS256, `sub`/`email`/`name` + `exp`
 * short. Mirror of {@link verifyFeedbackSsoJwt} — same format, same algorithm, no
 * dependency jose. The result goes to `/f/<token>?sso=<jwt>`.
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
    // The only role of `jti`: return two tokens to the same claims, signed in
    // the same second, DIFFERENT. Without it, double-clicking on “Share a
    // return” produces the same token twice, and consumption takes the
    // second for a replay (MIN-345).
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
