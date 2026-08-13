import { describe, expect, it } from "vitest";

import {
  createWindowRefocusTracker,
  shouldOpenTooltipOnFocus,
} from "@/lib/tooltip-focus";

/**
 * Le défaut, tel qu'on le vit : on quitte l'onglet minddy, on revient, et une
 * infobulle est ouverte sur un bouton qu'on n'a pas survolé. Ce que le test
 * rejoue n'est pas Radix mais la SÉQUENCE d'événements qui la déclenche — c'est
 * elle qui porte la décision.
 */

describe("shouldOpenTooltipOnFocus", () => {
  it("ouvre sur un focus clavier ordinaire", () => {
    expect(
      shouldOpenTooltipOnFocus({ refocusPending: false, focusVisible: true })
    ).toBe(true);
  });

  it("n'ouvre pas sur le focus rendu par le navigateur au retour d'onglet", () => {
    expect(
      shouldOpenTooltipOnFocus({ refocusPending: true, focusVisible: true })
    ).toBe(false);
  });

  it("n'ouvre pas sur un focus qui ne se voit pas (clic, focus posé par du code)", () => {
    expect(
      shouldOpenTooltipOnFocus({ refocusPending: false, focusVisible: false })
    ).toBe(false);
  });
});

describe("createWindowRefocusTracker", () => {
  it("retient le focus rendu au retour de la fenêtre, une seule fois", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markRefocus();
    expect(tracker.consumeRefocus()).toBe(true);
    // Le rangement du navigateur ne concerne qu'un focus : le suivant est un
    // vrai geste, et rouvre normalement.
    expect(tracker.consumeRefocus()).toBe(false);
  });

  it("laisse passer une tabulation qui suit le retour d'onglet", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markRefocus();
    // Un `keydown` précède toujours le focus qu'il déclenche.
    tracker.markGesture();
    expect(tracker.consumeRefocus()).toBe(false);
  });

  it("laisse passer un clic qui suit le retour d'onglet", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markRefocus();
    tracker.markGesture();
    expect(tracker.refocusPending).toBe(false);
  });

  it("part fermé : hors retour de fenêtre, rien n'est retenu", () => {
    const tracker = createWindowRefocusTracker();
    expect(tracker.refocusPending).toBe(false);
    expect(tracker.consumeRefocus()).toBe(false);
  });

  it("la séquence complète du défaut : retour d'onglet, puis focus rendu", () => {
    const tracker = createWindowRefocusTracker();
    // On était sur un bouton cliqué, l'onglet part, revient.
    tracker.markRefocus();
    const decision = shouldOpenTooltipOnFocus({
      refocusPending: tracker.consumeRefocus(),
      focusVisible: true,
    });
    expect(decision).toBe(false);
    // Et l'infobulle redevient ouvrable dès le geste suivant.
    expect(
      shouldOpenTooltipOnFocus({
        refocusPending: tracker.consumeRefocus(),
        focusVisible: true,
      })
    ).toBe(true);
  });
});
