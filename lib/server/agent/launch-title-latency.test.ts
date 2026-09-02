import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-368 — the title is an enrichment, not a dependency of the first round.
 * This structure guard covers the orchestration order: tests of
 * launch mock `after()` for not starting a drain, and therefore cannot observe this temporal contract directly.
 */
describe("lancement sans attendre le titre de session", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/server/agent/launch.ts"),
    "utf8",
  );

  it("insère le run avec un titre provisoire puis persiste le titre en arrière-plan", () => {
    expect(source).toContain("const generatedTitle =");
    expect(source).toContain(
      "title: reviewPr ? prSessionTitle(reviewPr) : input.title?.trim() || null,",
    );
    expect(source).not.toContain("await generatedTitle");
    expect(source).toContain("void generatedTitle");
    expect(source).toContain('.is("title", null)');
  });

  it("sort les écritures secondaires du chemin critique local", () => {
    const localBookkeeping = source.slice(
      source.indexOf("if (run.local_exec) {"),
    );
    expect(localBookkeeping).toContain("after(() => {");
    expect(localBookkeeping).toContain("void recordLaunch().catch");
    expect(source).toContain("if (!run.local_exec) kickAgentDrain(service)");
  });
});
