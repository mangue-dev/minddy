import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchRepositorySkill,
  fetchRepositorySkills,
} from "./use-repository-skills";
import type {
  RepositorySkill,
  RepositorySkillSummary,
} from "./repository-skills";

const skill: RepositorySkillSummary = {
  path: ".agents/skills/cloud/SKILL.md",
  name: "cloud",
  description: "Use the linked repository skill",
  source: ".agents/skills",
};

const loadedSkill: RepositorySkill = {
  ...skill,
  content: "# Cloud skill\n\nFollow the linked repository instructions.",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("linked repository skills", () => {
  it("lists the skills of the default branch, or of the selected ref", async () => {
    const fetch = vi.fn().mockImplementation(async () => json({ skills: [skill] }));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchRepositorySkills("project-id")).resolves.toEqual([skill]);
    await expect(fetchRepositorySkills("project-id", "release/next")).resolves.toEqual([skill]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/projects/project-id/skills",
      "/api/projects/project-id/skills?ref=release%2Fnext",
    ]);
  });

  it("answers no skills when the server refuses or sends no list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({}, 403)).mockResolvedValueOnce(json({})));

    await expect(fetchRepositorySkills("project-id")).resolves.toEqual([]);
    await expect(fetchRepositorySkills("project-id")).resolves.toEqual([]);
  });

  it("loads one skill's content from the selected ref", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ skill: loadedSkill }));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchRepositorySkill("project-id", skill.path, "release/next")).resolves.toEqual(loadedSkill);
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-id/skills?path=.agents%2Fskills%2Fcloud%2FSKILL.md&ref=release%2Fnext",
    );
  });
});
