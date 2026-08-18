import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The preheating lives in the Electron main process, outside the Vitest graph.
 * Here we have its security boundary and its deduplication: it must
 * only prepare the binary and the harness, never a job or a model key.
 */
const source = readFileSync(join(__dirname, "../../desktop/src/launcher.ts"), "utf8");

describe("local agent warm-up", () => {
  it("warms up the harness and opencode without creating a job", () => {
    const start = source.indexOf("export function prewarmLocalAgent(origin: string): Promise<boolean>");
    const end = source.indexOf("\n}\n\n/**\n * PLAY AN ASSIGNMENT", start);
    const warmup = source.slice(start, end);

    expect(warmup).toContain("ensureBundle(origin)");
    expect(warmup).toContain("ensureOpencode(localOpencodeDir(userData))");
    expect(warmup).not.toContain("assignmentToJob(");
    expect(warmup).not.toContain("controlToken");
  });

  it("shares the opencode preflight with a send that arrives immediately", () => {
    expect(source).toContain("const active = opencodePreflights.get(installDir);");
    expect(source).toContain("const task = ensureOpencodeOnce(installDir).finally(");
  });

  it("le pull remet l'affectation au même lanceur qui consomme les caches préchauffés", () => {
    const claim = source.slice(
      source.indexOf("async function claimLocalTurn"),
      source.indexOf("export function prewarmLocalAgent"),
    );
    const run = source.slice(source.indexOf("export async function runAssignment"));

    expect(claim).toContain("runAssignment(assignment, opts.origin");
    expect(run).toContain("ensureBundle(origin, assignment.job.protocolVersion)");
    expect(run).toContain("ensureOpencode(opencodeDir)");
  });

  it("never claims before machine prerequisites are ready", () => {
    const loop = source.slice(
      source.indexOf("export function startLocalClaimLoop"),
      source.indexOf("async function claimLocalTurn"),
    );
    const readyAt = loop.indexOf("const ready = await prewarmLocalAgent(origin)");
    const claimAt = loop.indexOf("outcome = await claimLocalTurn(");

    expect(readyAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(readyAt);
    expect(loop).toContain("if (ready) {");
  });

  it("remembers a successful preflight without downloading again on every poll", () => {
    expect(source).toContain("const localAgentReadyOrigins = new Set<string>();");
    expect(source).toContain("if (localAgentReadyOrigins.has(origin)) return Promise.resolve(true);");
    expect(source).toContain("if (ready) localAgentReadyOrigins.add(origin);");
  });
});
