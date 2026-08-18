// MIN-158: a shortcut on hover must always start on the element
// CURRENTLY under the pointer. What these tests hold is the rule that
// replaces the old stored hover state: the target is read again in the DOM at
// every strike, and the innermost hover wins.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  innermostHovered,
  noteTyping,
  pointerIsStale,
  registerHoverKeys,
  trackPointerFreshness,
} from "@/lib/keyboard/hover-keys";

interface FakeElement extends Element {
  hovered: boolean;
  parent?: FakeElement;
}

/**
 * Dummy element: just what the resolution touches in the DOM — `:hover`
 * state and parentage. `hovered` is placed by hand, as the browser would do.
 */
function el(name: string, parent?: FakeElement): FakeElement {
  const node: FakeElement = {
    name,
    hovered: false,
    parent,
    matches: (selector: string) => selector === ":hover" && node.hovered,
    contains: (other: FakeElement | null | undefined) => {
      for (let p = other; p; p = p.parent) if (p === node) return true;
      return false;
    },
  } as unknown as FakeElement;
  return node;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("innermostHovered", () => {
  it("rend le plus intérieur des inscrits sous le pointeur", () => {
    const parent = el("tâche parente");
    const child = el("sous-tâche", parent);
    const registry = new Map([
      [parent, "parent"],
      [child, "child"],
    ]);

    // Entering the subtask does not exit the parent: both
    // are hovered over, and it is the interior that the user is aiming for.
    parent.hovered = true;
    child.hovered = true;
    expect(innermostHovered(registry)).toBe("child");

    // Released to the parent alone.
    child.hovered = false;
    expect(innermostHovered(registry)).toBe("parent");
  });

  it("ne rend rien quand aucun inscrit n'est sous le pointeur", () => {
    const card = el("carte");
    const elsewhere = el("ailleurs");
    elsewhere.hovered = true;

    expect(innermostHovered(new Map([[card, "carte"]]))).toBeUndefined();
    expect(innermostHovered(new Map())).toBeUndefined();
  });

  it("oublie un élément désinscrit, même s'il est encore survolé", () => {
    const parent = el("tâche parente");
    const child = el("sous-tâche", parent);
    parent.hovered = true;
    child.hovered = true;
    const registry = new Map([
      [parent, "parent"],
      [child, "child"],
    ]);

    registry.delete(child);

    expect(innermostHovered(registry)).toBe("parent");
  });
});

// On the notebook, everything is editable and the editor takes focus when opened:
// “am I writing?” » is therefore not read on the focus, but on
// the order of the last two gestures — writing expires the pointer, moving it expires
// refresh.
describe("fraîcheur du pointeur", () => {
  /** Dummy window; makes it enough to trigger a `pointermove`. */
  function stubWindow() {
    const moves = new Set<() => void>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, fn: () => void) => {
        if (type === "pointermove") moves.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: () => void) => {
        if (type === "pointermove") moves.delete(fn);
      }),
    });
    return { moves, move: () => moves.forEach((fn) => fn()) };
  }

  it("périme le pointeur dès qu'on écrit, jusqu'au prochain mouvement", () => {
    const dom = stubWindow();
    const stop = trackPointerFreshness();

    // Open notebook, nothing written: the hovered task takes ⇧A/⇧P.
    expect(pointerIsStale()).toBe(false);

    // We write on another line, the mouse remains on this one.
    noteTyping();
    expect(pointerIsStale()).toBe(true);
    // And always after the next keystroke: only the order of the gestures counts,
    // never the time elapsed — a pause in the middle of a sentence does not open
    // window where the letter would be shortcut.
    noteTyping();
    expect(pointerIsStale()).toBe(true);

    // Aiming for a task again, even with a shudder, puts it back into play.
    dom.move();
    expect(pointerIsStale()).toBe(false);

    stop();
  });

  it("ne garde l'écouteur qu'entre le premier et le dernier suivi", () => {
    const dom = stubWindow();
    const stopA = trackPointerFreshness();
    const stopB = trackPointerFreshness();
    expect(dom.moves.size).toBe(1);

    stopA();
    expect(dom.moves.size).toBe(1);
    stopB();
    expect(dom.moves.size).toBe(0);
    // Stopping twice should neither throw away nor distort the count — otherwise follow-up
    // next would no longer open a listener, and the pointer would not refresh
    // plus jamais.
    stopB();
    expect(dom.moves.size).toBe(0);

    // A notebook closed on a keystroke does not reopen with an expired pointer.
    noteTyping();
    const stop = trackPointerFreshness();
    expect(pointerIsStale()).toBe(false);
    expect(dom.moves.size).toBe(1);
    stop();
  });
});

describe("registerHoverKeys", () => {
  /** Dummy window; enough to trigger a keydown on the earphone placed. */
  function stubWindow() {
    const listeners = new Set<(e: KeyboardEvent) => void>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((_type: string, fn: (e: KeyboardEvent) => void) =>
        listeners.add(fn)
      ),
      removeEventListener: vi.fn(
        (_type: string, fn: (e: KeyboardEvent) => void) => listeners.delete(fn)
      ),
    });
    return {
      listeners,
      press: () => listeners.forEach((fn) => fn({ key: "s" } as KeyboardEvent)),
    };
  }

  it("n'envoie la touche qu'à la carte sous le pointeur, pas à la précédente", () => {
    const dom = stubWindow();
    // The previous card remains mounted and written, like on a board; alone
    // the current map is hovered over when typing.
    const previous = el("carte précédente");
    const current = el("carte courante");
    current.hovered = true;
    const onPrevious = vi.fn();
    const onCurrent = vi.fn();

    // The previous one is registered FIRST: the subscription order owes nothing
    // decide — he was the one who decided when each card placed its earpiece.
    const offPrevious = registerHoverKeys(previous, onPrevious);
    const offCurrent = registerHoverKeys(current, onCurrent);

    dom.press();

    expect(onCurrent).toHaveBeenCalledTimes(1);
    expect(onPrevious).not.toHaveBeenCalled();

    offPrevious();
    offCurrent();
  });

  it("ne garde un écouteur qu'entre le premier et le dernier inscrit", () => {
    const dom = stubWindow();
    const offA = registerHoverKeys(el("a"), vi.fn());
    const offB = registerHoverKeys(el("b"), vi.fn());
    expect(dom.listeners.size).toBe(1);

    offA();
    expect(dom.listeners.size).toBe(1);
    offB();
    expect(dom.listeners.size).toBe(0);
    // Unregister twice should neither throw nor reopen the listener.
    offB();
    expect(dom.listeners.size).toBe(0);
  });
});
