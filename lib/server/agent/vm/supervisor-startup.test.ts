import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Le démarrage complet requiert un vrai serveur opencode, un proxy LLM et un
 * pont de tools. Ces tests tiennent donc l'ordonnancement structurel qui fait
 * partie du contrat de latence : les écritures indépendantes sont lancées
 * ensemble, puis toutes terminées avant `startServer`.
 */
const source = readFileSync(join(__dirname, "supervisor.ts"), "utf8");

describe("amorçage opencode", () => {
  it("écrit l'ancrage et les tools en parallèle avant de démarrer le serveur", () => {
    const decoration = source.indexOf("await Promise.all([\n    deps.writeFile(opencodeAnchorFile");
    const server = source.indexOf("server = await deps.startServer(env);");

    expect(decoration).toBeGreaterThan(-1);
    expect(source).toContain("...opencodeToolFiles(job).map((file) => deps.writeFile(file.path, file.content))");
    expect(server).toBeGreaterThan(decoration);
  });

  it("lit les conventions du dépôt sans sérialiser les chemins indépendants", () => {
    const functionStart = source.indexOf("async function servedInstructionsFile(");
    const functionEnd = source.indexOf("\n}\n\n/**\n * JOUE LE TOUR", functionStart);
    const served = source.slice(functionStart, functionEnd);

    expect(served).toContain("await Promise.all(");
    expect(served).toContain("paths.map(async (path)");
  });

  it("lance les conventions avant l'initialisation du pont", () => {
    const discovery = source.indexOf(
      "const servedInstructionsPromise = servedInstructionsFile(host, deps.writeFile);",
    );
    const bridge = source.indexOf("const bridge = await (deps.startToolBridge ?? startToolBridge)({");

    expect(discovery).toBeGreaterThan(-1);
    expect(bridge).toBeGreaterThan(discovery);
    expect(source).toContain("repoInstructionFiles: await servedInstructionsPromise");
  });
});
