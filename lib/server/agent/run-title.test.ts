import { describe, expect, it } from "vitest";

import { agentRunTitleSource } from "./run-title";

/**
 * What we give to the titrator to name a conversation. The ticket first, the
 * then records: it is the assembly of the two which distinguishes three
 * conversations of the same ticket, where the sole title of the ticket named them all
 * the same and where the only instruction ("implement this") names nothing.
 */
describe("agentRunTitleSource", () => {
  it("assemble le ticket et la consigne", () => {
    expect(
      agentRunTitleSource({
        issueTitle: "La redirection après login boucle",
        prompt: "regarde le middleware",
      }),
    ).toBe("La redirection après login boucle\n\nregarde le middleware");
  });

  it("se contente du ticket quand le lancement n'a pas de consigne", () => {
    // The bare “Implement” button: nothing has been written, the ticket IS the mission.
    expect(agentRunTitleSource({ issueTitle: "Export CSV des tickets" })).toBe(
      "Export CSV des tickets",
    );
    expect(
      agentRunTitleSource({ issueTitle: "Export CSV des tickets", prompt: "  " }),
    ).toBe("Export CSV des tickets");
  });

  it("se contente de la note d'une conversation sans ticket", () => {
    expect(agentRunTitleSource({ issueTitle: null, prompt: "Migration MCP" })).toBe(
      "Migration MCP",
    );
  });

  it("rend null quand il n'y a rien à résumer", () => {
    // The caller then skips the call to the model rather than posting it empty.
    expect(agentRunTitleSource({})).toBeNull();
    expect(agentRunTitleSource({ issueTitle: " ", prompt: null })).toBeNull();
  });
});
