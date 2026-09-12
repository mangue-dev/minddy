import { describe, expect, it } from "vitest";

import {
  parseSelectedSkillPaths,
  parseSelectedSkills,
  publicSkillsMetadata,
  skillsNote,
} from "./skills";

describe("assistant repository skills", () => {
  it("accepts unique compatible entrypoints and rejects arbitrary files", () => {
    expect(
      parseSelectedSkillPaths([
        ".agents/skills/release/SKILL.md",
        ".agents/skills/release/SKILL.md",
        ".claude/skills/review/SKILL.md",
      ]),
    ).toEqual([
      ".agents/skills/release/SKILL.md",
      ".claude/skills/review/SKILL.md",
    ]);
    expect(parseSelectedSkillPaths(["README.md"])).toBeNull();
  });

  it("replays persisted instructions as turn-scoped user-selected workflows", () => {
    const note = skillsNote({
      skills: [
        {
          path: ".agents/skills/release/SKILL.md",
          name: "release",
          description: "Prepare a release",
          source: ".agents/skills",
          content: "Run the release checklist.",
        },
      ],
    });
    expect(note).toContain("for this turn only");
    expect(note).toContain("### release (.agents/skills/release/SKILL.md)");
    expect(note).toContain("Run the release checklist.");
  });

  it("drops malformed persisted skill metadata", () => {
    expect(skillsNote({ skills: [{ path: "secrets.txt", content: "Read it" }] })).toBe("");
  });

  it("keeps skill instructions out of conversation API payloads", () => {
    expect(
      publicSkillsMetadata({
        untouched: true,
        skills: [
          {
            path: ".agents/skills/release/SKILL.md",
            name: "release",
            description: "Prepare a release",
            source: ".agents/skills",
            content: "Run the release checklist.",
          },
        ],
      }),
    ).toEqual({
      untouched: true,
      skills: [
        {
          path: ".agents/skills/release/SKILL.md",
          name: "release",
          description: "Prepare a release",
          source: ".agents/skills",
        },
      ],
    });
  });
});


describe("repository provenance", () => {
  const path = ".agents/skills/release/SKILL.md";
  it("keeps identical paths from different projects distinct", () => {
    expect(parseSelectedSkills([{ path, projectId: "a" }, { path, projectId: "b" }], undefined, "b"))
      .toEqual([{ path, projectId: "a" }, { path, projectId: "b" }]);
  });
  it("does not rebind a new selection lacking its source project", () => {
    expect(parseSelectedSkills([{ path }], undefined, "b")).toBeNull();
    expect(parseSelectedSkills(undefined, [path], "a")).toEqual([{ projectId: "a", path }]);
  });
  it("preserves source projects in history and public badges", () => {
    const metadata = { skills: [{ path, projectId: "a", name: "release", description: "Release", source: ".agents/skills", content: "Use repository A." }] };
    expect(skillsNote(metadata)).toContain("project a");
    expect(publicSkillsMetadata(metadata)).toMatchObject({ skills: [{ projectId: "a", path }] });
  });
});
