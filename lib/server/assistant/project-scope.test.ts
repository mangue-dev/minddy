import { describe, expect, it, vi } from "vitest";

import { resolveAssistantProjectId } from "./project-scope";

vi.mock("server-only", () => ({}));

const { buildSystemPrompt } = await import("./prompt");

describe("Numo project scope", () => {
  it("keeps the context project when no alternate target is supplied", () => {
    expect(resolveAssistantProjectId("current-project", undefined)).toBe(
      "current-project",
    );
    expect(resolveAssistantProjectId("current-project", "  ")).toBe(
      "current-project",
    );
  });

  it("lets an explicit alternate project override the context project", () => {
    expect(
      resolveAssistantProjectId("current-project", " alternate-project "),
    ).toBe("alternate-project");
  });

  it("requires a named project before cross-project work", () => {
    const prompt = buildSystemPrompt(
      {
        id: "current-project",
        name: "Current project",
        key: "CUR",
        statusCounts: {},
        recentIssues: [],
        members: [],
        objectives: [],
        categories: [],
      },
      "en",
    );

    expect(prompt).toContain("Conversations have no project identity");
    expect(prompt).toContain(
      "never an implicit mutation target",
    );
    expect(prompt).toContain("call `list_projects`");
    expect(prompt).toContain("Ask which project they mean");
    expect(prompt).toContain(
      "tools documented as OWNER ONLY remain owner-only",
    );
  });
});
