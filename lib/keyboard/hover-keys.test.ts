// MIN-158 : un raccourci au survol doit toujours partir sur l'élément
// ACTUELLEMENT sous le pointeur. Ce que ces tests tiennent, c'est la règle qui
// remplace l'ancien état de survol mémorisé : la cible se relit dans le DOM à
// chaque frappe, et le plus intérieur des survolés gagne.

import { afterEach, describe, expect, it, vi } from "vitest";
import { innermostHovered, registerHoverKeys } from "@/lib/keyboard/hover-keys";

interface FakeElement extends Element {
  hovered: boolean;
  parent?: FakeElement;
}

/**
 * Élément factice : juste ce que la résolution touche du DOM — l'état `:hover`
 * et la parenté. `hovered` se pose à la main, comme le navigateur le ferait.
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

    // Entrer dans la sous-tâche ne fait pas sortir de la parente : les deux
    // sont survolées, et c'est l'intérieure que l'utilisateur vise.
    parent.hovered = true;
    child.hovered = true;
    expect(innermostHovered(registry)).toBe("child");

    // Ressorti dans la parente seule.
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

describe("registerHoverKeys", () => {
  /** Fenêtre factice ; rend de quoi déclencher un keydown sur l'écouteur posé. */
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
    // La carte précédente reste montée et inscrite, comme sur un board ; seule
    // la carte courante est survolée au moment de la frappe.
    const previous = el("carte précédente");
    const current = el("carte courante");
    current.hovered = true;
    const onPrevious = vi.fn();
    const onCurrent = vi.fn();

    // La précédente s'inscrit EN PREMIER : l'ordre d'abonnement ne doit rien
    // décider — c'est lui qui décidait quand chaque carte posait son écouteur.
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
    // Désinscrire deux fois ne doit ni jeter ni rouvrir l'écouteur.
    offB();
    expect(dom.listeners.size).toBe(0);
  });
});
