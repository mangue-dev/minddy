import { createBrowserClient } from "@supabase/ssr";
import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchClientRead } from "./client-read";

let client: SupabaseClient;
vi.mock("./supabase", () => ({ getSupabase: () => client }));
afterEach(() => { client?.auth.stopAutoRefresh(); vi.unstubAllGlobals(); });
const jwt = (expiresAt: number) => [
  { alg: "HS256", typ: "JWT" },
  { sub: "owner", exp: expiresAt, session_id: "session" },
].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".") + ".signature";

it("renews an expired cookie once for concurrent reads before sending any API request", async () => {
  const cookies = new Map<string, string>();
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;
  const savedSession = {
    access_token: jwt(expiresAt), refresh_token: "original-refresh", expires_at: expiresAt,
    token_type: "bearer", user: { id: "owner" },
  };
  cookies.set("test-session", JSON.stringify(savedSession));
  let release!: () => void;
  const refresh = vi.fn(() => new Promise<Response>(resolve => { release = () => resolve(Response.json({
    access_token: jwt(expiresAt), refresh_token: "rotated-refresh", expires_in: 3_600,
    token_type: "bearer", user: { id: "owner" },
  })); }));
  client = createBrowserClient("https://synthetic.supabase.co", "synthetic-anon-key", {
    isSingleton: false, cookieOptions: { name: "test-session" }, cookieEncoding: "raw",
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: values => { values.forEach(({ name, value }) => cookies.set(name, value)); },
    },
    auth: { autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: refresh },
  });
  await client.auth.initialize();
  cookies.set("test-session", JSON.stringify({ ...savedSession, access_token: jwt(1), expires_at: 1 }));
  const fetch = vi.fn(async () => {
    expect(cookies.get("test-session")).toContain("rotated-refresh");
    return Response.json({ ready: true });
  });
  vi.stubGlobal("fetch", fetch);
  const reads = [fetchClientRead("/api/projects"), fetchClientRead("/api/billing/usage")];
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(fetch).not.toHaveBeenCalled();
  release();
  const responses = await Promise.all(reads);
  expect(await responses[0].json()).toEqual({ ready: true });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(1);
});
