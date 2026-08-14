import { describe, expect, it } from "vitest";

import { agentToolsFor } from "./tools";
import { makeExecTool } from "./exec-tool";
import type { RepoHost } from "./repo-host";
import type { AgentAnchor } from "./prompt";
import {
  anchorForRun,
  PLATFORM_TOOL_NAMES,
  PLATFORM_TOOLS_BY_ANCHOR,
} from "./platform-tool-names";

/**
 * MIN-326 — LE JEU D'OUTILS EST UNE PROPRIÉTÉ DE L'ANCRAGE, et il n'y en a qu'un.
 *
 * Deux endroits décident de ce qu'un run peut appeler : celui qui l'ANNONCE au
 * modèle (`agentToolsFor`, dont la microVM tire ses fichiers de tools) et celui
 * qui le SERT (`runPlatformTool` / `makeExecTool`, par la table de
 * `platform-tool-names.ts`). Tant qu'ils ne venaient pas de la même source, le
 * second était un routage par NOM : une session de relecture, dont tout ce
 * qu'elle lit vient d'un fork inconnu, appelait `create_routine` par un POST
 * depuis son shell.
 *
 * Ce test les confronte nom par nom. Il échoue quand on ajoute un tool sans
 * décider de son ancrage — c'est exactement ce qu'on lui demande.
 */

const ANCHORS: AgentAnchor[] = ["issue", "notebook", "pr"];

/** Tout ce que l'ancrage ANNONCE, toutes options ouvertes : `web_search` servi,
 *  run de chaîne (`report_verdict`) et interactif (`create_routine`, `ask_user`).
 *  Un tool qu'aucune combinaison n'annonce n'a rien à faire dans la table. */
const announced = (anchor: AgentAnchor) =>
  new Set(
    agentToolsFor({ anchor, webSearch: true, chain: true, interactive: true })
      .map((t) => t.function.name)
      .filter((name) => PLATFORM_TOOL_NAMES.has(name)),
  );

/**
 * Les noms d'AVANT que la table garde alors que plus personne ne les annonce :
 * un checkpoint repris rejoue l'ancien appel, et il doit continuer de marcher là
 * où son successeur marche. `read_attachment` est le `read_resource` d'avant
 * MIN-184. Toute autre divergence est un défaut.
 */
const LEGACY_ALIASES = new Set(["read_attachment"]);

describe("la table des tools par ancrage — annoncé et servi ne divergent pas", () => {
  for (const anchor of ANCHORS) {
    it(`sert exactement ce que l'ancrage « ${anchor} » annonce`, () => {
      const served = PLATFORM_TOOLS_BY_ANCHOR[anchor];
      const offered = announced(anchor);
      // Rien d'annoncé qui ne soit servi : le modèle verrait un tool qui refuse.
      expect([...offered].filter((name) => !served.has(name))).toEqual([]);
      // Rien de servi qui ne soit annoncé, alias historiques mis à part : c'est
      // par là qu'un tool d'écriture entrait dans une session de relecture.
      expect([...served].filter((name) => !offered.has(name) && !LEGACY_ALIASES.has(name))).toEqual(
        [],
      );
    });
  }

  it("ferme la RELECTURE aux écritures minddy, nommément", () => {
    // La liste noire est écrite en toutes lettres : la comparaison ci-dessus
    // suivrait `agentToolsFor` si quelqu'un y ajoutait une écriture pour la
    // relecture. Celle-ci dit ce que le produit PROMET — zéro écriture.
    for (const name of [
      "update_issue",
      "create_issue",
      "write_issue_plan",
      "append_to_plan",
      "edit_issue_text",
      "create_page",
      "update_page",
      "create_objective",
      "update_objective",
      "comment_objective",
      "create_routine",
      "read_scratchpad",
      "set_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
      "create_pr",
      "review_pull_request",
      "set_pull_request_state",
    ]) {
      expect(PLATFORM_TOOLS_BY_ANCHOR.pr.has(name), `${name} servi à une relecture`).toBe(false);
    }
  });

  it("garde à la relecture ses lecteurs et les trois écritures de SA pull request", () => {
    for (const name of [
      "read_issue",
      "search_issues",
      "read_feedback",
      "read_resource",
      "read_page",
      "read_objective",
      "comment_pr",
      "comment_pr_line",
      "reply_pr_thread",
    ]) {
      expect(PLATFORM_TOOLS_BY_ANCHOR.pr.has(name), `${name} refusé à une relecture`).toBe(true);
    }
  });
});

