import { describe, expect, it } from "vitest";
import {
  orbSeedOr,
  projectHue,
  projectOrbGradient,
  projectOrbSeed,
} from "./project-orb-colors";

/**
 * La graine de l'orbe. Ce qui compte ici tient en une phrase : un projet qui n'a
 * jamais relancé son tirage doit garder EXACTEMENT la couleur qu'il avait quand
 * la graine n'existait pas — la colonne est nullable pour ça, et une régression
 * repeindrait tous les projets du jour au lendemain, orbe, pilules de mention et
 * mails d'invitation compris.
 */
describe("projectOrbSeed", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const seed = "22222222-2222-4222-8222-222222222222";

  it("retombe sur l'id tant que le tirage n'a pas été relancé", () => {
    expect(projectOrbSeed({ id, orb_seed: null })).toBe(id);
  });

  it("prend la graine relancée quand il y en a une", () => {
    expect(projectOrbSeed({ id, orb_seed: seed })).toBe(seed);
  });

  it("traite une graine vide comme absente", () => {
    expect(projectOrbSeed({ id, orb_seed: "" })).toBe(id);
  });

  it("dit la même chose que `orbSeedOr`, camelCase compris", () => {
    expect(orbSeedOr(id, seed)).toBe(projectOrbSeed({ id, orb_seed: seed }));
    expect(orbSeedOr(id, undefined)).toBe(id);
  });

  it("change la couleur — l'orbe, la pilule et le mail suivent la graine", () => {
    expect(projectHue(seed)).not.toBe(projectHue(id));
    expect(projectOrbGradient(seed).base).not.toBe(projectOrbGradient(id).base);
  });

  it("garde la couleur d'avant pour un projet jamais relancé", () => {
    // Le test de non-régression : cette teinte est celle que peignait le code
    // d'avant la colonne, qui hachait l'id.
    expect(projectHue(projectOrbSeed({ id, orb_seed: null }))).toBe(
      projectHue(id),
    );
  });
});
