import { describe, expect, it } from "vitest";
import { numoPathFromSearchParams, usesLegacyAgentSurface } from "./numo-route";

describe("Numo route compatibility", () => {
  it("keeps only historical worker parameters on the legacy surface", () => {
    expect(usesLegacyAgentSurface({ run: "run-1" })).toBe(true);
    expect(usesLegacyAgentSurface({ issue: "issue-1" })).toBe(true);
    expect(usesLegacyAgentSurface({ compose: "new" })).toBe(false);
    expect(usesLegacyAgentSurface({ conversation: "conversation-1" })).toBe(
      false,
    );
  });

  it("preserves Numo query parameters when canonicalizing the route", () => {
    expect(
      numoPathFromSearchParams({
        conversation: "parent conversation",
        work: ["run/1", "run/2"],
      }),
    ).toBe(
      "/numo?conversation=parent+conversation&work=run%2F1&work=run%2F2",
    );
    expect(numoPathFromSearchParams({})).toBe("/numo");
  });
});
