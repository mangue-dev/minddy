import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET routes whose first reads have no side effect start those reads while the
 * live session check is in flight (`getAuthedUserAlongside`, or
 * `getAuthedUserWithRlsReads` for the caller's RLS client). The live answer
 * still decides the response: a revoked session gets the plain 401 and nothing
 * that writes, decrypts or answers with data may run on its behalf.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const PAGE_ID = "44444444-4444-4444-8444-444444444444";
const ROUTINE_ID = "55555555-5555-4555-8555-555555555555";

const state = vi.hoisted(() => ({
  events: [] as string[],
  answerLive: (_body: unknown) => {},
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
// Real SDK clients over a stubbed transport, so the request gate is exercised.
vi.mock("@supabase/ssr", async () => {
  const { createClient } = await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  return {
    createServerClient: (url: string, key: string, options: { global: { fetch: typeof fetch } }) => {
      const client = createClient(url, key, {
        global: options.global,
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return Object.assign(client, { auth: Object.assign(client.auth, { getClaims: async () => ({
        data: { claims: { sub: "11111111-1111-4111-8111-111111111111",
          session_id: "22222222-2222-4222-8222-222222222222", aal: "aal1", amr: [], user_metadata: {} } },
        error: null,
      }) }) });
    },
  };
});
vi.mock("@/lib/supabase-service", async () => {
  const { createClient } = await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  const { supabaseServerFetch } = await import("@/lib/server/supabase-fetch");
  let client: SupabaseClient | undefined;
  return {
    getServiceClient: () => client ??= createClient("https://service.supabase.test", "service-key", {
      global: { fetch: supabaseServerFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
});
vi.mock("@/lib/server/api-key-actors", () => ({ resolveApiKeyActors: async () => new Map() }));
vi.mock("@/lib/server/members", () => ({}));
vi.mock("@/lib/server/stripe", async (original) => ({
  ...await original<typeof import("@/lib/server/stripe")>(),
  isStripeConfigured: () => false,
}));

const routes = {
  members: await import("@/app/api/projects/[id]/members/route"),
  billing: await import("@/app/api/billing/route"),
  usage: await import("@/app/api/billing/usage/route"),
  routines: await import("@/app/api/routines/route"),
  routine: await import("@/app/api/routines/[id]/route"),
  pageEvents: await import("@/app/api/projects/[id]/pages/[pageId]/events/route"),
  pageComments: await import("@/app/api/projects/[id]/pages/[pageId]/comments/route"),
  pageBacklinks: await import("@/app/api/projects/[id]/pages/[pageId]/backlinks/route"),
};

const request = () => new NextRequest("http://localhost/x");
const pageParams = { params: Promise.resolve({ id: PROJECT_ID, pageId: PAGE_ID }) };

/** `start` is the read that must be in flight before the live answer arrives. */
const cases = [
  { name: "project members", start: "service:project_members", status: 200,
    get: () => routes.members.GET(request(), { params: Promise.resolve({ id: PROJECT_ID }) }),
    // Avatar seeds may insert, so they follow the live answer.
    afterAuthOnly: ["service:user_avatars"] },
  { name: "billing status", start: "service:billing_accounts", status: 200,
    get: () => routes.billing.GET(request()), afterAuthOnly: [] },
  { name: "billing usage", start: "service:agent_quota_resets", status: 200,
    get: () => routes.usage.GET(request()), afterAuthOnly: ["service:rpc/get_user_usage_since"] },
  { name: "routines list", start: "service:agent_routines", status: 200,
    get: () => routes.routines.GET(request()), afterAuthOnly: [] },
  { name: "routine detail", start: "service:agent_routines", status: 404,
    get: () => routes.routine.GET(request(), { params: Promise.resolve({ id: ROUTINE_ID }) }), afterAuthOnly: [] },
  { name: "page activity", start: "rls:issue_events", status: 200,
    get: () => routes.pageEvents.GET(request(), pageParams), afterAuthOnly: [] },
  { name: "page comments", start: "rls:page_comments", status: 200,
    get: () => routes.pageComments.GET(request(), pageParams), afterAuthOnly: [] },
  { name: "page backlinks", start: "rls:page_links", status: 200,
    get: () => routes.pageBacklinks.GET(request(), pageParams), afterAuthOnly: [] },
];

function json(body: unknown, count = Array.isArray(body) ? body.length : 0) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "content-range": `*/${count}` },
  });
}

async function transport(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const name = `${url.host === "service.supabase.test" ? "service" : "rls"}:${url.pathname.replace(/^\/(rest|auth)\/v1\//, "")}`;
  state.events.push(name);
  if (name === "service:rpc/auth_authorization_state") {
    return new Promise((resolve) => { state.answerLive = (body) => resolve(json(body)); });
  }
  if (name === "service:projects" && url.searchParams.get("select")?.includes("owner_id")) {
    return json([{ id: PROJECT_ID, owner_id: USER, deleted_at: null }]);
  }
  if (name.startsWith("service:admin/users/")) {
    return json({ id: USER, email: "a@example.test", user_metadata: {} });
  }
  if (name === "service:project_members" && url.searchParams.get("select") === "project_id") {
    return json([{ project_id: PROJECT_ID }]);
  }
  if (name === "service:rpc/get_user_usage_since") return json({ total_cost: 0, by_feature: [] });
  if (name === "rls:projects") return json([{ key: "MIN" }]);
  return json([]);
}

async function settle() {
  for (let turn = 0; turn < 30; turn++) await new Promise((done) => setImmediate(done));
}

beforeEach(() => {
  state.events = [];
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_INTERNAL_URL", "");
  vi.stubGlobal("fetch", vi.fn(transport));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(cases)("$name", ({ get, start, status, afterAuthOnly }) => {
  it("starts its first read during the live check and answers after it", async () => {
    const pending = get();
    await settle();
    expect(state.events).toContain(start);
    expect(state.events.filter((e) => e === "service:rpc/auth_authorization_state")).toHaveLength(1);
    for (const late of afterAuthOnly) expect(state.events).not.toContain(late);

    state.answerLive({ sessionActive: true, mfaAllowed: true });
    expect((await pending).status).toBe(status);
  });

  it("answers a revoked session with 401, no data, and runs nothing that writes", async () => {
    const pending = get();
    await settle();
    state.answerLive({ sessionActive: false, mfaAllowed: true });
    const response = await pending;
    await settle();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized", code: expect.any(String) });
    for (const late of afterAuthOnly) expect(state.events).not.toContain(late);
    expect(state.events.filter((e) => e.startsWith("service:rpc/") && e !== "service:rpc/auth_authorization_state")).toEqual([]);
  });

  it("answers a missing second factor with 403", async () => {
    const pending = get();
    await settle();
    state.answerLive({ sessionActive: true, mfaAllowed: false });
    expect((await pending).status).toBe(403);
  });
});
