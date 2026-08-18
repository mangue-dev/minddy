import { describe, expect, it } from "vitest";
import { shouldShowNewVersion } from "./new-version";

/**
 * The rule that decides on a “new version” banner (MIN-157). She must
 * above all know how to KEEP QUIET: a false positive is a permanent reloading problem
 * on an app that is already up to date.
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
    // First request not yet returned: `data` is undefined, not "".
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

  // The heart of the choice to memorize an SHA rather than a Boolean: refuse a
  // version must not make the tab deaf to all subsequent ones.
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
