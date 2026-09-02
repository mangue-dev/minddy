import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PageApiError,
  PageConflictError,
  createPageApi,
  fetchPagesApi,
  isPageCycleError,
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
    vi.fn(async () => ({
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pages-api", () => {
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
