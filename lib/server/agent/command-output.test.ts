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
 * MIN-107 probe: failed test output, 400 lines of green checkmarks
 * followed by the ONLY useful part (the name of the failed test, the assertion, the verdict).
 * The old `cap()` would cut off the head and throw away exactly that — the model saw
 * hundred green tests and `exitCode: 1`. This is the non-regression test of the ticket.
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
    // The beginning also remains readable (we elide the MIDDLE, not one end).
    expect(r.stdout).toContain("lib/foo/bar-0.test.ts");
    expect(r.stdout).toContain("chars elided");
  });

  it("ne touche pas une sortie courte", () => {
    const r = formatRunCommandResult({ exitCode: 0, stdout: "ok\n", stderr: "" }, null);
    expect(r).toEqual({ exitCode: 0, stdout: "ok\n", stderr: "" });
  });

  it("tient dans l'enveloppe de la boucle, sérialisé — sinon ELLE recoupe", () => {
    // The loop pushes `headTail(JSON.stringify(result), TOOL_RESULT_MAX_CHARS)`:
    // if the result overflows, it is the MIDDLE of the JSON that jumps, therefore the end of
    // stdout. Worst case: two long, very escaped flows (line breaks).
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
    // stderr has its own cap, lower: it triggers on its own.
    expect(spillsToDisk({ stdout: "", stderr: "b".repeat(RUN_COMMAND_STDERR_CAP + 1) })).toBe(true);
  });

  /**
 * THE AUDIT HOLE. The deposit had its own threshold (8,000 cumulative), higher
 * than the sum of the caps (4,000 + 2,000): between the two, the middle of the output
 * was elided without `full_output_path` NOR `note`, while the prompt prohibited by
 * elsewhere to rerun the filtered command. A 7,000 character `typecheck` y
 * lost its middle errors, permanently.
 */
  it("ne laisse plus de bande où l'on tronque sans rien déposer", () => {
    const o = { exitCode: 1, stdout: "a".repeat(7000), stderr: "b".repeat(500) };
    expect(spillsToDisk(o)).toBe(true);

    const r = formatRunCommandResult(o, "/vercel/sandbox/tool-output/typecheck-1.log");
    expect(r.stdout).toContain("chars elided");
    expect(r.full_output_path).toBe("/vercel/sandbox/tool-output/typecheck-1.log");
  });

  it("dit que le milieu est perdu quand il n'a rien pu déposer", () => {
    // Writing the file failed (best effort): the harness can no longer render
    // the environment, he must at least stop acting as if he had kept it.
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
    // Guardrail: a deposit path provided while the two flows hold under
    // their course — announcing a truncation that did not take place would be a lie.
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
