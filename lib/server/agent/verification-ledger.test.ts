import { describe, expect, it } from "vitest";

import { makeExecTool } from "./exec-tool";
import { newVerificationSink, type VerificationSink } from "./diagnostics";
import { REPO_DIR, type RepoHost } from "./repo-host";

/**
 * MIN-262 — LE CÂBLAGE DU REGISTRE, PAS SA POLITIQUE.
 *
 * `diagnostics.test.ts` teste ce qu'on RECONNAÎT comme une vérification, et
 * `turn-end.test.ts` ce que le crochet en FAIT. Reste le maillon entre les deux,
 * celui qui casserait en silence : `run_command` remplit-il le registre, et une
 * édition le périme-t-elle ? Si ce fil-là lâche, rien ne rougit — le harness se
 * tairait simplement sur des tours que personne n'a vérifiés, ce qui est exactement
 * la régression que ce ticket ne veut pas introduire.
 */

/** Dépôt en mémoire, dont on pilote le code de sortie des commandes. */
function fakeHost(exitCode = 0): RepoHost {
  const files = new Map<string, string>();
  return {
    exec: async () => ({ exitCode, stdout: "", stderr: "" }),
    readFile: async (abs) => files.get(abs) ?? null,
    writeFile: async (abs, content) => {
      files.set(abs, content);
    },
    mkdir: async () => {},
  };
}

function execToolFor(host: RepoHost, verification: VerificationSink) {
  return makeExecTool({
    host,
    anchor: "issue",
    createPr: null,
    prTool: null,
    projectPrTool: null,
    issueTool: null,
    scratchpadTool: null,
    webSearch: null,
    outputSeqBase: 0,
    background: null,
    instructions: { paths: [], bytes: 0 },
    editedPaths: new Set<string>(),
    verification,
    subagents: null,
    chunkRemainingMs: () => 600_000,
  });
}

describe("le registre de vérification, câblé aux tools", () => {
  it("retient la suite de tests que le modèle a lancée et vue verte", async () => {
    const verification = newVerificationSink();
    const exec = execToolFor(fakeHost(0), verification);

    await exec("run_command", { command: "npm run typecheck" });
    expect(verification.greenCommand).toBeNull(); // pas une vérification de tests

    await exec("run_command", { command: "npx vitest run lib/x.test.ts" });
    expect(verification.greenCommand).toBe("npx vitest run lib/x.test.ts");
  });

  it("ne retient rien d'une suite rouge", async () => {
    const verification = newVerificationSink();
    const exec = execToolFor(fakeHost(1), verification);

    await exec("run_command", { command: "npm test" });
    expect(verification.greenCommand).toBeNull();
  });

  it("périme la vérification dès que le modèle réédite", async () => {
    // L'invariant du ticket, et le seul qui protège la garantie de MIN-251 : vert
    // APRÈS la dernière édition. Un `npm test` d'il y a trois rounds ne dit plus
    // rien du fichier qu'on vient de réécrire.
    const verification = newVerificationSink();
    const exec = execToolFor(fakeHost(0), verification);

    await exec("run_command", { command: "npm test" });
    expect(verification.greenCommand).toBe("npm test");

    await exec("write_file", { path: "lib/x.ts", content: "export const x = 1;\n" });
    expect(verification.greenCommand).toBeNull();
  });

  it("périme aussi sur une SUPPRESSION, qui ne passe pas par le même entonnoir", async () => {
    // `delete_file` note ses chemins à part (rien à charger pour un fichier qui
    // n'est plus là) : c'est le chemin qu'on oublie quand on ne branche qu'un côté.
    const verification = newVerificationSink();
    const host = fakeHost(0);
    const exec = execToolFor(host, verification);
    await host.writeFile(`${REPO_DIR}/lib/x.ts`, "export const x = 1;\n");

    await exec("run_command", { command: "npm test" });
    await exec("delete_file", { path: "lib/x.ts" });
    expect(verification.greenCommand).toBeNull();
  });
});
