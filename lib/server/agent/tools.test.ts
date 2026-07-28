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

describe("agentToolsFor — ancrage (inchangé)", () => {
  it("ticket et carnet gardent leurs tools métier", () => {
    const issue = names({ anchor: "issue", webSearch: true, model: "openai/gpt-5.6-luna" });
    expect(issue).toContain("read_issue");
    expect(issue).not.toContain("read_scratchpad");

    const notebook = names({ anchor: "notebook", webSearch: true, model: "openai/gpt-5.6-luna" });
    expect(notebook).toContain("read_scratchpad");
    expect(notebook).not.toContain("read_issue");
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
