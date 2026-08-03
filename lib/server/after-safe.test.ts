import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-147 — `after()` hors requête.
 *
 * Les travaux de fond de `updateIssueFields` (Smart Assign, cycles, synchro du
 * feedback, automatisations) étaient programmés par `after()`, qui EXIGE un
 * contexte de requête. Tant que ce cœur d'écriture n'était appelé que par des
 * routes, la question ne se posait pas.
 *
 * Le moteur d'automatisations l'appelle depuis une cascade — hors de toute
 * requête. `after()` y lève, et il levait AVANT le crochet suivant : il
 * emportait donc tout ce qui restait à programmer, plus l'écriture elle-même.
 */

const H = vi.hoisted(() => ({
  throws: false,
  registered: [] as Array<() => void | Promise<void>>,
}));

vi.mock("next/server", () => ({
  after: (fn: () => void | Promise<void>) => {
    if (H.throws) throw new Error("`after` was called outside a request scope.");
    H.registered.push(fn);
  },
}));

const { afterOrNow } = await import("./after-safe");

beforeEach(() => {
  H.throws = false;
  H.registered = [];
  vi.restoreAllMocks();
});

describe("afterOrNow", () => {
  it("dans une requête : le travail est DIFFÉRÉ, comme avant", () => {
    const work = vi.fn();
    afterOrNow(work);
    expect(H.registered).toHaveLength(1);
    expect(work).not.toHaveBeenCalled(); // rien sur le chemin critique
    H.registered[0]();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("hors requête : le travail part TOUT DE SUITE, sans lever", () => {
    H.throws = true;
    const work = vi.fn();
    expect(() => afterOrNow(work)).not.toThrow();
    // Sans requête, il n'y a pas de réponse à attendre.
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("un travail qui lève ne remonte JAMAIS à l'appelant", () => {
    H.throws = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      afterOrNow(() => {
        throw new Error("boom");
      }),
    ).not.toThrow();
  });

  it("une promesse rejetée est avalée, pas laissée non gérée", async () => {
    H.throws = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    afterOrNow(async () => {
      throw new Error("async boom");
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalled();
  });
});
