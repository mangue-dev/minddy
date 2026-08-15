import { describe, expect, it } from "vitest";
import { generatedAgentBranchName, slugForAgentBranch } from "./branch-name";

describe("generatedAgentBranchName", () => {
  it("uses the ticket identifier when the conversation is ticket-linked", () => {
    expect(
      generatedAgentBranchName({
        runId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
        issueIdentifier: "MIN-42",
        conversationTitle: "Refaire le menu",
      }),
    ).toBe("minddy/agent/min-42-12345678");
  });

  it("uses the conversation title when there is no ticket", () => {
    expect(
      generatedAgentBranchName({
        runId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
        conversationTitle: "Réparer l'écran d'accueil",
      }),
    ).toBe("minddy/agent/reparer-l-ecran-d-accueil-12345678");
  });

  it("falls back to the prompt, then to agent", () => {
    expect(
      generatedAgentBranchName({
        runId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
        prompt: "Ajouter un bouton",
      }),
    ).toBe("minddy/agent/ajouter-un-bouton-12345678");
    expect(slugForAgentBranch("   ")).toBe("agent");
  });
});
