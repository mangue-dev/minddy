import { describe, expect, it } from "vitest";
import { forgeActorValue, forgePrActor, isForgePrEvent } from "./pr-events";

/**
 * Tests de l'encodage provider des événements PR/MR webhook (MIN-69) : GitHub
 * reste la forme historique NON préfixée (rétro-compatible avec les événements
 * déjà en base), GitLab se distingue par le préfixe `gitlab:` dans from_value.
 */

describe("forgeActorValue / forgePrActor", () => {
  it("GitHub : login nu, aller-retour identitaire", () => {
    expect(forgeActorValue("github", "octocat")).toBe("octocat");
    expect(forgePrActor("octocat")).toEqual({ provider: "github", login: "octocat" });
  });

  it("GitHub sans login : null, décodé en github/null", () => {
    expect(forgeActorValue("github", null)).toBeNull();
    expect(forgePrActor(null)).toEqual({ provider: "github", login: null });
  });

  it("GitLab : préfixe gitlab:, aller-retour", () => {
    expect(forgeActorValue("gitlab", "jane.dev")).toBe("gitlab:jane.dev");
    expect(forgePrActor("gitlab:jane.dev")).toEqual({ provider: "gitlab", login: "jane.dev" });
  });

  it("GitLab sans login : le marqueur provider survit, login null", () => {
    expect(forgeActorValue("gitlab", null)).toBe("gitlab:");
    expect(forgePrActor("gitlab:")).toEqual({ provider: "gitlab", login: null });
  });
});

describe("isForgePrEvent", () => {
  it("action PR webhook (sans acteur minddy) → vrai", () => {
    expect(isForgePrEvent({ type: "pr_accepted", actor_id: null })).toBe(true);
    expect(isForgePrEvent({ type: "pr_approved", actor_id: null })).toBe(true);
  });

  it("action in-app (acteur membre) ou autre type → faux", () => {
    expect(isForgePrEvent({ type: "pr_accepted", actor_id: "user-1" })).toBe(false);
    expect(isForgePrEvent({ type: "created", actor_id: null })).toBe(false);
  });
});
