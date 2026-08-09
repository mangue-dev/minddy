import { describe, expect, it } from "vitest";

import { agentRunTitleSource } from "./run-title";

/**
 * Ce qu'on donne au titreur pour nommer une conversation. Le ticket d'abord, la
 * consigne ensuite : c'est l'assemblage des deux qui distingue trois
 * conversations du même ticket, là où le seul titre du ticket les nommait toutes
 * pareil et où la seule consigne (« implémente ça ») ne nomme rien.
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
    // Le bouton « Implémenter » nu : rien n'a été écrit, le ticket EST la mission.
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
    // L'appelant saute alors l'appel au modèle plutôt que de lui poster du vide.
    expect(agentRunTitleSource({})).toBeNull();
    expect(agentRunTitleSource({ issueTitle: " ", prompt: null })).toBeNull();
  });
});
