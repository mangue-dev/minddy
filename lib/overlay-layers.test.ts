// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { hasOpenDismissibleLayer, isInOverlayLayer } from "@/lib/overlay-layers";

/**
 * MIN-284 — « impossible de supprimer un commentaire ».
 *
 * Le décor est le DOM tel que Radix le laisse : le panneau du fil est un nœud
 * ordinaire, le menu « ⋯ » et le dialogue de confirmation sont des FRÈRES en fin
 * de `body`. C'est cette forme-là, et pas le composant, qui portait le défaut :
 * pour un test `contains()`, un clic dans le dialogue est un clic hors panneau.
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
    // Le panneau lui-même n'est pas un calque : c'est son propre `contains`
    // qui le couvre, et le confondre ici le rendrait impossible à fermer.
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
    // Survoler un bouton du panneau ne doit pas le rendre infermable au clavier.
    mount(`${PANEL}<div data-radix-popper-content-wrapper role="tooltip"></div>`);
    expect(hasOpenDismissibleLayer(document)).toBe(false);
  });

  it("ne voit rien quand rien n'est ouvert", () => {
    mount(PANEL);
    expect(hasOpenDismissibleLayer(document)).toBe(false);
  });
});
