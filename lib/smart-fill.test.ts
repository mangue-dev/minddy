import { describe, expect, it } from "vitest";

import { resolveSmartFill, SMART_FILL_META_KEY } from "./smart-fill";

/**
 * Le défaut, et rien que lui — mais c'est le détail qui décide si la feature
 * existe pour un compte neuf. Un compte n'a PAS de métadonnée tant qu'il n'a
 * touché à rien : lire l'absence comme un refus éteindrait Smart-fill chez tout
 * le monde sauf ceux qui l'auraient allumé à la main.
 */
describe("resolveSmartFill", () => {
  it("est activé sur un compte qui n'a jamais rien réglé", () => {
    expect(resolveSmartFill(undefined)).toBe(true);
    expect(resolveSmartFill(null)).toBe(true);
    expect(resolveSmartFill({})).toBe(true);
  });

  it("n'est coupé que par un false explicite", () => {
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: false })).toBe(false);
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: true })).toBe(true);
  });

  it("ignore une valeur d'un autre type plutôt que de la croire", () => {
    // Une métadonnée est du JSON libre : `"false"` est une chaîne, pas un refus.
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: "false" })).toBe(true);
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: 0 })).toBe(true);
  });

  it("ne se laisse pas décider par la préférence du voisin", () => {
    expect(resolveSmartFill({ auto_assign_on_start: false })).toBe(true);
  });
});
