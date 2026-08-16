import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Le préchauffage vit dans le main process Electron, hors du graphe Vitest.
 * On tient ici sa frontière de sécurité et son dédoublonnage : il ne doit
 * préparer que le binaire et le harness, jamais un job ou une clé de modèle.
 */
const source = readFileSync(join(__dirname, "../../desktop/src/launcher.ts"), "utf8");

describe("pré-chauffage de l'agent local", () => {
  it("réchauffe le harness et opencode sans créer de job", () => {
    const start = source.indexOf("export function prewarmLocalAgent(origin: string): Promise<boolean>");
    const end = source.indexOf("\n}\n\n/**\n * JOUE UNE AFFECTATION", start);
    const warmup = source.slice(start, end);

    expect(warmup).toContain("ensureBundle(origin)");
    expect(warmup).toContain("ensureOpencode(localOpencodeDir(userData))");
    expect(warmup).not.toContain("assignmentToJob(");
    expect(warmup).not.toContain("controlToken");
  });

  it("partage le pré-vol opencode avec un envoi qui arrive immédiatement", () => {
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

  it("ne claim jamais avant que les prérequis machine soient prêts", () => {
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

  it("mémorise un pré-vol réussi sans refaire un téléchargement à chaque poll", () => {
    expect(source).toContain("const localAgentReadyOrigins = new Set<string>();");
    expect(source).toContain("if (localAgentReadyOrigins.has(origin)) return Promise.resolve(true);");
    expect(source).toContain("if (ready) localAgentReadyOrigins.add(origin);");
  });
});
