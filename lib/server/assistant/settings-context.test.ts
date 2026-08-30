import { describe, expect, it } from "vitest";
import { buildPageContextBlock } from "./prompt";

describe("buildPageContextBlock — settings", () => {
  it("identifies account settings as the active surface", () => {
    const block = buildPageContextBlock({ settings: "account" });

    expect(block).toContain("account settings");
    expect(block).toContain("get_account_settings");
    expect(block).toContain("update_account_settings");
  });

  it("identifies project settings and carries the project id", () => {
    const block = buildPageContextBlock({
      projectId: "project-1",
      settings: "project",
    });

    expect(block).toContain("settings of the current project");
    expect(block).toContain("project-1");
    expect(block).toContain("update_project");
  });
});
