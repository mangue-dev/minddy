import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Full startup requires a real opencode server, an LLM proxy and a
 * tools bridge. These tests therefore respect the structural scheduling which is part of the latency contract: the independent writes are launched
 * together, then all completed before `startServer`.
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

  it("starts repository convention discovery before bridge initialization", () => {
    const discovery = source.indexOf(
      "const servedInstructionsPromise = servedInstructionsFile(\n    host,\n    deps.writeFile,\n    instructionSource,\n  );",
    );
    const bridge = source.indexOf("const bridge = await (deps.startToolBridge ?? startToolBridge)({");

    expect(discovery).toBeGreaterThan(-1);
    expect(bridge).toBeGreaterThan(discovery);
    expect(source).toContain("repoInstructionFiles: await servedInstructionsPromise");
  });
});
