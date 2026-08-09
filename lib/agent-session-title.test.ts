import { describe, expect, it } from "vitest";

import { agentSessionTitle } from "./agent-session-title";

/**
 * Le nom d'une conversation de l'agent, dans la colonne comme dans l'en-tête.
 * Ce qui compte ici : un run = une conversation, donc un ticket en porte
 * plusieurs — et sans son identifiant devant, rien ne les distingue.
 */
const project = { id: "p1", key: "MIN", name: "minddy", icon_url: null };
const issue = { id: "i1", number: 42, title: "La redirection après login boucle" };

describe("agentSessionTitle", () => {
  it("préfixe une conversation de ticket de son identifiant", () => {
    expect(
      agentSessionTitle(
        { title: "Corriger la redirection", issue, project },
        "Sans titre",
      ),
    ).toBe("MIN-42: Corriger la redirection");
  });

  it("retombe sur le titre du ticket quand la génération n'a rien donné", () => {
    // Un run d'avant `agent_runs.title`, ou dont l'appel au titreur a échoué :
    // mieux vaut le titre du ticket que le repli générique.
    expect(agentSessionTitle({ title: null, issue, project }, "Sans titre")).toBe(
      "MIN-42: La redirection après login boucle",
    );
  });

  it("ne préfixe pas une conversation sans ticket", () => {
    expect(
      agentSessionTitle(
        { title: "Migration MCP", issue: null, project },
        "Sans titre",
      ),
    ).toBe("Migration MCP");
  });

  it("retombe sur le repli quand il n'y a ni titre ni ticket", () => {
    expect(
      agentSessionTitle({ title: null, issue: null, project }, "Sans titre"),
    ).toBe("Sans titre");
    // Un titre vide (ou fait d'espaces) ne vaut pas mieux qu'absent.
    expect(
      agentSessionTitle({ title: "   ", issue: null, project }, "Sans titre"),
    ).toBe("Sans titre");
  });

  it("sans projet joint, pas d'identifiant à écrire — le titre suffit", () => {
    // Cas de RLS aberrante : la ligne est peinte quand même, sans préfixe
    // inventé (« undefined-42 » se serait lu comme une donnée).
    expect(
      agentSessionTitle({ title: "Corriger la redirection", issue, project: null }, "Sans titre"),
    ).toBe("Corriger la redirection");
  });
});
