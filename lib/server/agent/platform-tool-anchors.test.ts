import { describe, expect, it } from "vitest";

import { agentToolsFor } from "./tools";
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
 * qui le SERT (`runPlatformTool` du plan de contrôle, par la table de
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

describe("l'ancrage se lit sur la ligne du run", () => {
  it("ticket, relecture, carnet", () => {
    expect(anchorForRun({ issue_id: "i-1", pull_request_id: null })).toBe("issue");
    expect(anchorForRun({ issue_id: null, pull_request_id: "pr-1" })).toBe("pr");
    expect(anchorForRun({ issue_id: null, pull_request_id: null })).toBe("notebook");
    // Le ticket l'emporte, comme dans `execute.ts`.
    expect(anchorForRun({ issue_id: "i-1", pull_request_id: "pr-1" })).toBe("issue");
  });
});
