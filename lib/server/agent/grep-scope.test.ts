import { describe, expect, it } from "vitest";
import { grepRepo, type RepoHost } from "./repo-host";
import { makeExecTool } from "./exec-tool";
import { NO_FILES_IN_SCOPE_NOTE } from "./grep-pattern";

/**
 * MIN-226 — le filet : « aucune correspondance » ne doit plus couvrir « le filtre
 * n'a retenu aucun fichier ».
 *
 * Ce que le run qui a écrit le plan de MIN-226 a vécu : cinq `grep` dont le
 * `path`/`glob` ne sélectionnait rien, cinq `(no matches)`, et un modèle qui en a
 * conclu — raisonnablement — que le code cherché n'existait pas. Deux corrections
 * de forme (les accolades en MIN-116, le `path` de fichier ici) ferment chacune
 * UNE porte ; celle-ci ferme la classe, parce qu'elle ne dépend d'aucune
 * hypothèse sur la façon dont le périmètre a été vidé.
 *
 * D'où un hôte simulé plutôt qu'une microVM : ce qui se teste est le CONTRAT de
 * sortie — quelle phrase le modèle lit selon ce que git a répondu.
 */

/** Hôte qui rejoue des sorties de commande, et note ce qu'on lui a demandé. */
function host(replies: Array<{ match: RegExp; exitCode: number; stdout?: string }>): {
  host: RepoHost;
  commands: string[];
} {
  const commands: string[] = [];
  return {
    commands,
    host: {
      exec: async (command: string) => {
        commands.push(command);
        const hit = replies.find((r) => r.match.test(command));
        return {
          exitCode: hit?.exitCode ?? 0,
          stdout: hit?.stdout ?? "",
          stderr: "",
        };
      },
      readFile: async () => null,
      writeFile: async () => {},
      mkdir: async () => {},
    } as RepoHost,
  };
}

describe("grepRepo — périmètre vide vs absence", () => {
  it("aucun match ET aucun fichier retenu → noFilesInScope", async () => {
    const h = host([
      { match: /^git grep /, exitCode: 1 },
      { match: /^git ls-files /, exitCode: 0, stdout: "" },
    ]);
    const r = await grepRepo(h.host, {
      pattern: "ObjectiveSidePanel",
      path: "lib/nowhere",
      glob: "**/*.ts",
    });
    expect(r.ok).toBe(true);
    expect(r.noFilesInScope).toBe(true);
  });

  it("aucun match mais des fichiers LUS → vraie absence, pas de drapeau", async () => {
    const h = host([
      { match: /^git grep /, exitCode: 1 },
      { match: /^git ls-files /, exitCode: 0, stdout: "lib/a.ts\nlib/b.ts\n" },
    ]);
    const r = await grepRepo(h.host, { pattern: "nope", path: "lib", glob: "**/*.ts" });
    expect(r.ok).toBe(true);
    expect(r.noFilesInScope).toBeUndefined();
  });

  it("des matchs → aucune vérification de périmètre à payer", async () => {
    const h = host([{ match: /^git grep /, exitCode: 0, stdout: "lib/a.ts:1:hit\n" }]);
    const r = await grepRepo(h.host, { pattern: "hit", path: "lib", glob: "**/*.ts" });
    expect(r.output).toContain("hit");
    expect(h.commands.some((c) => c.startsWith("git ls-files"))).toBe(false);
  });

  it("recherche SANS filtre : rien à mettre en cause, pas de sonde", async () => {
    const h = host([{ match: /^git grep /, exitCode: 1 }]);
    const r = await grepRepo(h.host, { pattern: "absent" });
    expect(r.noFilesInScope).toBeUndefined();
    expect(h.commands.some((c) => c.startsWith("git ls-files"))).toBe(false);
  });

  it("erreur git (≥2) reste une erreur, pas un périmètre vide", async () => {
    const h = host([{ match: /^git grep /, exitCode: 128 }]);
    const r = await grepRepo(h.host, { pattern: "x", path: "lib", glob: "**/*.ts" });
    expect(r.ok).toBe(false);
    expect(r.noFilesInScope).toBeUndefined();
  });
});

