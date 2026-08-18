import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-147 — `after()` out of request.
 *
 * The background work of `updateIssueFields` (Smart Assign, cycles, sync of
 * feedback, automations) was programmed by `after()`, which REQUIRES a
 * query context. As long as this write core was only called by
 * routes, the question did not arise.
 *
 * The automation engine calls it from a cascade — outside of any
 * request. `after()` raises it, and it raised BEFORE the following hook: it
 * therefore took away everything that remained to be programmed, plus the writing itself.
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
    expect(work).not.toHaveBeenCalled(); // nothing on the critical path
    H.registered[0]();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("hors requête : le travail part TOUT DE SUITE, sans lever", () => {
    H.throws = true;
    const work = vi.fn();
    expect(() => afterOrNow(work)).not.toThrow();
    // Without a request, there is no response to wait for.
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

  it("le crochet ATTEND le travail — sinon la lambda gèle en vol", async () => {
    // `after()` returns to the platform's `waitUntil` what its callback renders.
    // A callback that gives up before the end of the work leaves it frozen
    // the invocation, and a current outgoing request dies: “fetch failed”.
    let done = false;
    afterOrNow(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    await H.registered[0]();
    expect(done).toBe(true);
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