/**
 * La précédence de l'ancrage doit rester CELLE d'`execute.ts` (« issue, sinon pr,
 * sinon carnet ») : deux réponses différentes à « quel ancrage ? » et le jeu
 * annoncé cesse d'être le jeu appliqué.
 */
/**
 * L'AUTRE ROUTEUR. Le plan de contrôle sert la microVM d'opencode ; `makeExecTool`
 * sert les deux moteurs qui exécutent en direct (la boucle maison d'`execute.ts`,
 * reprise sur les vieux checkpoints, et `vm/turn.ts`). Il routait lui aussi sur le
 * seul nom : un tool non ANNONCÉ mais nommé par le modèle — un checkpoint d'avant,
 * une instruction glissée dans le dépôt relu — s'exécutait quand même.
 */
describe("makeExecTool refuse un tool hors de l'ancrage", () => {
  const host: RepoHost = {
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
  const called: string[] = [];
  const handler = async (name: string) => {
    called.push(name);
    return { result: { ok: true }, success: true };
  };
  const execFor = (anchor: AgentAnchor) =>
    makeExecTool({
      host,
      anchor,
      createPr: null,
      prTool: handler,
      projectPrTool: handler,
      // Câblés MALGRÉ l'ancrage : c'est tout le sujet — la garantie ne doit pas
      // dépendre du fait qu'un appelant ait pensé à passer `null`.
      issueTool: handler,
      scratchpadTool: handler,
      webSearch: null,
      outputSeqBase: 0,
      background: null,
      instructions: { paths: [], bytes: 0 },
      editedPaths: new Set<string>(),
      subagents: null,
      chunkRemainingMs: () => 120_000,
    });

  it("ne laisse pas une relecture écrire un ticket ni le carnet, handler câblé ou non", async () => {
    called.length = 0;
    const exec = execFor("pr");
    for (const name of ["update_issue", "create_routine", "set_scratchpad", "create_page"]) {
      const out = await exec(name, {}, "call-1");
      expect(out.success, name).toBe(false);
    }
    expect(called).toEqual([]);
  });

  it("laisse passer ce que l'ancrage porte", async () => {
    called.length = 0;
    const exec = execFor("pr");
    expect((await exec("read_issue", {}, "call-1")).success).toBe(true);
    expect((await exec("comment_pr", { body: "x" }, "call-2")).success).toBe(true);
    expect(called).toEqual(["read_issue", "comment_pr"]);

    called.length = 0;
    const issue = execFor("issue");
    expect((await issue("update_issue", {}, "call-3")).success).toBe(true);
    expect((await issue("set_scratchpad", {}, "call-4")).success).toBe(true);
    expect(called).toEqual(["update_issue", "set_scratchpad"]);
  });
});

describe("l'ancrage se lit sur la ligne du run", () => {
  it("ticket, relecture, carnet", () => {
    expect(anchorForRun({ issue_id: "i-1", pull_request_id: null })).toBe("issue");
    expect(anchorForRun({ issue_id: null, pull_request_id: "pr-1" })).toBe("pr");
    expect(anchorForRun({ issue_id: null, pull_request_id: null })).toBe("notebook");
    // Le ticket l'emporte, comme dans `execute.ts`.
    expect(anchorForRun({ issue_id: "i-1", pull_request_id: "pr-1" })).toBe("issue");
  });
});
