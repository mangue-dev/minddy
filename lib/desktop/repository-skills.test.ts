import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  listLocalRepositorySkills,
  loadLocalRepositorySkill,
  localRepositorySkillPaths,
} from "./repository-skills";

const roots: string[] = [];

function temporaryRepository(): string {
  const root = mkdtempSync(path.join(tmpdir(), "minddy-repository-skills-"));
  roots.push(root);
  return root;
}

function writeSkill(root: string, relativeDirectory: string, name: string): void {
  const directory = path.join(root, relativeDirectory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use ${name}\n---\nFollow ${name}.`,
    "utf8",
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("desktop repository skill discovery", () => {
  it("finds local-only skills in every supported repository root", async () => {
    const root = temporaryRepository();
    writeSkill(root, ".agents/skills/release", "release");
    writeSkill(root, ".cursor/skills/review", "review");

    expect(localRepositorySkillPaths(root)).toEqual([
      ".agents/skills/release/SKILL.md",
      ".cursor/skills/review/SKILL.md",
    ]);
    await expect(listLocalRepositorySkills(root)).resolves.toMatchObject([
      { name: "release", source: ".agents/skills" },
      { name: "review", source: ".cursor/skills" },
    ]);
  });

  it("does not follow a skill root symlink outside the attached repository", () => {
    const root = temporaryRepository();
    const outside = temporaryRepository();
    writeSkill(outside, "release", "outside");
    mkdirSync(path.join(root, ".agents"), { recursive: true });
    symlinkSync(outside, path.join(root, ".agents", "skills"));

    expect(localRepositorySkillPaths(root)).toEqual([]);
  });

  it("loads Markdown only for a skill found during local discovery", () => {
    const root = temporaryRepository();
    writeSkill(root, ".agents/skills/release", "release");
    const skillPath = ".agents/skills/release/SKILL.md";

    expect(loadLocalRepositorySkill(root, skillPath)).toMatchObject({
      path: skillPath,
      name: "release",
      content: "Follow release.",
    });
    expect(
      loadLocalRepositorySkill(root, ".agents/skills/missing/SKILL.md"),
    ).toBeNull();
  });
});
