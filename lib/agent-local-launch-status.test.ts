import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Les deux composeurs rendent un `AgentEventFeed` avant que le POST ait créé la
 * run. Cette surface ne peut pas être rendue sous Vitest sans le graphe client,
 * mais son contrat est simple et important : le choix local doit atteindre la
 * bulle optimiste, qui décide entre « sandbox » et « ton Mac ».
 */
const issueComposer = readFileSync(
  join(__dirname, "../components/agent/agent-conversation.tsx"),
  "utf8",
);
const sessionComposer = readFileSync(
  join(__dirname, "../components/agents/session-compose.tsx"),
  "utf8",
);

describe("statut optimiste d'un lancement local", () => {
  it("transmet le choix local depuis le composer de ticket", () => {
    expect(issueComposer).toContain("const [launchLocalExec, setLaunchLocalExec] = useState(false);");
    expect(issueComposer).toContain("localExec={launchLocalExec}");
  });

  it("transmet le choix local depuis le composer de session", () => {
    expect(sessionComposer).toContain("const [launchLocalExec, setLaunchLocalExec] = useState(false);");
    expect(sessionComposer).toContain("localExec={launchLocalExec}");
  });
});
