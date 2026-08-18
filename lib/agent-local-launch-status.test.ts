import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Both composers return a `AgentEventFeed` before POST has created the
 * run. This surface cannot be rendered under Vitest without the client graph,
 * but its contract is simple and important: the local choice must reach the
 * optimistic bubble, which decides between “sandbox” and “your Mac”.
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
