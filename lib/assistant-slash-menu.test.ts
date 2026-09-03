import { describe, expect, it } from "vitest";

import { filterSlashOptions } from "./assistant-slash-options";

const command = {
  kind: "command",
  id: "create-issue",
  label: "create issue",
  description: "Create a complete issue",
  keywords: ["ticket"],
} as const;

describe("Numo slash options", () => {
  const skills = [{
    kind: "skill",
    id: ".agents/skills/release/SKILL.md",
    label: "release",
    description: "Publish signed artifacts",
  }] as const;

  it("searches commands and skills by label, description, and command aliases", () => {
    expect(filterSlashOptions([command, ...skills], "ticket")).toEqual([command]);
    expect(filterSlashOptions([command, ...skills], "signed")).toEqual(skills);
    expect(filterSlashOptions([command, ...skills], "release")).toEqual(skills);
  });
});
