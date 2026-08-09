import { describe, expect, it } from "vitest";
import {
  RUN_COMMAND_STDOUT_CAP,
  RUN_COMMAND_STDERR_CAP,
  formatRunCommandResult,
  fullOutputDocument,
  spillsToDisk,
  toolOutputFileName,
} from "./command-output";
import { TOOL_RESULT_MAX_CHARS } from "./prune";

/**
 * Sonde de MIN-107 : une sortie de tests en échec, 400 lignes de coches vertes
 * suivies de la SEULE partie utile (le nom du test raté, l'assertion, le verdict).
 * L'ancien `cap()` coupait par la tête et jetait exactement ça — le modèle voyait
 * cent tests verts et `exitCode: 1`. C'est le test de non-régression du ticket.
 */
function failingTestOutput(): string {
  const noise = Array.from(
    { length: 400 },
    (_, i) => ` ✓ lib/foo/bar-${i}.test.ts (7 tests) 12ms`,
  ).join("\n");
  return [
    noise,
    " ❯ lib/plan/parse.test.ts (3 tests | 1 failed) 41ms",
    "   × parsePlan > compte les tâches sous ## Questions",
    "     → expected 4 to be 3",
    "",
    " Test Files  1 failed | 42 passed (43)",
    "      Tests  1 failed | 312 passed (313)",
  ].join("\n");
}

describe("formatRunCommandResult — la queue survit", () => {
  const stdout = failingTestOutput();

  it("garde le verdict final et le nom du test raté", () => {
    const r = formatRunCommandResult({ exitCode: 1, stdout, stderr: "" }, null);
    expect(stdout.length).toBeGreaterThan(RUN_COMMAND_STDOUT_CAP);
    expect(r.stdout).toContain("Test Files  1 failed");
    expect(r.stdout).toContain("parsePlan > compte les tâches sous ## Questions");
    expect(r.stdout).toContain("expected 4 to be 3");
    // Le début reste lisible aussi (on élide le MILIEU, pas une extrémité).
    expect(r.stdout).toContain("lib/foo/bar-0.test.ts");
    expect(r.stdout).toContain("chars elided");
  });

  it("ne touche pas une sortie courte", () => {
    const r = formatRunCommandResult({ exitCode: 0, stdout: "ok\n", stderr: "" }, null);
    expect(r).toEqual({ exitCode: 0, stdout: "ok\n", stderr: "" });
  });

  it("tient dans l'enveloppe de la boucle, sérialisé — sinon ELLE recoupe", () => {
    // La boucle pousse `headTail(JSON.stringify(result), TOOL_RESULT_MAX_CHARS)` :
    // si le résultat déborde, c'est le MILIEU du JSON qui saute, donc la fin de
    // stdout. Cas le pire : deux flux longs, très échappés (sauts de ligne).
    const noisy = `${"ligne de sortie\n".repeat(2000)}VERDICT: 1 failed`;
    const r = formatRunCommandResult(
      { exitCode: 1, stdout: noisy, stderr: noisy },
      "/vercel/sandbox/tool-output/pnpm-test-1.log",
    );
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    expect(r.stdout).toContain("VERDICT: 1 failed");
    expect(r.stderr).toContain("VERDICT: 1 failed");
    expect(r.full_output_path).toBe("/vercel/sandbox/tool-output/pnpm-test-1.log");
  });

  it("garde la queue de stderr aussi", () => {
    const stderr = `${"x".repeat(9000)}\nError: ENOENT lib/plan.ts`;
    const r = formatRunCommandResult({ exitCode: 1, stdout: "", stderr }, null);
    expect(r.stderr).toContain("Error: ENOENT lib/plan.ts");
  });
});

