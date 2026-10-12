// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  beginDesktopAuthTurn,
  clearDesktopAuthTurn,
  consumeDesktopAuthTurn,
} from "./auth-turn";

/**
 * MIN-345 — what the nonce should refuse. The case that counts is the first:
 * a `minddy://auth?code=…` that the system delivers to the app without it having anything
 * requested, and which connected it to the account of its sender.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consumeDesktopAuthTurn", () => {
  it("accepts the nonce of the current turn", () => {
    const turn = beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn(turn)).toBe(true);
  });

  it("rejects a link without a nonce", () => {
    const turn = beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn(undefined)).toBe(false);
    expect(consumeDesktopAuthTurn(turn)).toBe(true);
  });

  it("rejects a link when no turn was started", () => {
    expect(consumeDesktopAuthTurn("n0nce")).toBe(false);
  });

  it("rejects an unrelated nonce", () => {
    const turn = beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn("unrelated")).toBe(false);
    expect(consumeDesktopAuthTurn(turn)).toBe(true);
  });

  it("accepts a nonce only once", () => {
    const turn = beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn(turn)).toBe(true);
    expect(consumeDesktopAuthTurn(turn)).toBe(false);
  });

  it("rejects a turn abandoned for more than fifteen minutes", () => {
    vi.useFakeTimers();
    const turn = beginDesktopAuthTurn();
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(consumeDesktopAuthTurn(turn)).toBe(false);
  });

  it("preserves a newer turn when an older OAuth callback arrives first", () => {
    const oldTurn = beginDesktopAuthTurn();
    const currentTurn = beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn(oldTurn)).toBe(false);
    expect(consumeDesktopAuthTurn(currentTurn)).toBe(true);
  });

  it("generates a different nonce for each turn", () => {
    const first = beginDesktopAuthTurn();
    clearDesktopAuthTurn();
    expect(beginDesktopAuthTurn()).not.toBe(first);
  });
});
