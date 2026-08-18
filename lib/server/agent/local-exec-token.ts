import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * THE LOCAL EXECUTION TOKEN (MIN-355) — how a spin that lives on the machine
 * of the user proves WHAT RUN he is, while nothing signs for him.
 *
 * In a microVM, the `runId` is never received: it is DERIVED from the claim
 * `sandbox_name` of an OIDC that the Vercel Sandbox firewall installs after the release
 * of the VM ([network-policy.ts](network-policy.ts)). On a Mac, there is no
 * firewall, so no signature to derive — the machine must carry something
 * thing, and it is the complete reversal of the cloud path doctrine.
 *
 * HS256 AUTO-PORTEUR `{rid, gen, exp}`, patron exact de
 * [sso-jwt.ts](../../feedback/sso-jwt.ts): HS256 alone (no confusion
 * possible algorithm), comparison in constant time, `exp` obligatory, and the
 * lifetime cap imposed AT VERIFICATION — the only place that turns
 * with us, and therefore the only one that guarantees anything.
 *
 * WHY NOT AN OPAQUE HATCHED TOKEN, which would be revocable by nature:
 * `POST /stream` is served WITHOUT reading the run line, deliberately — ~4 calls/s,
 * ~29,000 per two-hour tour ([control-plane.ts](control-plane.ts), the
 * short circuit comment). A hash would require a lookup per request,
 * that is, exactly the load that this short circuit exists to remove.
 * The revocation is therefore paid for elsewhere, and it is free: the claim `gen` is
 * opposed to `agent_runs.local_exec_gen` where the line is ALREADY read, i.e.
 * everywhere except on this live one.
 *
 * WHAT THIS TOKEN DOES NOT PRETEND TO BE. It lives on a disk that the model can
 * read, and no amount of code discipline will change that. What is processed is not
 * therefore not its confidentiality, it is its POWER: no `/repo-auth` on the
 * local path, and `status = 'running'` required on all surfaces that read
 * the run line (see `handleControlPlaneRequest`). The TOOLS game does not
 * don't move - the why is written on the spot.
 */

/**
 * Maximum lifespan, IMPOSED TO VERIFICATION. Fifteen sliding minutes:
 * enough so that a tour of several hours does not wake up to a refusal between
 * two renewals, short enough for a token copied from a `job.json`
 * ceases to be worth anything before you finish reading it.
 */
export const LOCAL_EXEC_MAX_TTL_SECONDS = 900;

/**
 * Clock deviation tolerated ON THE CEILING, and on it alone. We sign and we
 * let's check, but not from the same invocation: two functions whose
 * clocks differ by a few seconds would refuse a token perfectly
 * fresh, for the sole reason that it seems too new. The exhalation remains
 * strict — tolerance would lengthen the window instead of correcting it.
 */
export const LOCAL_EXEC_CLOCK_SKEW_SECONDS = 30;

/** The prefix of the authentication scheme, as the harness sets it. */
const BEARER = /^bearer\s+(.+)$/i;

/**
 * The format of a run identifier, required as it is on the cloud path
 * (`runIdFromSandboxName`, network-policy.ts) and for the same reason: `rid` leaves
 * in Postgrest query, and an arbitrary string has no place there — even if the
 * signature covered it, it's OUR key that signs, so it's a bug from
 * us who would produce it.
 */
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LocalExecVerifyResult =
  | { ok: true; runId: string; gen: number; expiresAt: number }
  | {
      ok: false;
      error: "malformed" | "bad_signature" | "expired" | "ttl_too_long" | "bad_claims";
    };

/**
 * The secret, DERIVED from the service key — not an environment variable
 * no longer to hold.
 *
 * Same gesture as `hashIp` ([feedback/otp.ts](../feedback/otp.ts)): it is the only
 * secret which this path already has, and without which it would not have in any case
 * neither basis nor control plan. A dedicated variable would not add security
 * (which reads one reads the other) but would add a deployment where the functionality
 * silently died because no one asked it.
 *
 * HMAC and not concatenation: the label separates this use from any other, and the
 * changing suddenly revokes all the tokens in flight — this is our button
 * rotation, and it doesn't cost anyone anything (fifteen minute window).
 *
 * `null` when the key is missing, and the caller makes it a **503, not a
 * privilege**: a control plan that does not know how to verify does not verify.
 */
