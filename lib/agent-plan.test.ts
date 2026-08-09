import { describe, expect, it } from "vitest";
import { livePlan } from "./agent-plan";
import type { AgentRunEvent } from "./agent-api";

/**
 * Ce que la carte de plan au-dessus du composer lit.
 *
 * Deux points portent tout. `update_plan` renvoie le plan ENTIER à chaque appel,
 * donc le dernier event gagne — y compris quand il est VIDE : cumuler les étapes
 * ferait grossir la checklist à chaque coche, et une étape supprimée par l'agent
 * resterait affichée pour toujours. Et la fenêtre est le TOUR : un plan du tour
 * précédent décrit un travail rendu, et le rafficher au-dessus de l'input où l'on
 * tape la question suivante ferait passer une checklist morte pour vivante.
 */

let seq = 0;
function ev(type: AgentRunEvent["type"], payload: Record<string, unknown>): AgentRunEvent {
  seq += 1;
  return { id: `e${seq}`, seq, type, payload, created_at: "2026-08-09T10:00:00.000Z" };
}

describe("livePlan", () => {
  it("rend le plan du dernier `plan_update`, pas la somme des précédents", () => {
    expect(
      livePlan([
        ev("plan_update", {
          plan: [
            { step: "Lire le code", status: "in_progress" },
            { step: "Corriger", status: "pending" },
          ],
        }),
        ev("thinking", { text: "…" }),
        ev("plan_update", {
          plan: [
            { step: "Lire le code", status: "completed" },
            { step: "Corriger", status: "in_progress" },
          ],
        }),
      ]),
    ).toEqual([
      { step: "Lire le code", status: "completed" },
      { step: "Corriger", status: "in_progress" },
    ]);
  });

  it("oublie le plan du tour précédent : sa réponse rendue, il ne décrit plus rien", () => {
    expect(
      livePlan([
        ev("plan_update", { plan: [{ step: "Écrire le test", status: "in_progress" }] }),
        ev("summary", { text: "voilà" }),
        ev("user_message", { text: "et maintenant ?" }),
        ev("thinking", { text: "je regarde" }),
      ]),
    ).toEqual([]);
  });

  it("réapparaît dès que le nouveau tour repose un plan", () => {
    expect(
      livePlan([
        ev("plan_update", { plan: [{ step: "Étape d'avant", status: "completed" }] }),
        ev("summary", { text: "voilà" }),
        ev("user_message", { text: "continue" }),
        ev("plan_update", { plan: [{ step: "Étape d'après", status: "in_progress" }] }),
      ]),
    ).toEqual([{ step: "Étape d'après", status: "in_progress" }]);
  });

  it("ne se laisse pas fermer par le résumé d'un SOUS-AGENT : le tour du parent continue", () => {
    expect(
      livePlan([
        ev("plan_update", { plan: [{ step: "Déléguer l'exploration", status: "in_progress" }] }),
        ev("summary", { subagent_id: "sub-1", text: "rapport de la fille" }),
      ]),
    ).toEqual([{ step: "Déléguer l'exploration", status: "in_progress" }]);
  });

  it("rend un plan VIDE quand le dernier update l'a vidé", () => {
    expect(
      livePlan([
        ev("plan_update", { plan: [{ step: "Lire le code", status: "pending" }] }),
        ev("plan_update", { plan: [] }),
      ]),
    ).toEqual([]);
  });

  it("lit les events dans le désordre : c'est `seq` qui ordonne, pas le tableau", () => {
    const first = ev("plan_update", { plan: [{ step: "Étape A", status: "pending" }] });
    const second = ev("plan_update", { plan: [{ step: "Étape A", status: "completed" }] });
    expect(livePlan([second, first])).toEqual([{ step: "Étape A", status: "completed" }]);
  });

  it("retombe sur `pending` pour un statut inconnu et jette les étapes sans texte", () => {
    expect(
      livePlan([
        ev("plan_update", {
          plan: [
            { step: "Étape A", status: "doing" },
            { step: "   ", status: "completed" },
            { status: "pending" },
            null,
            { step: "Étape B", status: "cancelled" },
          ],
        }),
      ]),
    ).toEqual([
      { step: "Étape A", status: "pending" },
      { step: "Étape B", status: "cancelled" },
    ]);
  });

  it("rend vide quand aucun plan n'a été posé", () => {
    expect(livePlan([ev("thinking", { text: "…" })])).toEqual([]);
  });
});
