import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const getClaims = vi.fn();
const rpc = vi.fn();
const authorizationAbortSignal = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { getAuthedUser, authorizeUserClient, getAuthedUserWithRlsReads, withSharedLiveAuthorization } = await import("./api-auth");
const { supabaseServerFetch, supabaseServerFetchWithTimeout } = await import("./supabase-fetch");

function request(): NextRequest {
  return new NextRequest("https://www.minddy.app/api/projects");
}

function signedClaims(overrides: Record<string, unknown> = {}) {
  getClaims.mockResolvedValue({
    data: {
      claims: {
        sub: USER_ID,
        session_id: SESSION_ID,
        aal: "aal1",
        amr: [],
        app_metadata: {},
        ...overrides,
      },
    },
    error: null,
  });
}

beforeEach(() => {
  getClaims.mockReset();
  rpc.mockReset();
  authorizationAbortSignal.mockReset();
  signedClaims();
  authorizationAbortSignal.mockResolvedValue({
    data: { sessionActive: true, mfaAllowed: true },
    error: null,
  });
  rpc.mockReturnValue({ abortSignal: authorizationAbortSignal });
});

describe("getAuthedUser live authorization enforcement", () => {
  it.each(["origin", "referer"])("does not log private %s headers for rejected writes in production", async (header) => {
    const sentinel = "MIN591_PRIVATE_ORIGIN_SENTINEL";
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await getAuthedUser(new NextRequest("https://www.minddy.app/api/projects", {
        method: "POST", headers: { [header]: `https://synthetic.invalid/${sentinel}` },
      }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(sentinel);
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });

  it.each(["response", "exception"])("does not log private live authorization %s failures in production", async (failure) => {
    const sentinel = "MIN591_PRIVATE_AUTHORIZATION_SENTINEL";
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "response") authorizationAbortSignal.mockResolvedValue({ data: null, error: { message: sentinel } });
    else authorizationAbortSignal.mockRejectedValue(new Error(sentinel));
    try {
      const result = await getAuthedUser(request());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(503);
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(sentinel);
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("returns a controlled failure instead of propagating private authentication exceptions in production", async () => {
    const sentinel = "MIN591_PRIVATE_CLAIMS_SENTINEL";
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaims.mockRejectedValue(new Error(sentinel));
    try {
      const result = await getAuthedUser(request());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(503);
        expect(JSON.stringify(await result.response.json())).not.toContain(sentinel);
      }
      expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(sentinel);
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });
  it("rejects an AAL1 token minted before the account enrolled MFA", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toMatchObject({ code: "mfa_required" });
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: USER_ID,
      p_session: SESSION_ID,
      p_aal: "aal1",
      p_amr: [],
    });
    expect(authorizationAbortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("allows AAL1 only while the live session and MFA state permit it", async () => {
    const result = await getAuthedUser(request());

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects a protected AAL1 claim from live state", async () => {
    signedClaims({ app_metadata: { mfa_enabled: true } });
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("accepts AAL2 only after checking live session and factor state", async () => {
    signedClaims({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: 1_788_739_200 }],
      app_metadata: { mfa_enabled: true },
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: USER_ID,
      p_session: SESSION_ID,
      p_aal: "aal2",
      p_amr: [{ method: "totp", timestamp: 1_788_739_200 }],
    });
  });

  it("rejects a stale AAL2 token after the last factor is removed", async () => {
    signedClaims({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: 1_788_739_200 }],
      app_metadata: { mfa_enabled: true },
    });
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });

  it("rejects an old AAL2 AMR epoch after replacement-factor verification", async () => {
    signedClaims({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: 1_788_739_200 }],
      app_metadata: { mfa_enabled: true },
    });
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: USER_ID,
      p_session: SESSION_ID,
      p_aal: "aal2",
      p_amr: [{ method: "totp", timestamp: 1_788_739_200 }],
    });
  });

  it("keeps the recovery route available at AAL1 while checking its session", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request(), { allowAal1: true });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects a revoked live session", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: false, mfaAllowed: true },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it.each([undefined, "not-a-uuid"])(
    "rejects a missing or malformed session identifier (%s)",
    async (sessionId) => {
      signedClaims({ session_id: sessionId });

      const result = await getAuthedUser(request());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the live authorization lookup fails", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
  });

  it("fails closed when the live authorization response is malformed", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
  });
});

