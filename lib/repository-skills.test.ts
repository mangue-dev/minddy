import { describe, expect, it } from "vitest";

import {
  discoverRepositorySkills,
  isRepositorySkillPath,
  parseRepositorySkill,
} from "./repository-skills";

describe("repository skills", () => {
  it("recognizes compatible repository skill locations only", () => {
    expect(isRepositorySkillPath(".agents/skills/release/SKILL.md")).toBe(true);
    expect(isRepositorySkillPath(".claude/skills/release/SKILL.md")).toBe(true);
    expect(isRepositorySkillPath(".github/skills/release/SKILL.md")).toBe(true);
    expect(isRepositorySkillPath(".cursor/skills/team/release/SKILL.md")).toBe(true);
    expect(isRepositorySkillPath(".codex/skills/release/SKILL.md")).toBe(true);
    expect(isRepositorySkillPath(".gemini/skills/release/SKILL.md")).toBe(true);
    expect(isRepositorySkillPath("skills/release/SKILL.md")).toBe(false);
    expect(isRepositorySkillPath(".agents/skills/../secret/SKILL.md")).toBe(false);
    expect(isRepositorySkillPath(".agents/skills//release/SKILL.md")).toBe(false);
  });

  it("reads standard and folded frontmatter while keeping only instructions", () => {
    expect(
      parseRepositorySkill(
        ".agents/skills/release/SKILL.md",
        `---\nname: release\ndescription: >-\n  Prepare a signed release\n  and verify its artifacts.\n---\n\n# Release\n\nRun the checklist.`,
      ),
    ).toEqual({
      path: ".agents/skills/release/SKILL.md",
      name: "release",
      description: "Prepare a signed release and verify its artifacts.",
      source: ".agents/skills",
      content: "# Release\n\nRun the checklist.",
    });
  });

  it("falls back to the directory name and first body paragraph for Claude-compatible files", () => {
    const skill = parseRepositorySkill(
      ".claude/skills/check-pr/SKILL.md",
      "# Check pull request\n\nReview the current changes before merging.",
    );
    expect(skill?.name).toBe("check-pr");
    expect(skill?.description).toBe("Review the current changes before merging.");
  });

  it("deduplicates paths, ignores unrelated files, and sorts by skill name", async () => {
    const files = new Map([
      [
        ".agents/skills/zeta/SKILL.md",
        "---\nname: zeta\ndescription: Zeta workflow\n---\nDo zeta.",
      ],
      [
        ".cursor/skills/alpha/SKILL.md",
        "---\nname: alpha\ndescription: Alpha workflow\n---\nDo alpha.",
      ],
    ]);
    const skills = await discoverRepositorySkills(
      [
        ".agents/skills/zeta/SKILL.md",
        ".cursor/skills/alpha/SKILL.md",
        ".agents/skills/zeta/SKILL.md",
        "README.md",
      ],
      async (path) => files.get(path) ?? null,
    );
    expect(skills.map((skill) => skill.name)).toEqual(["alpha", "zeta"]);
  });

  it("keeps the cross-client location when duplicate skill names exist", async () => {
    const skills = await discoverRepositorySkills(
      [
        ".claude/skills/release/SKILL.md",
        ".agents/skills/release/SKILL.md",
      ],
      async (path) =>
        `---\nname: release\ndescription: Release from ${path}\n---\nFollow ${path}.`,
    );
    expect(skills).toHaveLength(1);
    expect(skills[0].source).toBe(".agents/skills");
  });
});
