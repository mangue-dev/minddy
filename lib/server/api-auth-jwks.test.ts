import { webcrypto } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The real auth SDK verifies an ES256 session against a stubbed key endpoint.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const START = Date.parse("2026-10-15T08:00:00.000Z");
const rpc = vi.fn();

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc }) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

const base64url = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");
let keyFetches = 0;
let fixture = 0;

async function signedSession() {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await webcrypto.subtle.exportKey("jwk", pair.publicKey)), kid: "fixture-key", alg: "ES256", use: "sig" };
  const header = base64url(JSON.stringify({ alg: "ES256", kid: "fixture-key", typ: "JWT" }));
  const expiresAt = Math.floor(START / 1000) + 3600;
  const payload = base64url(JSON.stringify({ sub: USER_ID, session_id: SESSION_ID, aal: "aal1", amr: [],
    role: "authenticated", aud: "authenticated", exp: expiresAt, iat: Math.floor(START / 1000) }));
  const signature = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" },
    pair.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
  const session = { access_token: `${header}.${payload}.${base64url(signature)}`, refresh_token: "synthetic-refresh",
    token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user: { id: USER_ID, aud: "authenticated" } };
  return { jwk, session };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  // A distinct project per test keeps the SDK's process-wide key cache apart.
  fixture += 1;
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", `https://jwks-fixture-${fixture}.supabase.co`);
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
  rpc.mockReset();
  rpc.mockReturnValue({ abortSignal: async () => ({ data: { sessionActive: true, mfaAllowed: true }, error: null }) });
  keyFetches = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("shares one key fetch between concurrent requests once the key set expires", async () => {
  const { jwk, session } = await signedSession();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.endsWith("/auth/v1/.well-known/jwks.json")) throw new Error(`unexpected request ${url}`);
    keyFetches += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ keys: [jwk] });
  }));
  const { getAuthedUser } = await import("./api-auth");
  const cookie = `sb-jwks-fixture-${fixture}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
  const request = () => new NextRequest("https://www.minddy.app/api/projects", { headers: { cookie } });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  expect((await getAuthedUser(request())).ok).toBe(true);
  await settle();

  keyFetches = 0;
  vi.setSystemTime(START + 10 * 60 * 1000 + 1_000);
  const results = await Promise.all(Array.from({ length: 6 }, () => getAuthedUser(request())));
  expect(results.map((result) => result.ok)).toEqual(Array(6).fill(true));
  expect(keyFetches).toBe(1);

  keyFetches = 0;
  vi.setSystemTime(START + 19 * 60 * 1000);
  const ahead = await Promise.all(Array.from({ length: 3 }, () => getAuthedUser(request())));
  expect(ahead.map((result) => result.ok)).toEqual(Array(3).fill(true));
  await settle();
  // Refreshed ahead of expiry, once, without delaying those requests.
  expect(keyFetches).toBe(1);
});
