import { describe, expect, it } from "vitest";
import { defaultAgentProjectId } from "./last-agent-project";

const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("defaultAgentProjectId", () => {
  it("prefers the last project an agent was launched in", () => {
    expect(defaultAgentProjectId(projects, "c")).toBe("c");
  });

  it("falls back to the first project when nothing was launched yet", () => {
    // La liste arrive triée par `updated_at` : le premier est le projet touché
    // le plus récemment, pas un premier de tri arbitraire.
    expect(defaultAgentProjectId(projects, null)).toBe("a");
  });

  it("falls back when the remembered project is gone", () => {
    // L'id vit dans le navigateur : le projet a pu être supprimé, l'accès
    // perdu, ou un autre compte être connecté sur la même machine.
    expect(defaultAgentProjectId(projects, "deleted")).toBe("a");
  });

  it("returns null when the user has no project at all", () => {
    expect(defaultAgentProjectId([], "a")).toBeNull();
  });
});