export function resolveLocalExecSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;
  return createHmac("sha256", serviceKey).update("minddy/agent-local-exec/v1").digest("hex");
}

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export interface SignLocalExecInput {
  /** The run that this token designates, and the only one (claim `rid`). */
  runId: string;
  /** The generation of the lease at the time of issue (claim `gen`). */
  gen: number;
  /** Lifetime ; limited to {@link LOCAL_EXEC_MAX_TTL_SECONDS}. */
  ttlSeconds?: number;
}

/** Sign the lease token. Exact mirror of {@link verifyLocalExecToken}. */
export function signLocalExecToken(
  input: SignLocalExecInput,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const ttl = Math.min(
    Math.max(1, Math.floor(input.ttlSeconds ?? LOCAL_EXEC_MAX_TTL_SECONDS)),
    LOCAL_EXEC_MAX_TTL_SECONDS,
  );
  const headerB64 = encodeSegment({ alg: "HS256", typ: "JWT" });
  const payloadB64 = encodeSegment({
    rid: input.runId,
    gen: input.gen,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
  });
  const signature = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyLocalExecToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): LocalExecVerifyResult {
  if (typeof token !== "string" || !secret) return { ok: false, error: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment(headerB64);
  if (!header || header.alg !== "HS256") return { ok: false, error: "malformed" };

  const expected = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest();
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
  // THE CEILING, HERE AND NOT TO THE SIGNER. The signator is us today — but
  // it's also the only half of the contract that a refactor day can move
  // without anyone noticing. A one-year `exp` will never pass.
  if (exp > nowSeconds + LOCAL_EXEC_MAX_TTL_SECONDS + LOCAL_EXEC_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: "ttl_too_long" };
  }

  const rid = payload.rid;
  const gen = payload.gen;
  if (typeof rid !== "string" || !RUN_ID_RE.test(rid)) return { ok: false, error: "bad_claims" };
  if (typeof gen !== "number" || !Number.isInteger(gen) || gen < 0) {
    return { ok: false, error: "bad_claims" };
  }

  return { ok: true, runId: rid, gen, expiresAt: exp };
}

/** What a local admission renders — the mirror of `SandboxAdmission`. */
export type LocalAdmission =
  | { ok: true; runId: string; gen: number }
  | { ok: false; status: 403 | 503; error: string };

/**
 * WHO HAS THE RIGHT TO SPEAK WITHOUT FIREWALL (MIN-355) — the local counterpart
 * of `admitSandboxCaller` ([network-policy.ts](network-policy.ts)), and the only
 * guard of the second admission route.
 *
 * PURE, like its twin, and for the same reason: the road
 * ([app/api/agent-vm/[...path]/route.ts](../../../app/api/agent-vm/[...path]/route.ts))
 * is not exercised by the test suite (`vitest.config.ts` only reads
 * `lib/**`). Whoever decides on admission must therefore live here, where a test can
 * casser.
 *
 * 403 on anything that is not a valid token, without distinguishing the absence from the
 * falsehood: a caller without a token is not a customer who made a mistake, it is
 * someone who has no place here. REASON travels in the body —
 * it is what allows the harness to request a fresh token from the app rather than
 * to try his own again (a 403 is not retried, cf. `retryable`).
 */
export function admitLocalCaller(
  authorization: string | null | undefined,
  secret: string | null,
): LocalAdmission {
  if (!secret) {
    return { ok: false, status: 503, error: "local execution secret not configured" };
  }
  const match = BEARER.exec((authorization ?? "").trim());
  if (!match) return { ok: false, status: 403, error: "not a local agent caller" };

  const verified = verifyLocalExecToken(match[1].trim(), secret);
  if (!verified.ok) {
    return { ok: false, status: 403, error: `local execution token: ${verified.error}` };
  }
  return { ok: true, runId: verified.runId, gen: verified.gen };
}
