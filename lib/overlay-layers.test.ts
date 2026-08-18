// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { hasOpenDismissibleLayer, isInOverlayLayer } from "@/lib/overlay-layers";

/**
 * MIN-284 — "unable to delete comment".
 *
 * The setting is the DOM as Radix leaves it: the thread panel is an ordinary node
 *, the "⋯" menu and confirmation dialog are BROTHERS at the end
 * of `body`. It is this form, and not the component, which carried the defect:
 * for a `contains()` test, a click in the dialog is a click outside the panel.
 */

function mount(html: string): void {
  document.body.innerHTML = html;
}

const PANEL = '<div id="panel"><button id="close">×</button></div>';

describe("isInOverlayLayer", () => {
  beforeEach(() => mount(""));

  it("reconnaît l'entrée d'un menu porté", () => {
    mount(
      `${PANEL}<div data-radix-popper-content-wrapper><div role="menu">` +
        `<div id="delete" role="menuitem">Supprimer</div></div></div>`
    );
    expect(isInOverlayLayer(document.getElementById("delete"))).toBe(true);
  });

  it("reconnaît le bouton d'un dialogue de confirmation, et son voile", () => {
    mount(
      `${PANEL}<div data-slot="alert-dialog-overlay" id="voile"></div>` +
        `<div role="alertdialog"><button id="confirm">Supprimer</button></div>`
    );
    expect(isInOverlayLayer(document.getElementById("confirm"))).toBe(true);
    expect(isInOverlayLayer(document.getElementById("voile"))).toBe(true);
  });

  it("ne reconnaît RIEN dans le document ordinaire", () => {
    mount(`${PANEL}<p id="ailleurs">un paragraphe de la page</p>`);
    expect(isInOverlayLayer(document.getElementById("ailleurs"))).toBe(false);
    // The panel itself is not a layer: it is its own `contains`
    // which covers it, and confusing it here would make it impossible to close.
    expect(isInOverlayLayer(document.getElementById("close"))).toBe(false);
    expect(isInOverlayLayer(null)).toBe(false);
  });
});

describe("hasOpenDismissibleLayer", () => {
  beforeEach(() => mount(""));

  it("voit un dialogue ouvert — ÉCHAP est à lui", () => {
    mount(`${PANEL}<div role="alertdialog"></div>`);
    expect(hasOpenDismissibleLayer(document)).toBe(true);
  });

  it("ne compte PAS une infobulle : elle ne prend pas ÉCHAP", () => {
    // Hovering over a panel button should not make it closable with the keyboard.
    mount(`${PANEL}<div data-radix-popper-content-wrapper role="tooltip"></div>`);
    expect(hasOpenDismissibleLayer(document)).toBe(false);
  });

  it("ne voit rien quand rien n'est ouvert", () => {
    mount(PANEL);
    expect(hasOpenDismissibleLayer(document)).toBe(false);
  });
});