describe("tool grep — ce que le modèle LIT", () => {
  const run = (h: RepoHost, args: Record<string, unknown>) =>
    makeExecTool({
      host: h,
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
      subagents: null,
      chunkRemainingMs: () => 60_000,
    })("grep", args);

  it("périmètre vide → la phrase qui dit que rien n'a été lu, et un échec", async () => {
    const h = host([
      { match: /^git grep /, exitCode: 1 },
      { match: /^git ls-files /, exitCode: 0, stdout: "" },
    ]);
    const out = await run(h.host, {
      pattern: "ObjectiveSidePanel",
      path: "app/page.tsx",
      glob: "app/page.tsx",
    });
    expect(out.result).toBe(NO_FILES_IN_SCOPE_NOTE);
    expect(out.success).toBe(false);
    // Et le mot lui-même : c'est lui que le modèle relit en concluant.
    expect(String(out.result)).toContain("nothing was searched");
    expect(String(out.result)).not.toContain("no matches");
  });

  it("vraie absence → « (no matches) », inchangé", async () => {
    const h = host([
      { match: /^git grep /, exitCode: 1 },
      { match: /^git ls-files /, exitCode: 0, stdout: "lib/a.ts\n" },
    ]);
    const out = await run(h.host, { pattern: "absent", path: "lib", glob: "**/*.ts" });
    expect(out.result).toBe("(no matches)");
    expect(out.success).toBe(true);
  });

  /**
   * MIN-238 — la même classe que ci-dessus, par l'autre porte : la recherche a
   * bien tourné, mais pas sur ce que le modèle croyait. Ici c'est `-F` qui a
   * cherché la barre au pied de la lettre.
   */
  it("alternation en fixed_strings : relancée en regex, et la note le dit", async () => {
    const h = host([
      { match: /^git grep .*-F /, exitCode: 1 },
      { match: /^git grep .*-E /, exitCode: 0, stdout: "lib/server/agent/runs.ts:435:claimRun\n" },
    ]);
    const out = await run(h.host, {
      pattern: "claimRun|requeueStuckRuns",
      fixed_strings: true,
      path: "lib",
    });
    expect(out.success).toBe(true);
    expect(String(out.result)).toContain("runs.ts:435");
    expect(String(out.result)).toContain("retried as a regex");
    // Le littéral d'abord, la regex ensuite : l'ordre EST le correctif.
    expect(h.commands[0]).toContain(" -F ");
    expect(h.commands[1]).toContain(" -E ");
  });

  it("le littéral qui TROUVE n'est jamais relancé — la réponse était juste", async () => {
    const h = host([{ match: /^git grep .*-F /, exitCode: 0, stdout: "docs/a.md:3:a|b\n" }]);
    const out = await run(h.host, { pattern: "a|b", fixed_strings: true });
    expect(String(out.result)).not.toContain("retried as a regex");
    expect(h.commands).toHaveLength(1);
  });

  it("regex refusée à la relance : on garde « (no matches) », pas une erreur", async () => {
    const h = host([
      { match: /^git grep .*-F /, exitCode: 1 },
      { match: /^git grep .*-E /, exitCode: 2 },
    ]);
    const out = await run(h.host, { pattern: "a(|b(", fixed_strings: true });
    expect(out.success).toBe(true);
    expect(out.result).toBe("(no matches)");
  });
});

/**
 * Les DEUX tools voisins portaient le même mensonge, et pour la même raison : un
 * échec de commande sortait par le chemin du résultat vide. Les corriger avec
 * `grep` est le point de la manœuvre — une classe de défaut ne se répare pas à
 * un seul de ses endroits.
 */
describe("tools voisins — échec ≠ résultat vide", () => {
  const tool = (h: RepoHost, name: string, args: Record<string, unknown>) =>
    makeExecTool({
      host: h,
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
      subagents: null,
      chunkRemainingMs: () => 60_000,
    })(name, args);

  it("list_dir sur un chemin illisible : une erreur, pas « (empty) »", async () => {
    const h = host([{ match: /^ls -1Ap /, exitCode: 1 }]);
    const out = await tool(h.host, "list_dir", { path: "app/nowhere" });
    expect(out.success).toBe(false);
    expect(JSON.stringify(out.result)).toContain("no such directory");
  });

  it("list_dir sur un dossier vraiment vide : « (empty) », et c'est vrai", async () => {
    const h = host([{ match: /^ls -1Ap /, exitCode: 0, stdout: "" }]);
    const out = await tool(h.host, "list_dir", { path: "app/empty" });
    expect(out.result).toBe("(empty)");
    expect(out.success).toBe(true);
  });

  it("glob dont le pathspec est refusé : une erreur, pas « (no files matched) »", async () => {
    const h = host([{ match: /^git ls-files /, exitCode: 128 }]);
    const out = await tool(h.host, "glob", { pattern: ":(broken" });
    expect(out.success).toBe(false);
    expect(JSON.stringify(out.result)).toContain("glob failed");
  });

  it("glob qui ne matche rien : « (no files matched) », et c'est vrai", async () => {
    const h = host([{ match: /^git ls-files /, exitCode: 0, stdout: "" }]);
    const out = await tool(h.host, "glob", { pattern: "**/*.rs" });
    expect(out.result).toBe("(no files matched)");
    expect(out.success).toBe(true);
  });
});
