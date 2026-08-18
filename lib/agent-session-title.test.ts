import { describe, expect, it } from "vitest";

import { agentSessionTitle } from "./agent-session-title";

/**
 * The name of an agent conversation, in the column as well as in the header.
 * What matters here: one run = one conversation, so a ticket carries
 * several — and without its identifier in front, nothing distinguishes them.
 */
const project = { id: "p1", key: "MIN", name: "minddy", icon_url: null, orb_seed: null };
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
    // A run before `agent_runs.title`, or whose call to the titrator failed:
    // better ticket title than generic fallback.
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
    // Case of aberrant RLS: the line is painted anyway, without prefix
    // invented (“undefined-42” would have read like data).
    expect(
      agentSessionTitle({ title: "Corriger la redirection", issue, project: null }, "Sans titre"),
    ).toBe("Corriger la redirection");
  });
});
