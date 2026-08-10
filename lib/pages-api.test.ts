import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PageApiError,
  PageConflictError,
  fetchPagesApi,
  isPageCycleError,
  updatePageApi,
} from "./pages-api";

/**
 * MIN-270 — le client HTTP des pages, et ce qu'il fait d'un REFUS.
 *
 * Le point qui compte : un 409 (déplacement qui fermerait une boucle) doit
 * rester reconnaissable côté arbre. Son message est traduit par le serveur, donc
 * illisible pour du code — sans le CODE porté par l'erreur, l'arbre ne pourrait
 * pas dire « une page ne peut pas aller dans sa propre sous-page » et retomberait
 * sur un « échec » générique pour le seul refus qui ait une explication.
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
  it("rend la liste à plat telle quelle", async () => {
    mockFetch({ ok: true, status: 200, body: [{ id: "p1" }] });
    await expect(fetchPagesApi("proj")).resolves.toEqual([{ id: "p1" }]);
  });

  it("reconnaît le refus de cycle, et lui seul", async () => {
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

  it("retombe sur un message par défaut quand le corps n'en porte pas", async () => {
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
   * MIN-271 — les deux 409 ne se rattrapent pas de la même façon. Celui de la
   * VERSION porte la page du serveur (corps compris) : c'est ce qui permet de
   * fusionner sans un aller-retour de plus. Et il ne doit surtout pas se faire
   * passer pour un refus de cycle, sans quoi l'arbre dirait « une page ne peut
   * pas aller dans sa propre sous-page » à quelqu'un qui vient d'être doublé.
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
