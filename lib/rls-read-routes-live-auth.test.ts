import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET routes whose reads go through the caller's RLS client start those reads
 * while the live session check is in flight (`getAuthedUserWithRlsReads`). A
 * revoked session must still receive the plain 401 and nothing else, and the
 * service-role reads of a route must wait for the live answer.
 */

const OBJECTIVE_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

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
vi.mock("@/lib/server/assistant/comment-agent", () => ({
  mentionsNumo: () => false, replyTargetsNumoObjective: async () => false, runObjectiveCommentMention: vi.fn(),
}));

const routes = {
  objectives: await import("@/app/api/projects/[id]/objectives/route"),
  categories: await import("@/app/api/projects/[id]/categories/route"),
  comments: await import("@/app/api/objectives/[id]/comments/route"),
  resources: await import("@/app/api/objectives/[id]/resources/route"),
  events: await import("@/app/api/objectives/[id]/events/route"),
  objectiveFeedback: await import("@/app/api/objectives/[id]/feedback/route"),
  triage: await import("@/app/api/me/triage-counts/route"),
};

const cases = [
  { name: "project objectives", get: () => routes.objectives.GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: PROJECT_ID }) }), rls: "rls:objectives" },
  { name: "project categories", get: () => routes.categories.GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: PROJECT_ID }) }), rls: "rls:categories" },
  { name: "objective comments", get: () => routes.comments.GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: OBJECTIVE_ID }) }), rls: "rls:comments" },
  { name: "objective resources", get: () => routes.resources.GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: OBJECTIVE_ID }) }), rls: "rls:attachments" },
  { name: "objective events", get: () => routes.events.GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: OBJECTIVE_ID }) }), rls: "rls:issue_events" },
  { name: "objective feedback", get: () => routes.objectiveFeedback.GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: OBJECTIVE_ID }) }), rls: "rls:objectives" },
  { name: "triage counts", get: () => routes.triage.GET(new NextRequest("http://localhost/x")), rls: "rls:projects" },
];

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
}

async function transport(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const name = `${url.host === "service.supabase.test" ? "service" : "rls"}:${url.pathname.replace("/rest/v1/", "")}`;
  state.events.push(name);
  if (name === "service:rpc/auth_authorization_state") {
    return new Promise((resolve) => { state.answerLive = (body) => resolve(json(body)); });
  }
  if (name === "rls:objectives" && url.searchParams.get("select") === "id,project_id") return json([{ id: OBJECTIVE_ID, project_id: PROJECT_ID }]);
  if (name === "service:projects") return json([{ id: PROJECT_ID, owner_id: "11111111-1111-4111-8111-111111111111" }]);
  return json([]);
}

async function settle() {
  for (let turn = 0; turn < 20; turn++) await new Promise((done) => setImmediate(done));
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

describe.each(cases)("$name", ({ get, rls }) => {
  it("starts its RLS read during the live check and answers after it", async () => {
    const pending = get();
    await settle();
    expect(state.events).toContain(rls);
    expect(state.events.filter((e) => e === "service:rpc/auth_authorization_state")).toHaveLength(1);

    state.answerLive({ sessionActive: true, mfaAllowed: true });
    expect((await pending).status).toBe(200);
  });

  it("answers a revoked session with 401 and reads nothing with the service role", async () => {
    const pending = get();
    await settle();
    state.answerLive({ sessionActive: false, mfaAllowed: true });
    const response = await pending;
    await settle();

    expect(response.status).toBe(401);
    expect(state.events.filter((e) => e.startsWith("service:") && e !== "service:rpc/auth_authorization_state")).toEqual([]);
  });

  it("answers a missing second factor with 403", async () => {
    const pending = get();
    await settle();
    state.answerLive({ sessionActive: true, mfaAllowed: false });
    expect((await pending).status).toBe(403);
  });
});
