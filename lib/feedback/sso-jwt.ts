import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Verify feedback-board SSO JWTs (MIN-37). The publisher's backend signs a
 * short-lived HS256 token with the board's dedicated SSO secret and redirects
 * the visitor to `/f/<token>?sso=<jwt>`.
 *
 * Verification accepts only HS256, requires `sub` and `exp`, caps the lifetime,
 * and compares the MAC in constant time. `tokenId` is derived from canonical
 * signature bytes so alternate base64 spellings cannot bypass replay tracking.
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
  // Enforce the lifetime at verification time. The tolerance covers a signer
  // whose clock is slightly ahead of ours.
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

  const canonicalSignature = provided.toString("base64url");
  return {
    ok: true,
    claims: { externalId: sub.trim(), email, name },
    tokenId: createHash("sha256").update(canonicalSignature).digest("hex"),
    expiresAt: exp,
  };
}

/** Maximum lifetime of JWT SSO: it is only used for immediate redirection. */
export const SSO_MAX_TTL_SECONDS = 600;

/** Clock skew tolerated between the signing backend and this verifier. */
export const SSO_CLOCK_SKEW_SECONDS = 60;

export interface SignFeedbackSsoInput {
  /** Stable publisher-side user identifier mapped to the required `sub` claim. */
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
    // `jti` makes two tokens for the same claims distinct. Without
    // it, a double click could produce identical tokens and look like a replay.
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
