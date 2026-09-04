import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchRepositorySkill,
  fetchRepositorySkills,
} from "./use-repository-skills";
import type {
  RepositorySkill,
  RepositorySkillSummary,
} from "./repository-skills";

const cloudSkill: RepositorySkillSummary = {
  path: ".agents/skills/cloud/SKILL.md",
  name: "cloud",
  description: "Use the linked repository skill",
  source: ".agents/skills",
};

const localSkill: RepositorySkillSummary = {
  path: ".claude/skills/local/SKILL.md",
  name: "local",
  description: "Use the local checkout skill",
  source: ".claude/skills",
};

const loadedCloudSkill: RepositorySkill = {
  ...cloudSkill,
  content: "# Cloud skill\n\nFollow the linked repository instructions.",
};

const loadedLocalSkill: RepositorySkill = {
  ...localSkill,
  content: "# Local skill\n\nFollow the attached checkout instructions.",
};

function cloudResponse() {
  return new Response(JSON.stringify({ skills: [cloudSkill] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function cloudSkillResponse() {
  return new Response(JSON.stringify({ skill: loadedCloudSkill }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("repository skill environment synchronization", () => {
  const input = {
    projectId: "project-id",
    environment: "local" as const,
    fullName: "mangue-dev/minddy",
    aliases: [],
  };

  it("uses the attached checkout when the desktop bridge supports discovery", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const localRepoSkills = vi.fn().mockResolvedValue([localSkill]);

    await expect(
      fetchRepositorySkills({ ...input, bridge: { localRepoSkills } }),
    ).resolves.toEqual([localSkill]);
    expect(localRepoSkills).toHaveBeenCalledWith({
      projectId: "project-id",
      fullName: "mangue-dev/minddy",
      aliases: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to linked-repository skills for an older desktop shell", async () => {
    const fetch = vi.fn().mockResolvedValue(cloudResponse());
    vi.stubGlobal("fetch", fetch);

    await expect(
      fetchRepositorySkills({ ...input, bridge: {} }),
    ).resolves.toEqual([cloudSkill]);
    expect(fetch).toHaveBeenCalledWith("/api/projects/project-id/skills");
  });

  it("falls back when the shell exposes discovery but its IPC handler rejects", async () => {
    const fetch = vi.fn().mockResolvedValue(cloudResponse());
    vi.stubGlobal("fetch", fetch);

    await expect(
      fetchRepositorySkills({
        ...input,
        environment: "worktree",
        bridge: { localRepoSkills: vi.fn().mockRejectedValue(new Error("missing handler")) },
      }),
    ).resolves.toEqual([cloudSkill]);
  });

  it("loads preview content from the attached checkout", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const localRepoSkill = vi.fn().mockResolvedValue(loadedLocalSkill);

    await expect(
      fetchRepositorySkill({
        ...input,
        path: localSkill.path,
        bridge: { localRepoSkill },
      }),
    ).resolves.toEqual(loadedLocalSkill);
    expect(localRepoSkill).toHaveBeenCalledWith({
      projectId: "project-id",
      fullName: "mangue-dev/minddy",
      aliases: [],
      path: localSkill.path,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads preview content from the linked repository for an older shell", async () => {
    const fetch = vi.fn().mockResolvedValue(cloudSkillResponse());
    vi.stubGlobal("fetch", fetch);

    await expect(
      fetchRepositorySkill({
        ...input,
        path: cloudSkill.path,
        bridge: {},
      }),
    ).resolves.toEqual(loadedCloudSkill);
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-id/skills?path=.agents%2Fskills%2Fcloud%2FSKILL.md",
    );
  });
});