describe("dépôt de la sortie complète", () => {
  it("déclenche dès qu'un flux dépasse SON cap", () => {
    expect(spillsToDisk({ stdout: "a".repeat(100), stderr: "" })).toBe(false);
    expect(spillsToDisk({ stdout: "a".repeat(RUN_COMMAND_STDOUT_CAP), stderr: "" })).toBe(false);
    expect(spillsToDisk({ stdout: "a".repeat(RUN_COMMAND_STDOUT_CAP + 1), stderr: "" })).toBe(true);
    // stderr a son propre cap, plus bas : il déclenche tout seul.
    expect(spillsToDisk({ stdout: "", stderr: "b".repeat(RUN_COMMAND_STDERR_CAP + 1) })).toBe(true);
  });

  /**
   * LE TROU DE L'AUDIT. Le dépôt avait son propre seuil (8 000 cumulés), plus haut
   * que la somme des caps (4 000 + 2 000) : entre les deux, le milieu de la sortie
   * était élidé sans `full_output_path` NI `note`, alors que le prompt interdit par
   * ailleurs de relancer la commande filtrée. Un `typecheck` à 7 000 caractères y
   * perdait ses erreurs du milieu, définitivement.
   */
  it("ne laisse plus de bande où l'on tronque sans rien déposer", () => {
    const o = { exitCode: 1, stdout: "a".repeat(7000), stderr: "b".repeat(500) };
    expect(spillsToDisk(o)).toBe(true);

    const r = formatRunCommandResult(o, "/vercel/sandbox/tool-output/typecheck-1.log");
    expect(r.stdout).toContain("chars elided");
    expect(r.full_output_path).toBe("/vercel/sandbox/tool-output/typecheck-1.log");
  });

  it("dit que le milieu est perdu quand il n'a rien pu déposer", () => {
    // Écriture du fichier en échec (best-effort) : le harness ne peut plus rendre
    // le milieu, il doit au moins cesser de faire comme s'il l'avait gardé.
    const r = formatRunCommandResult({ exitCode: 1, stdout: "a".repeat(7000), stderr: "" }, null);
    expect(r.full_output_path).toBeUndefined();
    expect(r.note).toMatch(/no full copy was saved/i);
    expect(r.note).toMatch(/re-run the command scoped/i);
  });

  it("renvoie le chemin et la consigne de relecture quand la sortie est tronquée", () => {
    const r = formatRunCommandResult(
      { exitCode: 1, stdout: failingTestOutput(), stderr: "" },
      "/vercel/sandbox/tool-output/pnpm-vitest-run-3.log",
    );
    expect(r.full_output_path).toBe("/vercel/sandbox/tool-output/pnpm-vitest-run-3.log");
    expect(r.note).toContain("/vercel/sandbox/tool-output/pnpm-vitest-run-3.log");
    expect(r.note).toMatch(/grep/);
    expect(r.note).toMatch(/read_file/);
  });

  it("n'annonce aucun chemin si rien n'a été tronqué", () => {
    // Garde-fou : un chemin de dépôt fourni alors que les deux flux tiennent sous
    // leur cap — annoncer une troncature qui n'a pas eu lieu serait un mensonge.
    const r = formatRunCommandResult(
      { exitCode: 0, stdout: "a".repeat(3000), stderr: "b".repeat(1500) },
      "/vercel/sandbox/tool-output/x-1.log",
    );
    expect(r.full_output_path).toBeUndefined();
    expect(r.note).toBeUndefined();
  });

  it("écrit un document qui distingue les deux flux", () => {
    const doc = fullOutputDocument("pnpm test", { exitCode: 1, stdout: "out", stderr: "err" });
    expect(doc).toContain("$ pnpm test");
    expect(doc).toContain("exit code: 1");
    expect(doc.indexOf("out")).toBeLessThan(doc.indexOf("===== stderr ====="));
    expect(doc.indexOf("===== stderr =====")).toBeLessThan(doc.indexOf("err"));
  });
});

describe("toolOutputFileName", () => {
  it("slugifie la commande et porte le seq", () => {
    expect(toolOutputFileName("pnpm vitest run lib/", 3)).toBe("pnpm-vitest-run-lib-3.log");
  });

  it("ne produit jamais de séparateur de chemin ni de nom vide", () => {
    expect(toolOutputFileName("../../etc/passwd", 1)).toBe("etc-passwd-1.log");
    expect(toolOutputFileName("!!!", 7)).toBe("command-7.log");
    expect(toolOutputFileName("a".repeat(200), 0)).toBe(`${"a".repeat(40)}-0.log`);
  });
});
