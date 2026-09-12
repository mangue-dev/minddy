import { describe, expect, it, vi } from "vitest";

import {
  parseSelectedSkillPaths,
  parseSelectedSkills,
  publicSkillsMetadata,
  skillsNote,
  authorizedSkillsNotes,
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

describe("historical skill authorization", () => {
  const skill = {
    path: ".agents/skills/review/SKILL.md", name: "review", description: "Review",
    source: ".agents/skills", content: "Review this repository.",
  };

  it("omits legacy instructions without a source instead of guessing their project", async () => {
    const from = vi.fn();
    expect(await authorizedSkillsNotes({ from } as never, [{ skills: [skill] }])).toEqual([""]);
    expect(from).not.toHaveBeenCalled();
  });

  it("omits instructions when the authorization query fails", async () => {
    const query = {
      select: vi.fn(() => query),
      in: vi.fn(() => query),
      is: vi.fn(async () => ({ data: null, error: { message: "Unavailable" } })),
    };
    const from = vi.fn(() => query);
    expect(await authorizedSkillsNotes({ from } as never, [
      { skills: [{ ...skill, projectId: "a" }] },
      { skills: [{ ...skill, projectId: "a" }] },
    ])).toEqual(["", ""]);
    expect(from).toHaveBeenCalledWith("projects");
    expect(query.in).toHaveBeenCalledExactlyOnceWith("id", ["a"]);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
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
