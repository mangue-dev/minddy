import { describe, expect, it, vi } from "vitest";

import { resolveAssistantProjectId } from "./project-scope";

vi.mock("server-only", () => ({}));

const { buildSystemPrompt } = await import("./prompt");

describe("Numo project scope", () => {
  it("keeps the conversation project when no alternate target is supplied", () => {
    expect(resolveAssistantProjectId("current-project", undefined)).toBe(
      "current-project",
    );
    expect(resolveAssistantProjectId("current-project", "  ")).toBe(
      "current-project",
    );
  });

  it("lets an explicit alternate project override the conversation project", () => {
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

    expect(prompt).toContain("This project is the DEFAULT");
    expect(prompt).toContain(
      "Only when the user explicitly names another project",
    );
    expect(prompt).toContain("call `list_projects`");
    expect(prompt).toContain("ask which project they mean");
    expect(prompt).toContain(
      "tools documented as OWNER ONLY remain owner-only",
    );
  });
});
