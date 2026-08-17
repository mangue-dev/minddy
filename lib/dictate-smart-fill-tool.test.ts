import { describe, expect, it } from "vitest";

import { updateDraftTool } from "@/lib/dictate-smart-fill-tool";

/**
 * SOUS SMART-FILL, LA DICTÉE NE POSE PLUS LES QUATRE PROPRIÉTÉS (MIN-260).
 *
 * Le formulaire ne les montre plus, et le serveur ne remplit que ce qui est
 * vide : une dictée qui les posait quand même écrivait des valeurs invisibles
 * QUI GAGNAIENT sur Smart-fill — l'automatisation qu'on croyait armée ne
 * faisait alors plus rien, sans que rien ne le dise.
 *
 * Les champs sont retirés du SCHÉMA plutôt que filtrés de la réponse : un
 * argument qu'on ne propose pas n'est ni rempli, ni raisonné, ni facturé. Rien
 * de tout ça ne se voit à l'écran, d'où ce test.
 */

const SMART_FILLED = ["priority", "effort", "objective_id", "category_ids"];
const KEPT = ["title", "description", "status", "assignee_id", "due_date"];

function properties(smartFill: boolean): string[] {
  return Object.keys(updateDraftTool(smartFill).function.parameters.properties);
}

describe("updateDraftTool", () => {
  it("offre tous les champs quand Smart-fill est coupé", () => {
    const keys = properties(false);
    for (const field of [...SMART_FILLED, ...KEPT]) expect(keys).toContain(field);
  });

  it("retire les quatre champs de Smart-fill quand il est armé", () => {
    const keys = properties(true);
    for (const field of SMART_FILLED) expect(keys).not.toContain(field);
  });

  it("garde ce qui reste à la dictée : titre, description, statut, assigné, échéance", () => {
    // Ces trois-là ne sont pas de Smart-fill (elles disent une intention, pas un
    // contenu) : les perdre serait rendre la dictée muette sur l'essentiel.
    const keys = properties(true);
    for (const field of KEPT) expect(keys).toContain(field);
  });

  it("ne mute pas le tool partagé — deux dictées de suite, deux schémas justes", () => {
    // `updateDraftTool` part d'une constante de module : un `delete` sur l'objet
    // d'origine amputerait toutes les dictées suivantes du process, y compris
    // celles des utilisateurs qui n'ont pas Smart-fill.
    updateDraftTool(true);
    expect(properties(false)).toContain("priority");
  });
});
