import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le registre des pages créées et pas encore écrites (MIN-270).
 *
 * Ce qu'il tient tient en une phrase, et c'est celle qui coûte cher à rater :
 * une destruction programmée au démontage doit être ANNULABLE. En Strict Mode,
 * React monte, démonte et remonte chaque composant à la suite ; sans
 * l'annulation, la page se détruit à la seconde où on la crée, dans le seul
 * environnement où l'on développe. Le même battement peut venir d'une reprise
 * de Suspense en production.
 *
 * L'autre garde-fou est la SYMÉTRIE : une page écrite quitte le registre, et
 * n'y revient pas — un départ ultérieur ne doit plus rien détruire.
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
  it("ne connaît qu'une page qu'on vient de créer", () => {
    expect(isDraftPage(PAGE)).toBe(false);
    markDraftPage(PAGE);
    expect(isDraftPage(PAGE)).toBe(true);
  });

  it("oublie une page dès qu'elle a été écrite", () => {
    markDraftPage(PAGE);
    forgetDraftPage(PAGE);
    expect(isDraftPage(PAGE)).toBe(false);
  });
});

describe("la destruction programmée", () => {
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
    // Le sort de la page est réglé : elle n'est plus un brouillon.
    expect(isDraftPage(PAGE)).toBe(false);
  });

  it("est ANNULÉE par un remontage immédiat (Strict Mode)", () => {
    const discard = vi.fn();
    markDraftPage(PAGE);
    scheduleDraftDiscard(PAGE, discard);
    cancelDraftDiscard(PAGE);
    vi.runAllTimers();
    expect(discard).not.toHaveBeenCalled();
    // Et la page reste un brouillon : on n'a pas encore quitté pour de bon.
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

  it("annuler sans rien avoir programmé ne casse rien", () => {
    expect(() => cancelDraftDiscard("inconnue")).not.toThrow();
  });
});
