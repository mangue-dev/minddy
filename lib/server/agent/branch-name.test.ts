import { describe, expect, it } from "vitest";
import {
  generatedAgentBranchName,
  isValidGitBranchName,
  normalizeAgentBranchPrefix,
  slugForAgentBranch,
} from "./branch-name";

describe("generatedAgentBranchName", () => {
  it("uses the ticket identifier when the conversation is ticket-linked", () => {
    expect(
      generatedAgentBranchName({
        runId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
        issueIdentifier: "MIN-42",
        conversationTitle: "Refaire le menu",
      }),
    ).toBe("numo/min-42-12345678");
  });

  it("uses the conversation title when there is no ticket", () => {
    expect(
      generatedAgentBranchName({
        runId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
        conversationTitle: "Réparer l'écran d'accueil",
      }),
    ).toBe("numo/reparer-l-ecran-d-accueil-12345678");
  });

  it("falls back to the prompt, then to agent", () => {
    expect(
      generatedAgentBranchName({
        runId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
        prompt: "Ajouter un bouton",
      }),
    ).toBe("numo/ajouter-un-bouton-12345678");
    expect(slugForAgentBranch("   ")).toBe("agent");
  });

  it("uses the account prefix in canonical form", () => {
    expect(
      generatedAgentBranchName({
        runId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
        issueIdentifier: "MIN-42",
        branchPrefix: "team/numo",
      }),
    ).toBe("team/numo/min-42-12345678");
  });
});

describe("normalizeAgentBranchPrefix", () => {
  it("trims the value and adds exactly one trailing slash", () => {
    expect(normalizeAgentBranchPrefix(" team/numo// ")).toBe("team/numo/");
  });

  it("rejects empty values and invalid git ref prefixes", () => {
    expect(normalizeAgentBranchPrefix(" ")).toBeNull();
    expect(normalizeAgentBranchPrefix("../release")).toBeNull();
    expect(normalizeAgentBranchPrefix("team branch")).toBeNull();
  });
});

describe("isValidGitBranchName", () => {
  it("accepts generated and inherited branch names", () => {
    expect(isValidGitBranchName("minddy/agent/min-457-abcd1234")).toBe(true);
    expect(isValidGitBranchName("release/next")).toBe(true);
  });

  it("rejects ref escapes, pathspec characters, and option-like names", () => {
    for (const branch of ["", "-main", "../main", ".hidden", "main..next", "main.lock", "a//b", "a b", "a~b", "a*b", "@{"]) {
      expect(isValidGitBranchName(branch), branch).toBe(false);
    }
  });
});
