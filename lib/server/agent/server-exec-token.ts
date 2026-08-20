import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 30;
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEARER = /^bearer\s+(.+)$/i;

function encode(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(segment: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function resolveServerExecSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;
  return createHmac("sha256", serviceKey).update("minddy/agent-server-exec/v1").digest("hex");
}

export function signServerExecToken(
  runId: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (!RUN_ID_RE.test(runId)) throw new Error("server execution token: invalid run id");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ rid: runId, kind: "server", iat: nowSeconds, exp: nowSeconds + TOKEN_TTL_SECONDS });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export type ServerExecAdmission =
  | { ok: true; runId: string }
  | { ok: false; status: 403 | 503; error: string };

export function admitServerExecCaller(
  authorization: string | null | undefined,
  secret: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ServerExecAdmission {
  if (!secret) return { ok: false, status: 503, error: "server execution secret not configured" };
  const match = BEARER.exec((authorization ?? "").trim());
  if (!match) return { ok: false, status: 403, error: "not a server agent caller" };
  const parts = match[1].trim().split(".");
  if (parts.length !== 3) return { ok: false, status: 403, error: "invalid server execution token" };
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return { ok: false, status: 403, error: "invalid server execution token" };
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 403, error: "invalid server execution token" };
  }
  const decodedHeader = decode(header);
  const claims = decode(payload);
  if (decodedHeader?.alg !== "HS256" || claims?.kind !== "server") {
    return { ok: false, status: 403, error: "invalid server execution token" };
  }
  const runId = claims.rid;
  const issuedAt = claims.iat;
  const expiresAt = claims.exp;
  if (!RUN_ID_RE.test(typeof runId === "string" ? runId : "") ||
      typeof issuedAt !== "number" || typeof expiresAt !== "number" ||
      issuedAt > nowSeconds + CLOCK_SKEW_SECONDS || expiresAt <= nowSeconds ||
      expiresAt > issuedAt + TOKEN_TTL_SECONDS) {
    return { ok: false, status: 403, error: "invalid server execution token" };
  }
  return { ok: true, runId: runId as string };
}
