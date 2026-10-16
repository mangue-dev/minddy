import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const state = vi.hoisted(() => ({
  signals: [] as AbortSignal[],
  answerAccess: (_allowed: boolean) => {},
}));

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: () => new Promise((resolve) => {
    state.answerAccess = (allowed) => resolve(allowed ? { project: { id: PROJECT_ID }, isOwner: true, isMember: true } : null);
  }),
}));
// The real service client over a stubbed transport, so the request signal scope is exercised.
vi.mock("@/lib/supabase-service", async () => {
  const { createClient } = await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  const { supabaseServerFetch } = await import("./supabase-fetch");
  let client: SupabaseClient | undefined;
  return {
    getServiceClient: () => client ??= createClient("https://service.supabase.test", "service-key", {
      global: { fetch: supabaseServerFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
});

const { listPages } = await import("./pages");

beforeEach(() => {
  state.signals = [];
  vi.stubEnv("SUPABASE_INTERNAL_URL", "");
  vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init!.signal!;
    state.signals.push(signal);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function settle() {
  for (let turn = 0; turn < 20; turn++) await new Promise((done) => setImmediate(done));
}

describe("page list reads overlapped with the access check", () => {
  it("aborts the overlapped first batch when access is denied", async () => {
    const pending = listPages(PROJECT_ID, "actor");
    await settle();
    expect(state.signals).toHaveLength(1);
    expect(state.signals[0].aborted).toBe(false);

    state.answerAccess(false);
    expect(await pending).toEqual({ ok: false, status: 404, errorKey: "projectNotFound" });
    expect(state.signals[0].aborted).toBe(true);
    await settle();
    expect(state.signals).toHaveLength(1);
  });
});
