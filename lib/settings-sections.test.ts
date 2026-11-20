import { describe, expect, it } from "vitest";
import {
  canOpenProjectSettingsTab,
  projectSectionAudience,
  type ProjectSettingsTab,
} from "./settings-sections";

const PROJECT_TABS: ProjectSettingsTab[] = [
  "general",
  "categories",
  "members",
  "recurrences",
  "smart-assign",
  "ai-instructions",
  "feedback",
  "git",
  "import",
  "integrations",
];

describe("project settings access (MIN-962)", () => {
  it("opens every tab to the owner", () => {
    expect(PROJECT_TABS.filter((tab) => canOpenProjectSettingsTab(tab, true))).toEqual(
      PROJECT_TABS,
    );
  });

  it("leaves members and readers the General and Members tabs only", () => {
    expect(PROJECT_TABS.filter((tab) => canOpenProjectSettingsTab(tab, false))).toEqual([
      "general",
      "members",
    ]);
  });

  it("reserves sections on owner-only tabs to the owner in search", () => {
    expect(projectSectionAudience("categories", undefined)).toBe("owner");
    expect(projectSectionAudience("integrations", undefined)).toBe("owner");
    expect(projectSectionAudience("members", undefined)).toBeUndefined();
    expect(projectSectionAudience("general", undefined)).toBeUndefined();
  });

  it("keeps an explicit audience, such as Leave for members", () => {
    expect(projectSectionAudience("general", "member")).toBe("member");
  });
});
