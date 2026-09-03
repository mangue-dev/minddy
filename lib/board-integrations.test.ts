import { describe, expect, it } from "vitest";
import { boardIntegrationFacets } from "./board-integrations";

const integration = (
  id: string,
  kind: "issues" | "feedback" = "issues",
  revoked_at: string | null = null,
) => ({ id, name: id, kind, revoked_at });

describe("board integration facets", () => {
  it("offers active issue integrations even before their first ticket", () => {
    expect(boardIntegrationFacets([integration("active")], [])).toEqual([
      integration("active"),
    ]);
  });

  it("keeps a revoked integration while a living ticket still uses it", () => {
    const revoked = integration("revoked", "issues", "2026-09-03T10:00:00Z");
    expect(
      boardIntegrationFacets([revoked], [{ integration_id: "revoked" }]),
    ).toEqual([revoked]);
  });

  it("omits unused revoked and feedback-only integrations", () => {
    expect(
      boardIntegrationFacets(
        [
          integration("unused", "issues", "2026-09-03T10:00:00Z"),
          integration("feedback", "feedback"),
        ],
        [],
      ),
    ).toEqual([]);
  });
});