describe("request-scoped server component authorization", () => {
  it.each([
    { sessionActive: true, mfaAllowed: true, status: 200 },
    { sessionActive: false, mfaAllowed: true, status: 401 },
    { sessionActive: true, mfaAllowed: false, status: 403 },
  ])("shares the live session and MFA boundary ($status)", async ({ status, ...liveState }) => {
    const client = { auth: { getClaims } } as unknown as SupabaseClient;
    authorizationAbortSignal.mockResolvedValue({ data: liveState, error: null });

    const result = await authorizeUserClient(client);

    expect(result.ok ? 200 : result.response.status).toBe(status);
    expect(getClaims).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: USER_ID, p_session: SESSION_ID, p_aal: "aal1", p_amr: [],
    });
    if (result.ok) {
      expect(result.supabase).toBe(client);
      expect(result.user.id).toBe(USER_ID);
    }
  });

  it("does not accept signed claims when the live lookup is unavailable", async () => {
    const client = { auth: { getClaims } } as unknown as SupabaseClient;
    authorizationAbortSignal.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const result = await authorizeUserClient(client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});

describe("RLS reads overlapped with the live authorization check", () => {
  function deferredLiveState() {
    let resolve!: (value: unknown) => void;
    authorizationAbortSignal.mockReturnValue(new Promise((done) => { resolve = done; }));
    return (state: unknown) => resolve(state);
  }

  async function settle() {
    for (let turn = 0; turn < 10; turn++) await new Promise((done) => setImmediate(done));
  }

  afterEach(() => { vi.unstubAllGlobals(); });

  it("starts the reads before the live check resolves and returns them only after it", async () => {
    const answer = deferredLiveState();
    const readRls = vi.fn(async (_verified: { user: { id: string } }) => "rows");
    let settled = false;
    const pending = getAuthedUserWithRlsReads(request(), readRls).finally(() => { settled = true; });
    await settle();

    expect(rpc).toHaveBeenCalledOnce();
    expect(readRls).toHaveBeenCalledOnce();
    expect(Object.keys(readRls.mock.calls[0][0])).toEqual(["user", "supabase"]);
    expect(readRls.mock.calls[0][0].user.id).toBe(USER_ID);
    expect(settled).toBe(false);

    answer({ data: { sessionActive: true, mfaAllowed: true }, error: null });
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) expect(await result.reads).toBe("rows");
  });

  it.each([
    { name: "a revoked session", live: { data: { sessionActive: false, mfaAllowed: true }, error: null }, status: 401 },
    { name: "a missing second factor", live: { data: { sessionActive: true, mfaAllowed: false }, error: null }, status: 403 },
    { name: "an unavailable lookup", live: { data: null, error: { message: "unavailable" } }, status: 503 },
  ])("answers $name with the serial response even when the reads fail", async ({ live, status }) => {
    const answer = deferredLiveState();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pending = getAuthedUserWithRlsReads(request(), async () => {
        throw new Error("insufficient_privilege 42501");
      });
      await settle();
      answer(live);
      const result = await pending;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(status);
      expect("reads" in result).toBe(false);
      if (status === 403) expect(await result.response.json()).toMatchObject({ code: "mfa_required" });
    } finally { log.mockRestore(); }
  });

  it("holds request responses and service requests until the live check succeeds", async () => {
    const answer = deferredLiveState();
    const transport = vi.fn<typeof fetch>(async (input) => new Response(String(input)));
    vi.stubGlobal("fetch", transport);
    let delivered = false;
    const pending = getAuthedUserWithRlsReads(request(), () => Promise.all([
      supabaseServerFetchWithTimeout("https://project.supabase.co/rest/v1/issues")
        .then((response) => { delivered = true; return response.text(); }),
      supabaseServerFetch("https://project.supabase.co/rest/v1/envelope_data_keys")
        .then((response) => response.text()),
    ]));
    await settle();

    expect(transport.mock.calls.map(([input]) => String(input)))
      .toEqual(["https://project.supabase.co/rest/v1/issues"]);
    expect(delivered).toBe(false);

    answer({ data: { sessionActive: true, mfaAllowed: true }, error: null });
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await result.reads).toEqual([
      "https://project.supabase.co/rest/v1/issues",
      "https://project.supabase.co/rest/v1/envelope_data_keys",
    ]);
  });

  it("aborts a denied read and never delivers it or sends a follow-up request", async () => {
    const answer = deferredLiveState();
    const signals: AbortSignal[] = [];
    const transport = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      const signal = init!.signal!;
      signals.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason));
    }));
    vi.stubGlobal("fetch", transport);
    let observed = false;
    const pending = getAuthedUserWithRlsReads(request(), () =>
      supabaseServerFetchWithTimeout("https://project.supabase.co/rest/v1/issues")
        .then(() => supabaseServerFetch("https://project.supabase.co/rest/v1/envelope_data_keys"))
        .finally(() => { observed = true; }));
    await settle();
    expect(signals).toHaveLength(1);

    answer({ data: { sessionActive: false, mfaAllowed: true }, error: null });
    const result = await pending;
    await settle();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(signals[0].aborted).toBe(true);
    expect(transport).toHaveBeenCalledOnce();
    expect(observed).toBe(false);
  });
});

