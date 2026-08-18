import { describe, expect, it } from "vitest";

import {
  createWindowRefocusTracker,
  shouldOpenTooltipOnFocus,
} from "@/lib/tooltip-focus";

/**
 * The default, as we experience it: we leave the minddy tab, we return, and a
 * tooltip is open on a button that we did not hover over. What the test
 * replays is not Radix but the SEQUENCE of events that triggers it — it is
 * that makes the decision.
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
    // Browser storage only concerns one focus: the next one is a
    // real gesture, and reopens normally.
    expect(tracker.consumeRefocus()).toBe(false);
  });

  it("laisse passer une tabulation qui suit le retour d'onglet", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markRefocus();
    // A `keydown` always precedes the focus it triggers.
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
    // We were on a button clicked, the tab leaves, comes back.
    tracker.markRefocus();
    const decision = shouldOpenTooltipOnFocus({
      refocusPending: tracker.consumeRefocus(),
      focusVisible: true,
    });
    expect(decision).toBe(false);
    // And the tooltip becomes open again from the next gesture.
    expect(
      shouldOpenTooltipOnFocus({
        refocusPending: tracker.consumeRefocus(),
        focusVisible: true,
      })
    ).toBe(true);
  });
});
