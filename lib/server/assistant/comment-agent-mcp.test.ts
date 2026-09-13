import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./comment-agent.ts", import.meta.url), "utf8");

describe("Numo comment conversation entry", () => {
  it("uses the durable common engine instead of a comment-only model loop", () => {
    expect(source).toContain("startNumoIntent");
    expect(source).toContain("executeNumoTurn");
    expect(source).not.toContain("runCommentLoop");
    expect(source).not.toContain("fetchAiChat");
  });

  it("keeps private tool and connector results outside the shared projection", () => {
    expect(source).toContain("personal connector data");
    expect(source).toContain("include only information intended for every reader");
  });

  it("routes a later thread reply into pending worker mediation", () => {
    expect(source).toContain("pendingSurfaceWorkerInput");
    expect(source).toContain("answerNumoWorkerInput");
  });

  it("keeps the shared prompt limited to the invoked comment thread", () => {
    const threadFilter = ".or(`id.eq.${rootId},parent_id.eq.${rootId}`)";
    expect(source.split(threadFilter)).toHaveLength(5);
  });
});
