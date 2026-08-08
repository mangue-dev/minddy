import { describe, expect, it } from "vitest";
import { turnSubagents } from "./agent-subagents";
import type { AgentRunEvent } from "./agent-api";

/**
 * Ce que la carte au-dessus du composer lit pour dire « ça tourne encore ».
 *
 * Deux cas portent tout le reste. Une fille COUPÉE n'émet ni résumé ni erreur —
 * seul le parent annonce la livraison de son rapport : sans cette lecture-là, elle
 * resterait « au travail » pour toujours, et la carte mentirait exactement là où
 * elle est censée rassurer. Et la fenêtre est le TOUR, pas la session : les filles
 * d'un tour passé ont déjà rendu, les lister ferait grandir la carte à chaque
 * délégation de la conversation.
 */

let seq = 0;
function ev(
  type: AgentRunEvent["type"],
  payload: Record<string, unknown>,
  createdAt = "2026-08-08T10:00:00.000Z",
): AgentRunEvent {
  seq += 1;
  return { id: `e${seq}`, seq, type, payload, created_at: createdAt };
}

describe("turnSubagents", () => {
  it("rend une fille lancée, sans instant de fin tant qu'elle tourne", () => {
    expect(
      turnSubagents([
        ev("tool_call", { name: "spawn_agent", id: "t1" }),
        ev("thinking", { subagent_id: "sub-1", subagent_mode: "explore", text: "je regarde" }),
        ev("tool_call", { subagent_id: "sub-1", name: "grep", id: "t2" }),
      ]),
    ).toEqual([
      expect.objectContaining({ id: "sub-1", mode: "explore", endedAt: null }),
    ]);
  });

  it("fige la fille qui a rendu son résumé, et garde celle qui tourne encore", () => {
    const found = turnSubagents([
      ev("thinking", { subagent_id: "sub-1", subagent_mode: "explore", text: "…" }),
      ev("thinking", { subagent_id: "sub-2", subagent_mode: "implement", text: "…" }),
      ev("summary", { subagent_id: "sub-1", text: "rapport" }, "2026-08-08T10:02:00.000Z"),
    ]);
    expect(found).toEqual([
      expect.objectContaining({ id: "sub-1", endedAt: "2026-08-08T10:02:00.000Z" }),
      expect.objectContaining({ id: "sub-2", endedAt: null }),
    ]);
  });

  it("fige une fille en échec", () => {
    const [sub] = turnSubagents([
      ev("thinking", { subagent_id: "sub-1", text: "…" }),
      ev("error", { subagent_id: "sub-1", message: "boum" }, "2026-08-08T10:01:00.000Z"),
    ]);
    expect(sub.endedAt).toBe("2026-08-08T10:01:00.000Z");
  });

  it("fige une fille COUPÉE, que seul le parent déclare livrée", () => {
    // Ni résumé ni erreur : une boucle suspendue n'en émet aucun. C'est l'event
    // `status` du PARENT qui clôt la ligne.
    const [sub] = turnSubagents([
      ev("thinking", { subagent_id: "sub-1", text: "…" }),
      ev(
        "status",
        { phase: "subagent_report", id: "sub-1", partial: true },
        "2026-08-08T10:03:00.000Z",
      ),
    ]);
    expect(sub.endedAt).toBe("2026-08-08T10:03:00.000Z");
  });

  it("oublie les filles du tour PRÉCÉDENT — la réponse du parent le referme", () => {
    expect(
      turnSubagents([
        ev("thinking", { subagent_id: "sub-1", text: "…" }),
        ev("summary", { subagent_id: "sub-1", text: "rapport" }),
        // Le PARENT répond : le tour est fini, tout ce qui précède avec.
        ev("summary", { text: "voilà ce que j'ai trouvé" }),
        ev("user_message", { text: "continue" }),
        ev("thinking", { subagent_id: "sub-2", subagent_mode: "implement", text: "…" }),
      ]).map((s) => s.id),
    ).toEqual(["sub-2"]);
  });

  it("rend les filles de la plus ancienne à la plus récente", () => {
    expect(
      turnSubagents([
        ev("thinking", { subagent_id: "sub-2", text: "…" }, "2026-08-08T10:00:10.000Z"),
        ev("thinking", { subagent_id: "sub-1", text: "…" }, "2026-08-08T10:00:00.000Z"),
      ]).map((s) => s.id),
    ).toEqual(["sub-1", "sub-2"]);
  });
});
