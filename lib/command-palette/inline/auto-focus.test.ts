import { describe, expect, it } from "vitest";
import { autoFocusFieldIndex } from "./auto-focus";

/**
 * Which takes the cursor when opening an inline form from the palette.
 *
 * The case that counts is the last one: a COMPLETELY pre-filled form.
 * The old rule made "no fields" — true in the literal sense (there is nothing left to fill in), false in the sense of usage: renaming a saved view
 * opened a field already bearing the current name, without a cursor in it, and it
 * had to click.
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
    // The case of renaming: the proposition is there, the cursor must be there.
    expect(autoFocusFieldIndex(["name"], { name: "Ma semaine" })).toBe(0);
    expect(autoFocusFieldIndex(["a", "b"], { a: "x", b: "y" })).toBe(0);
  });

  it("accepte les valeurs non textuelles comme des réponses", () => {
    expect(autoFocusFieldIndex(["a", "b"], { a: 0, b: false })).toBe(0);
    expect(autoFocusFieldIndex(["a", "b"], { a: 0 })).toBe(1);
    // `null` / `undefined` remain fields to fill out.
    expect(autoFocusFieldIndex(["a", "b"], { a: null })).toBe(0);
  });

  it("rend -1 sans champ — il n'y a personne à focaliser", () => {
    expect(autoFocusFieldIndex([], {})).toBe(-1);
  });
});
