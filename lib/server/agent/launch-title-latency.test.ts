import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-368 — le titre est un enrichissement, pas une dépendance du premier tour.
 * Cette garde de structure couvre l'ordre d'orchestration : les tests de
 * lancement moquent `after()` pour ne pas démarrer de drain, et ne peuvent donc
 * pas observer ce contrat temporel directement.
 */
describe("lancement sans attendre le titre de session", () => {
  const source = readFileSync(path.join(process.cwd(), "lib/server/agent/launch.ts"), "utf8");

  it("insère le run avec un titre provisoire puis persiste le titre en arrière-plan", () => {
    expect(source).toContain("const generatedTitle =");
    expect(source).toContain("title: input.title?.trim() || null,");
    expect(source).not.toContain("await generatedTitle");
    expect(source).toContain("void generatedTitle");
    expect(source).toContain('.is("title", null)');
  });

  it("sort les écritures secondaires du chemin critique local", () => {
    const localBookkeeping = source.slice(source.indexOf("if (run.local_exec) {"));
    expect(localBookkeeping).toContain("after(() => {");
    expect(localBookkeeping).toContain("void recordLaunch().catch");
    expect(source).toContain("if (!run.local_exec) kickAgentDrain(service)");
  });
});
