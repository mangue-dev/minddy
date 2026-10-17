import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));

import {
  PageApiError,
  PageConflictError,
  createPageApi,
  fetchPagesApi,
  isPageCycleError,
  prepareInitialBriefApi,
  submitPageCollaborationApi,
  updatePageApi,
} from "./pages-api";

/**
 * MIN-270 — the HTTP client for pages, and what it does with a REFUSAL.
 *
 * The point that matters: a 409 (a move that would close a loop) must
 * remain recognizable on the tree side. Its message is translated by the server, so
 * unreadable for code — without the CODE carried by the error, the tree could
 * not say "a page cannot go to its own subpage" and would fall
 * to a generic "failure" for the only refusal that has an explanation.
 */

function mockFetch(response: {
  ok: boolean;
  status: number;
  body: unknown;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(response.body, { status: response.status }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pages-api", () => {
  it("returns the validated brief body for the later page write", async () => {
    const content = { type: "doc", content: [] };
    mockFetch({ ok: true, status: 200, body: { content } });
    await expect(prepareInitialBriefApi("# Initial brief")).resolves.toEqual(content);
    expect(fetch).toHaveBeenCalledWith("/api/account/project-brief", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: "# Initial brief" }),
    });
  });

  it("preserves the projected-page refusal message and status", async () => {
    mockFetch({ ok: false, status: 413, body: { error: "Page too large" } });
    await expect(prepareInitialBriefApi("x\n\n".repeat(16_666))).rejects.toMatchObject({
      message: "Page too large", status: 413,
    });
  });

  it("keeps optimistic creation alive across immediate navigation", async () => {
    const body = { id: "page-1" };
    mockFetch({ ok: true, status: 201, body });

    await expect(
      createPageApi("proj", { id: "page-1" }, { keepalive: true }),
    ).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/proj/pages",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  it("returns the flat list as-is", async () => {
    mockFetch({ ok: true, status: 200, body: [{ id: "p1" }] });
    await expect(fetchPagesApi("proj")).resolves.toEqual([{ id: "p1" }]);
  });

  it("recognizes the cycle refusal and only that", async () => {
    mockFetch({ ok: false, status: 409, body: { error: "Boucle" } });
    const cycle = await updatePageApi("proj", "p1", { parent_id: "p2" }).catch(
      (err: unknown) => err
    );
    expect(cycle).toBeInstanceOf(PageApiError);
    expect((cycle as PageApiError).status).toBe(409);
    expect((cycle as PageApiError).message).toBe("Boucle");
    expect(isPageCycleError(cycle)).toBe(true);

    mockFetch({ ok: false, status: 500, body: { error: "Panne" } });
    const boom = await updatePageApi("proj", "p1", { title: "x" }).catch(
      (err: unknown) => err
    );
    expect(isPageCycleError(boom)).toBe(false);
  });

  it("falls back to a default message when the body has none", async () => {
    mockFetch({ ok: false, status: 500, body: {} });
    await expect(updatePageApi("proj", "p1", { title: "x" })).rejects.toThrow(
      "Update failed"
    );
  });

  it("n'est pas un cycle si ce n'est pas une erreur de l'API", () => {
    expect(isPageCycleError(new Error("409"))).toBe(false);
    expect(isPageCycleError(null)).toBe(false);
  });

  /**
 * MIN-271 — the two 409s do not catch up in the same way. That of the
 * VERSION carries the server page (body included): this is what allows
 * to merge without an additional round trip. And above all it must not pass as a cycle refusal, otherwise the tree would say "a page cannot go to its own subpage" to someone who has just been overtaken.
 */
  it("distingue le refus de VERSION, et lui donne la page du serveur", async () => {
    const server = { id: "p1", version: 7, content: { type: "doc" } };
    mockFetch({
      ok: false,
      status: 409,
      body: { error: "Périmé", conflict: true, page: server },
    });

    const err = await updatePageApi("proj", "p1", {
      content: { type: "doc" },
      version: 5,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PageConflictError);
    expect((err as PageConflictError).page.version).toBe(7);
    expect(isPageCycleError(err)).toBe(false);
  });

  it("reste un refus de cycle quand le 409 ne porte pas de page", async () => {
    mockFetch({ ok: false, status: 409, body: { error: "Boucle" } });
    const err = await updatePageApi("proj", "p1", { parent_id: "p2" }).catch(
      (e: unknown) => e
    );
    expect(err).not.toBeInstanceOf(PageConflictError);
    expect(isPageCycleError(err)).toBe(true);
  });
});

describe("live collaboration batches (MIN-688)", () => {
  const submission = {
    field: "body" as const, base: 0, batchId: "11111111-1111-4111-8111-111111111111",
    clientId: "browser-session-1", steps: [{ stepType: "replace" }],
  };

  it("reads every definitive answer as an answer, 400 included", async () => {
    for (const [status, body] of [
      [200, { status: "accepted", revision: 1 }],
      [409, { status: "behind", head: 3 }],
      [400, { status: "refused", reason: "invalid-step" }],
      [413, { status: "refused", reason: "too-large" }],
      [422, { status: "refused", reason: "content-refused" }],
    ] as const) {
      mockFetch({ ok: status === 200, status, body });
      await expect(submitPageCollaborationApi("p", "page", submission)).resolves.toEqual(body);
    }
  });

  it("still throws on a failure without a refusal, which the stream retries or stops on", async () => {
    mockFetch({ ok: false, status: 500, body: { error: "boom" } });
    await expect(submitPageCollaborationApi("p", "page", submission)).rejects.toBeInstanceOf(PageApiError);
    mockFetch({ ok: false, status: 400, body: { error: "Invalid JSON" } });
    await expect(submitPageCollaborationApi("p", "page", submission)).rejects.toBeInstanceOf(PageApiError);
  });

  it("sends the latest collaboration token the server issued for the page", async () => {
    const calls: Headers[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(new Headers(init?.headers));
      return Response.json({ status: "accepted", revision: 1 },
        { status: 200, headers: { "x-minddy-collab-token": `token-${calls.length}` } });
    }));
    await submitPageCollaborationApi("p", "token-page", submission);
    await submitPageCollaborationApi("p", "token-page", submission);
    expect(calls[0].get("x-minddy-collab-token")).toBeNull();
    expect(calls[1].get("x-minddy-collab-token")).toBe("token-1");
  });
});