describe("live authorization shared within one document's reads", () => {
  it("looks the session up once for several handlers, and still applies the answer to each", async () => {
    authorizationAbortSignal.mockResolvedValue({ data: { sessionActive: false, mfaAllowed: true }, error: null });
    const results = await withSharedLiveAuthorization(() => Promise.all([getAuthedUser(request()), getAuthedUser(request())]));
    expect(rpc).toHaveBeenCalledOnce();
    expect(results.map((result) => result.ok)).toEqual([false, false]);
  });

  it("does not share a failed lookup, nor across scopes or sessions", async () => {
    authorizationAbortSignal.mockRejectedValueOnce(new Error("unreachable"));
    await withSharedLiveAuthorization(async () => {
      expect((await getAuthedUser(request())).ok).toBe(false);
      expect((await getAuthedUser(request())).ok).toBe(true);
      signedClaims({ session_id: "33333333-3333-4333-8333-333333333333" });
      expect((await getAuthedUser(request())).ok).toBe(true);
    });
    expect(rpc).toHaveBeenCalledTimes(3);
    await getAuthedUser(request());
    expect(rpc).toHaveBeenCalledTimes(4);
  });
});

describe("the request's event actor (MIN-926)", () => {
  // A route handler as they are written: authenticate first, then write
  // through the service-role client, where the database sees no session.
  async function handler(tag: string) {
    const auth = await getAuthedUser(request());
    if (!auth.ok) return null;
    // Interleave the two requests before they write.
    await new Promise((resolve) => setTimeout(resolve, tag === "first" ? 5 : 1));
    await supabaseServerFetch(`https://project.supabase.co/rest/v1/issues?tag=${tag}`, { method: "PATCH" });
    return auth.user.id;
  }

  it("attributes each handler's later writes to its own verified user", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("[]"));
    vi.stubGlobal("fetch", transport);
    const other = "33333333-3333-4333-8333-333333333333";
    const claims = (sub: string) => ({ data: { claims: { sub, session_id: SESSION_ID, aal: "aal1", amr: [], app_metadata: {} } }, error: null });
    // Each request verifies its own session, in the order the handlers start.
    getClaims.mockResolvedValueOnce(claims(USER_ID)).mockResolvedValueOnce(claims(other));
    try {
      // Next.js runs every request in a context of its own.
      const requestScope = new AsyncLocalStorage<object>();
      await Promise.all([
        requestScope.run({}, () => handler("first")),
        requestScope.run({}, () => handler("second")),
      ]);
      const byTag = Object.fromEntries(transport.mock.calls.map(([url, init]) => [
        new URL(String(url)).searchParams.get("tag"),
        new Headers(init?.headers),
      ]));
      expect(byTag.first.get("x-minddy-actor-id")).toBe(USER_ID);
      expect(byTag.second.get("x-minddy-actor-id")).toBe(other);
      expect(byTag.first.get("x-minddy-actor-kind")).toBe("user");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not name anyone when authentication fails", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("[]"));
    vi.stubGlobal("fetch", transport);
    try {
      authorizationAbortSignal.mockResolvedValue({ data: { sessionActive: false, mfaAllowed: true }, error: null });
      const auth = await getAuthedUser(request());
      expect(auth.ok).toBe(false);
      await supabaseServerFetch("https://project.supabase.co/rest/v1/issues", { method: "PATCH" });
      expect(new Headers(transport.mock.calls.at(-1)?.[1]?.headers).get("x-minddy-actor-id")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
