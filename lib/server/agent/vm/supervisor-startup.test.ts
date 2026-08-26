import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Full startup requires a real opencode server, an LLM proxy and a
 * tools bridge. These tests therefore respect the structural scheduling which is part of the latency contract: the independent writes are launched
 * together, then all completed before `startServer`.
 */
const source = readFileSync(join(__dirname, "supervisor.ts"), "utf8");

describe("OpenCode startup", () => {
  it("writes the anchor and tools concurrently before starting the server", () => {
    const decoration = source.indexOf("await Promise.all([\n    deps.writeFile(opencodeAnchorFile");
    const server = source.indexOf("server = await deps.startServer(env);");

    expect(decoration).toBeGreaterThan(-1);
    expect(source).toMatch(
      /\.\.\.opencodeToolFiles\(job\)\.map\(\(file\) =>\s+deps\.writeFile\(file\.path, file\.content\)/,
    );
    expect(server).toBeGreaterThan(decoration);
  });

  it("reads repository conventions without serializing independent paths", () => {
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
