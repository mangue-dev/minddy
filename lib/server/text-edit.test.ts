import { describe, expect, it } from "vitest";
import { editIssueText, type IssueTextTools } from "./text-edit";

/** Any set of surface names - the contract tested here is that
 * refusals refer to THESE names, never to those of another surface. */
const TOOLS: IssueTextTools = {
  read: "minddy_get_issue",
  appendToPlan: "minddy_append_to_plan",
  replaceWhole: {
    plan: "minddy_update_issues { fields: { plan } }",
    description: "minddy_update_issues { fields: { description } }",
  },
};

/**
 * The MCP blueprint/description patch (MIN-186). The substitution engine is
 * already covered elsewhere (lib/server/agent/edit.test.ts): what is verified here,
 * is the CONTRACT rendered to the model — what passes, what is refused, and with
 * what error code. A poorly coded refusal, and an agent tries again by rewriting everything,
 * that is to say exactly the gesture that this tool replaces.
 */

const PLAN = `# Contexte

Le plan initial, écrit d'un bloc.

## Tâches

- [x] Première tâche, faite
- [ ] Deuxième tâche, à faire
- [ ] Troisième tâche
`;

describe("editIssueText", () => {
  it("remplace un passage unique et laisse le reste intact", () => {
    const result = editIssueText({
      field: "plan",
      current: PLAN,
      oldString: "- [ ] Deuxième tâche, à faire",
      tools: TOOLS,
      newString: "- [ ] Deuxième tâche, reformulée",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("- [ ] Deuxième tâche, reformulée");
    expect(result.content).not.toContain("à faire");
    // The rest of the document, to the nearest byte.
    expect(result.content).toContain("- [x] Première tâche, faite");
    expect(result.content).toContain("Le plan initial, écrit d'un bloc.");
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.diff).toContain("Deuxième tâche, reformulée");
  });

  it("refuse bruyamment un old_string qui ne correspond plus", () => {
    const result = editIssueText({
      field: "plan",
      current: PLAN,
      oldString: "- [ ] Une tâche qui n'a jamais existé",
      tools: TOOLS,
      newString: "- [ ] Autre chose",
    });

    expect(result).toMatchObject({ ok: false, code: "text_not_found" });
    // The message refers to REREADING, not full rewriting.
    if (result.ok) return;
    expect(result.message).toContain("minddy_get_issue");
    expect(result.message).not.toContain("write_file");
  });

  it("rejects an ambiguous match instead of choosing one", () => {
    const result = editIssueText({
      field: "description",
      current: "Le bug apparaît ici.\n\nLe bug apparaît là aussi.\n",
      oldString: "Le bug apparaît",
      tools: TOOLS,
      newString: "Le défaut apparaît",
    });

    expect(result).toMatchObject({ ok: false, code: "text_ambiguous" });
    if (result.ok) return;
    expect(result.message).toContain("replace_all");
  });

  it("replace_all changes every occurrence", () => {
    const result = editIssueText({
      field: "description",
      current: "Le bug apparaît ici.\n\nLe bug apparaît là aussi.\n",
      oldString: "Le bug apparaît",
      tools: TOOLS,
      newString: "Le défaut apparaît",
      replaceAll: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      "Le défaut apparaît ici.\n\nLe défaut apparaît là aussi.\n"
    );
  });

  it("un new_string vide supprime le passage", () => {
    const result = editIssueText({
      field: "plan",
      current: PLAN,
      oldString: "- [ ] Troisième tâche\n",
      tools: TOOLS,
      newString: "",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("Troisième tâche");
    expect(result.content).toContain("- [ ] Deuxième tâche, à faire");
  });

  it("dit qu'il n'y a rien à patcher quand le champ est vide", () => {
    for (const current of ["", "   \n\n"]) {
      const result = editIssueText({
        field: "plan",
        current,
        oldString: "quoi que ce soit",
        tools: TOOLS,
        newString: "autre chose",
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_params" });
      if (result.ok) continue;
      // And he names the gesture which, HE, knows how to create a plan.
      expect(result.message).toContain("minddy_append_to_plan");
    }
  });

  it("refuse un patch qui ne change rien", () => {
    const result = editIssueText({
      field: "plan",
      current: PLAN,
      oldString: "- [ ] Troisième tâche",
      tools: TOOLS,
      newString: "- [ ] Troisième tâche",
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_params" });
  });

  it("tolerates the model's typographic drift (curly quotes, dashes)", () => {
    const stored = 'Le champ "plan" - remplacé en entier.';
    const result = editIssueText({
      field: "description",
      current: `${stored}\n`,
      // What the model re-emits spontaneously: curved quotes and em-dash.
      oldString: "Le champ “plan” — remplacé en entier.",
      tools: TOOLS,
      newString: "Le champ « plan » se patche.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe("Le champ « plan » se patche.\n");
  });

  it("never mentions files to a model editing a ticket", () => {
    const refusals = [
      editIssueText({
        field: "description",
        current: "Un texte.",
        oldString: "introuvable",
        tools: TOOLS,
        newString: "x",
      }),
      editIssueText({
        field: "description",
        current: "Un texte.",
        oldString: "",
        tools: TOOLS,
        newString: "x",
      }),
    ];

    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false);
      if (refusal.ok) continue;
      expect(refusal.message).not.toMatch(/file|write_file/i);
    }
  });
});

/**
 * Three surfaces serve this patch — the MCP, the Numo chat, the code agent — and
 * they do not name the same tools. A refusal that sends to an absent tool
 * on the surface causes the model to lose a turn on an “Unknown tool”.
 */
describe("editIssueText — les refus nomment les tools de LA surface", () => {
  const NUMO: IssueTextTools = {
    read: "get_issue",
    appendToPlan: "append_to_plan",
    replaceWhole: {
      plan: "update_issues { fields: { plan } }",
      description: "update_issues { fields: { description } }",
    },
  };
  const AGENT: IssueTextTools = {
    read: "read_issue",
    appendToPlan: "append_to_plan",
    replaceWhole: { plan: "write_issue_plan", description: "update_issue" },
  };

  it("renvoie vers le lecteur de la surface, jamais vers celui d'une autre", () => {
    for (const [tools, reader] of [
      [TOOLS, "minddy_get_issue"],
      [NUMO, "get_issue"],
      [AGENT, "read_issue"],
    ] as const) {
      const result = editIssueText({
        field: "plan",
        current: "# Un plan\n\n- [ ] Une tâche\n",
        oldString: "une phrase absente",
        newString: "x",
        tools,
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.message).toContain(reader);
    }
  });

  it("names the correct complete write by surface AND field", () => {
    const onEmpty = (tools: IssueTextTools, field: "plan" | "description") => {
      const result = editIssueText({
        field,
        current: "",
        oldString: "a",
        newString: "b",
        tools,
      });
      return result.ok ? "" : result.message;
    };

    expect(onEmpty(AGENT, "plan")).toContain("write_issue_plan");
    expect(onEmpty(AGENT, "description")).toContain("update_issue");
    expect(onEmpty(AGENT, "description")).not.toContain("write_issue_plan");
    expect(onEmpty(NUMO, "plan")).toContain("update_issues { fields: { plan } }");
    expect(onEmpty(NUMO, "plan")).not.toContain("minddy_");
  });
});
