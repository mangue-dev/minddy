import { describe, expect, it } from "vitest";
import { FEEDBACK_POST_STATUSES } from "@/lib/feedback/types";
import { mcpToolCatalog } from "./catalog";
import { MCP_SERVER_INSTRUCTIONS } from "./instructions";

/**
 * Le catalogue est lu depuis l'enregistrement RÉEL des tools (catalog.ts), et
 * c'est lui que servent `/llms.txt` et la carte de serveur MCP. Ce que ce test
 * garde, c'est donc le contrat ANNONCÉ des écritures chirurgicales de plan
 * (MIN-186) : leurs noms, leurs paramètres, et le fait qu'elles soient nommées
 * là où un modèle les cherchera — dans le mode d'emploi du serveur, et dans la
 * description du tool qui, lui, remplace tout.
 */

const tool = (name: string) => {
  const found = mcpToolCatalog().find((t) => t.name === name);
  expect(found, `${name} is not registered`).toBeDefined();
  return found!;
};

const param = (name: string, paramName: string) => {
  const found = tool(name).params.find((p) => p.name === paramName);
  expect(found, `${name} has no "${paramName}" parameter`).toBeDefined();
  return found!;
};

describe("catalogue MCP — édition partielle d'un plan", () => {
  it("annonce minddy_append_to_plan avec markdown requis et section optionnelle", () => {
    expect(tool("minddy_append_to_plan").readOnly).toBe(false);
    expect(param("minddy_append_to_plan", "project_id").required).toBe(true);
    expect(param("minddy_append_to_plan", "issue").required).toBe(true);
    expect(param("minddy_append_to_plan", "markdown").required).toBe(true);
    expect(param("minddy_append_to_plan", "section").required).toBe(false);
  });

  it("annonce minddy_edit_issue_text en old_string → new_string", () => {
    expect(tool("minddy_edit_issue_text").readOnly).toBe(false);
    for (const required of ["project_id", "issue", "field", "old_string", "new_string"]) {
      expect(param("minddy_edit_issue_text", required).required).toBe(true);
    }
    expect(param("minddy_edit_issue_text", "replace_all").required).toBe(false);
    // new_string accepte la chaîne vide : c'est ainsi qu'on SUPPRIME un passage.
    expect(param("minddy_edit_issue_text", "new_string").description).toMatch(/empty/i);
  });

  it("détourne minddy_update_issues de la réécriture d'un plan existant", () => {
    const description = tool("minddy_update_issues").description ?? "";
    expect(description).toContain("minddy_edit_issue_text");
    expect(description).toContain("minddy_append_to_plan");
  });

  it("nomme les trois gestes chirurgicaux dans le mode d'emploi du serveur", () => {
    for (const name of [
      "minddy_append_to_plan",
      "minddy_edit_issue_text",
      "minddy_update_plan_task",
    ]) {
      expect(MCP_SERVER_INSTRUCTIONS).toContain(name);
    }
  });

  it("garde des noms d'outils uniques", () => {
    const names = mcpToolCatalog().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

/**
 * Ce que l'audit MCP du 2026-08-06 a trouvé désynchronisé du feedback, et qui
 * ne doit pas se re-désynchroniser : les descriptions et le mode d'emploi
 * sont de la PROSE, que rien ne relie à ses constantes. Ces trois assertions
 * sont ce lien — elles échouent le jour où un statut s'ajoute sans être dit.
 */
describe("catalogue MCP — le feedback dit ce que l'app fait", () => {
  it("nomme les six statuts d'un retour, `spam` compris", () => {
    const description = tool("minddy_list_feedback").description ?? "";
    for (const status of FEEDBACK_POST_STATUSES) {
      expect(description, `statut "${status}" absent de la description`).toContain(
        status
      );
    }
  });

  it("annonce minddy_update_feedback, et son statut verrouillé par le ticket", () => {
    expect(tool("minddy_update_feedback").readOnly).toBe(false);
    for (const optional of ["status", "is_public", "review_state"]) {
      expect(param("minddy_update_feedback", optional).required).toBe(false);
    }
    expect(MCP_SERVER_INSTRUCTIONS).toContain("minddy_update_feedback");
  });

  it("ne décrit plus le fil de commentaires comme team-only (MIN-196)", () => {
    // Le fil porte deux visibilités : le dire « internal, team-only » cachait
    // à l'agent les réponses publiques des visiteurs.
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("team-only comment thread");
    expect(tool("minddy_get_feedback").description).toContain("visibility");
  });
});
