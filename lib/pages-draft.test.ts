import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The register of pages created and not yet written (MIN-270).
 *
 * What it holds is in one sentence, and it is the one that is costly to miss:
 * a scheduled destruction on unmount must be UNDOABLE. In Strict Mode,
 * React mounts, disassembles and reassembles each component in sequence; without
 * cancellation, the page is destroyed the second it is created, in the only
 * environment where we develop. The same beat can come from a restart
 * of Suspense in production.
 *
 * The other safeguard is SYMMETRY: a written page leaves the register, and
 * does not return there — a subsequent departure must no longer destroy anything.
 */

import {
  cancelDraftDiscard,
  forgetDraftPage,
  isDraftPage,
  markDraftPage,
  scheduleDraftDiscard,
} from "./pages-draft";

const PAGE = "page-1";

beforeEach(() => {
  vi.useFakeTimers();
  forgetDraftPage(PAGE);
  cancelDraftDiscard(PAGE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("le registre des brouillons", () => {
  it("knows only about a page just created", () => {
    expect(isDraftPage(PAGE)).toBe(false);
    markDraftPage(PAGE);
    expect(isDraftPage(PAGE)).toBe(true);
  });

  it("forgets a page as soon as it has been written", () => {
    markDraftPage(PAGE);
    forgetDraftPage(PAGE);
    expect(isDraftPage(PAGE)).toBe(false);
  });
});

describe("scheduled destruction", () => {
  it("n'a pas lieu tout de suite", () => {
    const discard = vi.fn();
    markDraftPage(PAGE);
    scheduleDraftDiscard(PAGE, discard);
    expect(discard).not.toHaveBeenCalled();
  });

  it("a lieu si personne ne revient", () => {
    const discard = vi.fn();
    markDraftPage(PAGE);
    scheduleDraftDiscard(PAGE, discard);
    vi.runAllTimers();
    expect(discard).toHaveBeenCalledTimes(1);
    // The fate of the page is resolved: it is no longer a draft.
    expect(isDraftPage(PAGE)).toBe(false);
  });

  it("is CANCELLED by an immediate remount (Strict Mode)", () => {
    const discard = vi.fn();
    markDraftPage(PAGE);
    scheduleDraftDiscard(PAGE, discard);
    cancelDraftDiscard(PAGE);
    vi.runAllTimers();
    expect(discard).not.toHaveBeenCalled();
    // And the page remains a draft: we haven't yet left for good.
    expect(isDraftPage(PAGE)).toBe(true);
  });

  it("ne s'empile pas quand deux départs se suivent", () => {
    const first = vi.fn();
    const second = vi.fn();
    markDraftPage(PAGE);
    scheduleDraftDiscard(PAGE, first);
    scheduleDraftDiscard(PAGE, second);
    vi.runAllTimers();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancelling without scheduling anything does not break anything", () => {
    expect(() => cancelDraftDiscard("inconnue")).not.toThrow();
  });
});
