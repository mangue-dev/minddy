import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./server/encryption/store";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ISSUE_ID = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({
  events: [] as string[],
  store: null as unknown,
  issues: [] as Record<string, unknown>[],
  answerLive: (_body: unknown) => {},
}));

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
// Each protected row decode resolves the store; record when that happens.
vi.mock("./server/encryption/registry", () => ({ getEncryptedStore: () => {
  state.events.push("decrypt");
  return state.store;
} }));
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
vi.mock("./supabase-service", async () => {
  const { createClient } = await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  const { supabaseServerFetch } = await import("./server/supabase-fetch");
  let client: SupabaseClient | undefined;
  return {
    getServiceClient: () => client ??= createClient("https://service.supabase.test", "service-key", {
      global: { fetch: supabaseServerFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
});

const { GET } = await import("@/app/api/projects/[id]/issues/route");
const { encodeIssue } = await import("./server/issue-store");

function json(body: unknown, status = 200, count = Array.isArray(body) ? body.length : 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "content-range": `*/${count}` },
  });
}

async function transport(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const name = `${url.host === "service.supabase.test" ? "service" : "rls"}:${url.pathname.replace("/rest/v1/", "")}`;
  state.events.push(name);
  if (name === "service:rpc/auth_authorization_state") {
    return new Promise((resolve) => { state.answerLive = (body) => resolve(json(body)); });
  }
  if (name === "rls:issues") return json(state.issues);
  return json([]);
}

async function settle() {
  for (let turn = 0; turn < 20; turn++) await new Promise((done) => setImmediate(done));
}

function answerLive(live: { sessionActive: boolean; mfaAllowed: boolean }) {
  state.events.push("live:answered");
  state.answerLive(live);
}

const request = () => GET(new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/issues`),
  { params: Promise.resolve({ id: PROJECT_ID }) });

beforeEach(async () => {
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_INTERNAL_URL", "");
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "1".repeat(64));
  const key = randomBytes(32);
  state.store = new EncryptedStore({ current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }) });
  state.issues = [await encodeIssue({ id: ISSUE_ID, project_id: PROJECT_ID, title: "Protected title",
    number: 1, position: 0, deleted_at: null, issue_categories: [] })];
  state.events = [];
  vi.stubGlobal("fetch", vi.fn(transport));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("project issue reads overlapped with the live session check", () => {
  it("sends the RLS reads before the live check resolves and decrypts only after it", async () => {
    const pending = request();
    await settle();

    expect(state.events).toEqual(expect.arrayContaining(["service:rpc/auth_authorization_state", "rls:issues", "rls:attachments"]));
    expect(state.events).not.toContain("decrypt");

    answerLive({ sessionActive: true, mfaAllowed: true });
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).map((issue: { id: string; title: string }) => [issue.id, issue.title]))
      .toEqual([[ISSUE_ID, "Protected title"]]);
    expect(state.events.indexOf("decrypt")).toBeGreaterThan(state.events.indexOf("live:answered"));
  });

  it.each([
    { live: { sessionActive: false, mfaAllowed: true }, status: 401 },
    { live: { sessionActive: true, mfaAllowed: false }, status: 403 },
  ])("answers a denied live check with $status without decrypting or logging the reads", async ({ live, status }) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pending = request();
      await settle();
      answerLive(live);
      const response = await pending;
      await settle();

      expect(response.status).toBe(status);
      expect(state.events).toContain("rls:issues");
      expect(state.events).not.toContain("decrypt");
      expect(log.mock.calls.flat().map(String).join("\n")).not.toMatch(/issue-store|api\/issues/);
    } finally { log.mockRestore(); }
  });
});
