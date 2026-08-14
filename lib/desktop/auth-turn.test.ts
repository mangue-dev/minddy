// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  beginDesktopAuthTurn,
  clearDesktopAuthTurn,
  consumeDesktopAuthTurn,
} from "./auth-turn";

/**
 * MIN-345 — ce que le nonce doit refuser. Le cas qui compte est le premier :
 * un `minddy://auth?code=…` que le système livre à l'app sans qu'elle ait rien
 * demandé, et qui la connectait au compte de son expéditeur.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consumeDesktopAuthTurn", () => {
  it("accepte le nonce du tour en cours", () => {
    const turn = beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn(turn)).toBe(true);
  });

  it("refuse un lien qui n'en porte aucun", () => {
    beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn(undefined)).toBe(false);
  });

  it("refuse un lien alors qu'aucun tour n'a été démarré", () => {
    expect(consumeDesktopAuthTurn("n0nce")).toBe(false);
  });

  it("refuse un nonce qui n'est pas le nôtre", () => {
    beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn("un-autre")).toBe(false);
  });

  it("ne vaut qu'une réponse : le second passage est refusé", () => {
    const turn = beginDesktopAuthTurn();
    expect(consumeDesktopAuthTurn(turn)).toBe(true);
    expect(consumeDesktopAuthTurn(turn)).toBe(false);
  });

  it("refuse un tour abandonné depuis un quart d'heure", () => {
    vi.useFakeTimers();
    const turn = beginDesktopAuthTurn();
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(consumeDesktopAuthTurn(turn)).toBe(false);
  });

  it("tire un nonce différent à chaque tour", () => {
    const first = beginDesktopAuthTurn();
    clearDesktopAuthTurn();
    expect(beginDesktopAuthTurn()).not.toBe(first);
  });
});
