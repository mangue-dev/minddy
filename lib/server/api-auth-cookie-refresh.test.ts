import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@supabase/supabase-js";
import { MutableRequestCookiesAdapter, appendMutableCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { getAuthedUser } from "./api-auth";

const h = vi.hoisted(() => ({ cookies: vi.fn(), rpc: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: h.cookies }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: h.rpc }) }));

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const cookieName = "sb-synthetic-auth-token";
const user = { id: owner, aud: "authenticated", created_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const jwt = (expiresAt: number) => [
  { alg: "HS256", typ: "JWT" },
  { sub: owner, exp: expiresAt, session_id: sessionId, aal: "aal1", amr: [] },
].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".") + ".c2lnbmF0dXJl";
const encodeCookie = (session: Session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const decodeCookie = (value: string) => JSON.parse(Buffer.from(value.slice("base64-".length), "base64url").toString());

beforeEach(() => {
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
  h.cookies.mockReset(); h.rpc.mockReset();
  h.rpc.mockReturnValue({ abortSignal: async () => ({
    data: { sessionActive: true, mfaAllowed: true }, error: null,
  }) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(["GET", "POST", "PATCH"])("returns rotated session cookies from a first %s API request with expired credentials", async method => {
  const previous: Session = {
    access_token: jwt(1), refresh_token: "old-refresh", expires_at: 1,
    expires_in: 3_600, token_type: "bearer", user,
  };
  const request = new NextRequest("https://www.minddy.app/api/projects", {
    method, headers: { cookie: `${cookieName}=${encodeCookie(previous)}` },
  });
  const mutableCookies = MutableRequestCookiesAdapter.wrap(request.cookies);
  h.cookies.mockResolvedValue(mutableCookies);
  const token = jwt(Math.floor(Date.now() / 1000) + 3_600);
  const fetch = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
    const path = new URL(String(input)).pathname;
    if (path === "/auth/v1/token") return Response.json({
      access_token: token, refresh_token: "rotated-refresh", expires_in: 3_600, token_type: "bearer", user,
    });
    if (path === "/auth/v1/user") return Response.json(user);
    throw new Error(`Unexpected SDK request: ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  const result = await getAuthedUser(request);
  expect(result.ok).toBe(true);
  expect(h.cookies).toHaveBeenCalledOnce();
  expect(decodeCookie(request.cookies.get(cookieName)!.value)).toMatchObject({ refresh_token: "rotated-refresh" });
  // Use Next's actual response-merging helper, which app-route invokes for all
  // normal handler responses, including errors and explicit redirects.
  for (const status of [200, 307, 422]) {
    const headers = new Headers();
    expect(appendMutableCookies(headers, mutableCookies)).toBe(true);
    const response = new Response(null, { status, headers });
    expect(response.headers.get("set-cookie")).toContain(cookieName);
    expect(decodeCookie(mutableCookies.get(cookieName)!.value)).toMatchObject({ refresh_token: "rotated-refresh" });
  }
  if (result.ok) {
    expect((await result.supabase.auth.getSession()).data.session?.refresh_token).toBe("rotated-refresh");
  }
  expect(fetch.mock.calls.filter(([input]) => new URL(String(input)).pathname === "/auth/v1/token")).toHaveLength(1);
});

it("persists expired-cookie deletion when the refresh token has been revoked", async () => {
  const previous: Session = {
    access_token: jwt(1), refresh_token: "revoked-refresh", expires_at: 1,
    expires_in: 3_600, token_type: "bearer", user,
  };
  const request = new NextRequest("https://www.minddy.app/api/projects", {
    method: "POST", headers: { cookie: `${cookieName}=${encodeCookie(previous)}` },
  });
  const mutableCookies = MutableRequestCookiesAdapter.wrap(request.cookies);
  h.cookies.mockResolvedValue(mutableCookies);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    message: "Invalid refresh token", code: "refresh_token_not_found",
  }, { status: 400 })));
  const result = await getAuthedUser(request);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.response.status).toBe(401);
  const headers = new Headers();
  expect(appendMutableCookies(headers, mutableCookies)).toBe(true);
  expect(headers.get("set-cookie")).toContain("Max-Age=0");
});
