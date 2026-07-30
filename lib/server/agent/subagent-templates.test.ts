import { describe, expect, it } from "vitest";
import {
  describeTemplates,
  renderSubagentPrompt,
  SubagentTemplateError,
  SUBAGENT_TEMPLATES,
  SUBAGENT_TEMPLATE_IDS,
} from "./subagent-templates";

/**
 * Prompts à trous des sous-agents (MIN-112). Ce qui compte ici : une erreur de
 * template doit être RÉPARABLE par le modèle au round suivant — donc nommer ce qui
 * manque — plutôt que de produire un prompt à trous béants, qu'une fille paierait
 * en un aller-retour entier avant de rendre un rapport inutile.
 */

const BASE = { task: "find every caller of foo", expectedOutput: "a path:line list" };

describe("renderSubagentPrompt", () => {
  it("sans template, renvoie la tâche brute", () => {
    expect(renderSubagentPrompt({ ...BASE })).toBe(BASE.task);
    expect(renderSubagentPrompt({ ...BASE, templateId: "  " })).toBe(BASE.task);
  });

  it("injecte task et expected_output sans que le parent ait à les répéter", () => {
    const out = renderSubagentPrompt({ ...BASE, templateId: "implement" });
    expect(out).toContain(BASE.task);
    // `expected_output` est une variable requise du template `implement` : elle est
    // remplie depuis le champ du tool, jamais depuis `template_vars`.
    expect(out).toContain("Implement the following change");
  });

  it("rend les variables optionnelles seulement quand elles sont fournies", () => {
    const without = renderSubagentPrompt({ ...BASE, templateId: "explore" });
    expect(without).not.toContain("## Where to start");
    const with_ = renderSubagentPrompt({
      ...BASE,
      templateId: "explore",
      vars: { file_path: "lib/foo.ts", constraints: "do not read node_modules" },
    });
    expect(with_).toContain("## Where to start\nlib/foo.ts");
    expect(with_).toContain("do not read node_modules");
  });

  it("sur un template inconnu, LISTE les ids disponibles", () => {
    expect(() => renderSubagentPrompt({ ...BASE, templateId: "refactor" })).toThrow(
      SubagentTemplateError,
    );
    try {
      renderSubagentPrompt({ ...BASE, templateId: "refactor" });
    } catch (err) {
      const message = (err as Error).message;
      for (const id of SUBAGENT_TEMPLATE_IDS) expect(message).toContain(id);
      // Et il dit la sortie de secours : déléguer sans template reste permis.
      expect(message).toMatch(/omit prompt_template/);
    }
  });

  it("sur une variable requise manquante, la NOMME", () => {
    // `test` exige `file_path` : le code sous test doit être désigné, sinon la fille
    // écrirait des tests pour ce qu'elle croit être la cible.
    try {
      renderSubagentPrompt({ ...BASE, templateId: "test" });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("template_vars.file_path");
    }
  });

  it("ignore un template_vars qui n'est pas un objet", () => {
    for (const vars of [null, "nope", 42, ["a"]]) {
      const out = renderSubagentPrompt({ ...BASE, templateId: "explore", vars });
      expect(out).toContain(BASE.task);
      expect(out).not.toContain("## Where to start");
    }
  });

  it("stringifie une variable non textuelle plutôt que d'écrire [object Object]", () => {
    const out = renderSubagentPrompt({
      ...BASE,
      templateId: "explore",
      vars: { file_path: 42 },
    });
    expect(out).toContain("## Where to start\n42");
  });
});

describe("describeTemplates", () => {
  it("sert chaque template avec ses variables requises et optionnelles", () => {
    const described = describeTemplates();
    for (const template of SUBAGENT_TEMPLATES) {
      expect(described).toContain(`\`${template.id}\``);
      for (const v of template.variables) expect(described).toContain(`{{${v}}}`);
    }
    expect(described).toMatch(/optional:/);
  });

  it("dit la sandbox PARTAGÉE au sous-agent qui édite", () => {
    // C'est la contrainte n° 1 du ticket : deux écrivains se marchent dessus dans un
    // dépôt dont la fin de tour fait `git add -A`. Le jeu de tools la fait respecter
    // entre filles ; le prompt la fait respecter DANS une fille.
    const out = renderSubagentPrompt({ ...BASE, templateId: "implement" });
    expect(out).toMatch(/SHARED/);
  });
});
