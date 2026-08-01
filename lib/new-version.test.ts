import { describe, expect, it } from "vitest";
import { shouldShowNewVersion } from "./new-version";

/**
 * La règle qui décide d'un bandeau « nouvelle version » (MIN-157). Elle doit
 * surtout savoir SE TAIRE : un faux positif, c'est un nag de rechargement
 * permanent sur une app qui est déjà à jour.
 */
describe("shouldShowNewVersion", () => {
  it("se tait sans SHA de build (dev local, variables système décochées)", () => {
    expect(
      shouldShowNewVersion({
        buildCommit: "",
        serverCommit: "abc123",
        dismissedCommit: null,
      })
    ).toBe(false);
  });

  it("se tait sans SHA serveur", () => {
    expect(
      shouldShowNewVersion({
        buildCommit: "abc123",
        serverCommit: "",
        dismissedCommit: null,
      })
    ).toBe(false);
    // Première requête pas encore revenue : `data` est undefined, pas "".
    expect(
      shouldShowNewVersion({
        buildCommit: "abc123",
        serverCommit: undefined,
        dismissedCommit: null,
      })
    ).toBe(false);
  });

  it("se tait quand l'onglet fait tourner le déploiement courant", () => {
    expect(
      shouldShowNewVersion({
        buildCommit: "abc123",
        serverCommit: "abc123",
        dismissedCommit: null,
      })
    ).toBe(false);
  });

  it("s'affiche quand le serveur sert un autre déploiement", () => {
    expect(
      shouldShowNewVersion({
        buildCommit: "abc123",
        serverCommit: "def456",
        dismissedCommit: null,
      })
    ).toBe(true);
  });

  it("reste fermé sur le déploiement que l'utilisateur a refusé", () => {
    expect(
      shouldShowNewVersion({
        buildCommit: "abc123",
        serverCommit: "def456",
        dismissedCommit: "def456",
      })
    ).toBe(false);
  });

  // Le cœur du choix de mémoriser un SHA plutôt qu'un booléen : refuser une
  // version ne doit pas rendre l'onglet sourd à toutes les suivantes.
  it("revient au déploiement d'après un refus", () => {
    expect(
      shouldShowNewVersion({
        buildCommit: "abc123",
        serverCommit: "ghi789",
        dismissedCommit: "def456",
      })
    ).toBe(true);
  });
});
