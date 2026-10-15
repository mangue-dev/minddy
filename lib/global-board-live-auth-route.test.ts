import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript-api";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const state = vi.hoisted(() => ({
  events: [] as string[],
  cycles: false,
  revokedReads: false,
  answerLive: (_body: unknown) => {},
}));

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("./cycle-prefs", () => ({ resolveCyclePrefs: () => ({ enabled: state.cycles }) }));
vi.mock("./server/cycles", () => ({
  ensureCycles: vi.fn(async () => {
    state.events.push("cycles");
    return { current: null, upcoming: [], past: [] };
  }),
  toCycleInfo: vi.fn(),
  todayInTz: vi.fn(),
}));
vi.mock("./server/project-members", () => ({
  buildMembersByProject: vi.fn(async () => {
    state.events.push("members");
    return { members: {}, projectIds: [] };
  }),
}));
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

const { GET } = await import("@/app/api/me/board/route");

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
  if (name.startsWith("rls:") && state.revokedReads) {
    return json({ code: "42501", message: "Auth session is no longer active" }, 403);
  }
  if (name === "rls:projects") return json([{ id: PROJECT_ID, owner_id: USER_ID }]);
  return json([]);
}

async function settle() {
  for (let turn = 0; turn < 20; turn++) await new Promise((done) => setImmediate(done));
}

function answerLive(live: { sessionActive: boolean; mfaAllowed: boolean }) {
  state.events.push("live:answered");
  state.answerLive(live);
}

const RLS_READS = ["rls:issues", "rls:projects", "rls:categories", "rls:objectives", "rls:issue_relations"];

beforeEach(() => {
  state.events = [];
  state.cycles = false;
  state.revokedReads = false;
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_INTERNAL_URL", "");
  vi.stubGlobal("fetch", vi.fn(transport));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("global board reads overlapped with the live session check", () => {
  it("sends its RLS reads before the live check resolves and its service reads after it", async () => {
    const pending = GET(new NextRequest("http://localhost/api/me/board"));
    await settle();

    expect(state.events).toContain("service:rpc/auth_authorization_state");
    expect(state.events).toEqual(expect.arrayContaining(RLS_READS));
    expect(state.events).not.toContain("members");
    expect(state.events).not.toContain("service:integrations");

    answerLive({ sessionActive: true, mfaAllowed: true });
    const response = await pending;
    expect(response.status).toBe(200);
    const answered = state.events.indexOf("live:answered");
    expect(state.events.indexOf("members")).toBeGreaterThan(answered);
    expect(state.events.indexOf("service:integrations")).toBeGreaterThan(answered);
  });

  it("answers a revoked session with 401 although its reads fail in the pre-request hook", async () => {
    state.revokedReads = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pending = GET(new NextRequest("http://localhost/api/me/board"));
      await settle();
      answerLive({ sessionActive: false, mfaAllowed: true });
      const response = await pending;
      await settle();

      expect(response.status).toBe(401);
      expect(state.events).not.toContain("members");
      expect(state.events).not.toContain("service:integrations");
      expect(log.mock.calls.flat().map(String).join("\n")).not.toMatch(/issue-store|api\/me\/board/);
    } finally { log.mockRestore(); }
  });

  it("keeps cycle reconciliation and the reads after the live check", async () => {
    state.cycles = true;
    const pending = GET(new NextRequest("http://localhost/api/me/board"));
    await settle();

    expect(state.events).toEqual(["service:rpc/auth_authorization_state"]);

    answerLive({ sessionActive: true, mfaAllowed: true });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(state.events.indexOf("cycles")).toBeGreaterThan(state.events.indexOf("live:answered"));
    expect(state.events.indexOf("rls:issues")).toBeGreaterThan(state.events.indexOf("cycles"));
  });
});

describe("overlapped RLS read callbacks", () => {
  const forbiddenIdentifiers = new Set(["getServiceClient", "service"]);
  const forbiddenMethods = new Set(["insert", "update", "upsert", "delete", "rpc"]);

  /** The callback and every same-file function it reaches, by name. */
  function reachable(callback: ts.Node, functions: Map<string, ts.Node>): ts.Node[] {
    const nodes = [callback];
    for (let index = 0; index < nodes.length; index++) {
      const visit = (node: ts.Node) => {
        const target = ts.isIdentifier(node) ? functions.get(node.text) : undefined;
        if (target && !nodes.includes(target)) nodes.push(target);
        node.forEachChild(visit);
      };
      visit(nodes[index]);
    }
    return nodes;
  }

  function violations(file: string): { callbacks: number; found: string[] } {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
    const functions = new Map<string, ts.Node>();
    source.forEachChild((node) => {
      if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.initializer) {
            functions.set(declaration.name.text, declaration.initializer);
          }
        }
      }
    });
    const callbacks: ts.Node[] = [];
    const findCalls = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === "getAuthedUserWithRlsReads") callbacks.push(node.arguments[1]);
      node.forEachChild(findCalls);
    };
    findCalls(source);
    const found: string[] = [];
    for (const node of callbacks.flatMap((callback) => reachable(callback, functions))) {
      const inspect = (child: ts.Node) => {
        if (ts.isIdentifier(child) && forbiddenIdentifiers.has(child.text)) found.push(child.text);
        if (ts.isPropertyAccessExpression(child) && forbiddenMethods.has(child.name.text)) found.push(`.${child.name.text}`);
        child.forEachChild(inspect);
      };
      inspect(node);
    }
    return { callbacks: callbacks.length, found };
  }

  it("never reach the service client or a write before the live check", () => {
    const root = join(process.cwd(), "app");
    const callers = (readdirSync(root, { recursive: true }) as string[])
      .filter((path) => /\.tsx?$/.test(path))
      .map((path) => join("app", path))
      .filter((path) => readFileSync(join(process.cwd(), path), "utf8").includes("getAuthedUserWithRlsReads("));

    expect(callers.sort()).toEqual(["app/api/me/app-tabs/route.ts", "app/api/me/board/route.ts", "app/api/projects/[id]/issues/route.ts"]);
    for (const path of callers) {
      expect({ path, ...violations(join(process.cwd(), path)) }).toEqual({ path, callbacks: 1, found: [] });
    }
  });
});
