import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-368 — the title is an enrichment, not a dependency of the first round.
 * This structure guard covers the orchestration order: tests of
 * launch mock `after()` for not starting a drain, and therefore cannot observe this temporal contract directly.
 */
describe("launch without waiting for the session title", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/server/agent/launch.ts"),
    "utf8",
  );

  it("inserts the run with a provisional title and persists the generated title later", () => {
    expect(source).toContain("const generatedTitle =");
    expect(source).toContain(
      "title: reviewPr ? prSessionTitle(reviewPr) : input.title?.trim() || null,",
    );
    expect(source).not.toContain("await generatedTitle");
    expect(source).toContain("void generatedTitle");
    expect(source).toContain('.is("title", null)');
  });

  it("has no desktop-local bookkeeping or drain bypass", () => {
    expect(source).not.toContain("if (run.local_exec) {");
    expect(source).not.toContain("if (!run.local_exec)");
    expect(source).toContain("await recordLaunch();");
    expect(source).toContain("kickAgentDrain(service);");
  });
});
