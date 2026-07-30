import { describe, expect, it } from "vitest";
import { agentToolsFor } from "./tools";

/**
 * MIN-115 : le jeu de tools d'un run n'est plus fixe. Les modèles `gpt-*`
 * reçoivent `apply_patch` À LA PLACE d'`edit_file` / `apply_edits` / `write_file`,
 * les autres gardent exactement ce qu'ils avaient. C'est le test qui remplace
 * « lancer une session et regarder » : servir les deux jeux ensemble, ou aucun,
 * ne se verrait qu'en production.
 */

const names = (opts: Parameters<typeof agentToolsFor>[0]) =>
  agentToolsFor(opts).map((t) => t.function.name);

const STRING_EDIT = ["edit_file", "apply_edits", "write_file"];

describe("agentToolsFor — interface d'édition", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`sert apply_patch SEUL à un modèle gpt-* (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true, model: "openai/gpt-5.6-luna" });
      expect(served).toContain("apply_patch");
      for (const tool of STRING_EDIT) expect(served).not.toContain(tool);
    });

    it(`laisse les autres modèles inchangés (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true, model: "deepseek/deepseek-v4-flash" });
      expect(served).not.toContain("apply_patch");
      for (const tool of STRING_EDIT) expect(served).toContain(tool);
    });

    it(`garde le reste du jeu dans les deux cas (ancrage ${anchor})`, () => {
      for (const model of ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"]) {
        const served = names({ anchor, webSearch: true, model });
        for (const tool of ["read_file", "grep", "move_file", "delete_file", "run_command"]) {
          expect(served).toContain(tool);
        }
        // Aucun doublon : un même nom servi deux fois est un tool-call ambigu.
        expect(new Set(served).size).toBe(served.length);
      }
    });

    it(`sans modèle connu, on reste sur l'édition par chaîne (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true });
      expect(served).not.toContain("apply_patch");
      expect(served).toContain("edit_file");
    });
  }
});

describe("agentToolsFor — web_search (inchangé)", () => {
  it("retire web_search hors OpenRouter, quelle que soit l'interface d'édition", () => {
    for (const model of ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"]) {
      expect(names({ anchor: "issue", webSearch: false, model })).not.toContain("web_search");
      expect(names({ anchor: "issue", webSearch: true, model })).toContain("web_search");
    }
  });
});

/**
 * MIN-125 : les tools minddy ne sont plus découpés par ancrage. Les DEUX ancrages
 * servent les dix — tickets ET carnet — et l'ancrage ne décide plus que de la
 * CIBLE PAR DÉFAUT, dite dans la description des trois tools qui prennent `issue`.
 */
const MINDDY_TOOLS = [
  "search_issues",
  "read_issue",
  "read_attachment",
  "update_issue",
  "write_issue_plan",
  "create_issue",
  "read_scratchpad",
  "add_scratchpad_tasks",
  "update_scratchpad_task",
  "set_scratchpad",
];

describe("agentToolsFor — tools minddy servis aux deux ancrages", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`sert les dix tools minddy + create_pr (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true, model: "openai/gpt-5.6-luna" });
      for (const tool of MINDDY_TOOLS) expect(served).toContain(tool);
      expect(served).toContain("create_pr");
      // Un même nom servi deux fois est un tool-call ambigu.
      expect(new Set(served).size).toBe(served.length);
    });
  }

  it("dit la cible par défaut selon l'ancrage, sur les trois tools ciblables", () => {
    const describeTool = (anchor: "issue" | "notebook", name: string) =>
      agentToolsFor({ anchor, webSearch: true }).find((t) => t.function.name === name)!
        .function.description;

    for (const name of ["read_issue", "update_issue", "write_issue_plan"]) {
      expect(describeTool("issue", name)).toMatch(/`issue` is OPTIONAL/);
      expect(describeTool("issue", name)).not.toMatch(/`issue` is REQUIRED/);
      expect(describeTool("notebook", name)).toMatch(/`issue` is REQUIRED/);
      expect(describeTool("notebook", name)).toMatch(/search_issues/);
    }
    // Les autres tools ticket n'ont pas de cible : pas de phrase de ciblage.
    for (const name of ["search_issues", "create_issue", "read_attachment"]) {
      expect(describeTool("notebook", name)).not.toMatch(/`issue` is (OPTIONAL|REQUIRED)/);
    }
  });

  it("ne laisse pas `update_issue` promettre un changement de statut", () => {
    for (const anchor of ["issue", "notebook"] as const) {
      const description = agentToolsFor({ anchor, webSearch: true }).find(
        (t) => t.function.name === "update_issue",
      )!.function;
      expect(description.description).toMatch(/CANNOT change a ticket's STATUS/);
      expect(Object.keys(description.parameters.properties)).not.toContain("status");
      expect(Object.keys(description.parameters.properties)).not.toContain("priority");
    }
  });

  it("ne laisse pas `create_issue` exposer un statut d'atterrissage", () => {
    const tool = agentToolsFor({ anchor: "issue", webSearch: true }).find(
      (t) => t.function.name === "create_issue",
    )!.function;
    expect(Object.keys(tool.parameters.properties)).not.toContain("status");
    expect(tool.description).toMatch(/account setting, not a parameter/);
  });

  it("reformule create_pr selon l'ancrage (le carnet n'a pas de ticket)", () => {
    const pr = (anchor: "issue" | "notebook") =>
      agentToolsFor({ anchor, webSearch: true }).find((t) => t.function.name === "create_pr")!
        .function.description;
    expect(pr("issue")).toMatch(/this ticket's working branch/);
    expect(pr("notebook")).toMatch(/this session's working branch/);
  });
});

/**
 * MIN-111 : `read_attachment` est toujours servi, mais il n'ANNONCE une image
 * regardable que sur un run dont le modèle en accepte. La description du tool est
 * ce que le modèle lit en premier — la laisser promettre une capacité absente
 * ferait « je vois la maquette » sur des métadonnées.
 */
describe("agentToolsFor — read_attachment et les images", () => {
  const description = (images: boolean) =>
    agentToolsFor({ anchor: "issue", webSearch: true, images }).find(
      (t) => t.function.name === "read_attachment",
    )!.function.description;

  it("promet l'image sur un run multimodal", () => {
    expect(description(true)).toMatch(/comes back as the image itself/);
    expect(description(true)).toMatch(/BEFORE writing the code it describes/);
  });

  it("garde le texte d'avant sur un run texte", () => {
    expect(description(false)).not.toMatch(/image itself/);
    expect(description(false)).toBe(
      agentToolsFor({ anchor: "issue", webSearch: true }).find(
        (t) => t.function.name === "read_attachment",
      )!.function.description,
    );
  });

  it("ne change rien au jeu de tools servi", () => {
    expect(names({ anchor: "issue", webSearch: true, images: true })).toEqual(
      names({ anchor: "issue", webSearch: true }),
    );
  });
});
