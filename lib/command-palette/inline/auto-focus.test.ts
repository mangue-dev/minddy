import { describe, expect, it } from "vitest";
import { autoFocusFieldIndex } from "./auto-focus";

/**
 * Qui prend le curseur à l'ouverture d'un formulaire inline de la palette.
 *
 * Le cas qui compte est le dernier : un formulaire ENTIÈREMENT pré-rempli.
 * L'ancienne règle rendait « aucun champ » — vrai au sens littéral (il ne reste
 * rien à remplir), faux au sens de l'usage : renommer une vue enregistrée
 * ouvrait un champ portant déjà le nom actuel, sans curseur dedans, et il
 * fallait aller cliquer.
 */

describe("autoFocusFieldIndex", () => {
  it("prend le premier champ quand tout est vide", () => {
    expect(autoFocusFieldIndex(["a", "b"], {})).toBe(0);
  });

  it("saute les champs déjà répondus", () => {
    expect(autoFocusFieldIndex(["a", "b", "c"], { a: "x" })).toBe(1);
    expect(autoFocusFieldIndex(["a", "b", "c"], { a: "x", b: "y" })).toBe(2);
  });

  it("ne compte pas comme rempli un champ blanc", () => {
    expect(autoFocusFieldIndex(["a", "b"], { a: "   " })).toBe(0);
    expect(autoFocusFieldIndex(["a", "b"], { a: "" })).toBe(0);
  });

  it("retombe sur le premier champ quand tout est pré-rempli", () => {
    // Le cas du renommage : la proposition est là, le curseur doit y être.
    expect(autoFocusFieldIndex(["name"], { name: "Ma semaine" })).toBe(0);
    expect(autoFocusFieldIndex(["a", "b"], { a: "x", b: "y" })).toBe(0);
  });

  it("accepte les valeurs non textuelles comme des réponses", () => {
    expect(autoFocusFieldIndex(["a", "b"], { a: 0, b: false })).toBe(0);
    expect(autoFocusFieldIndex(["a", "b"], { a: 0 })).toBe(1);
    // `null` / `undefined` restent des champs à remplir.
    expect(autoFocusFieldIndex(["a", "b"], { a: null })).toBe(0);
  });

  it("rend -1 sans champ — il n'y a personne à focaliser", () => {
    expect(autoFocusFieldIndex([], {})).toBe(-1);
  });
});
