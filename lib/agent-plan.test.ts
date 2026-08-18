import { describe, expect, it } from "vitest";
import { livePlan } from "./agent-plan";
import type { AgentRunEvent } from "./agent-api";

/**
 * What the outline card above the composer reads.
 *
 * Two dots carry everything. `update_plan` returns the ENTIRE plan on each call,
 * so the last event wins — including when it is EMPTY: accumulating the steps
 * would make the checklist grow with each check, and a step deleted by the agent
 * would remain displayed forever. And the window is the TOUR: a plan of the previous tour
 * describes a completed work, and displaying it again above the input where one
 * types the next question would make a dead checklist appear alive.
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
