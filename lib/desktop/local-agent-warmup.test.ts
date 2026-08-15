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
    const start = source.indexOf("export function prewarmLocalAgent(origin: string): Promise<void>");
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
});
