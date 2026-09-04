import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  MAX_SKILL_FILE_BYTES,
  REPOSITORY_SKILL_ROOTS,
  discoverRepositorySkills,
  parseRepositorySkill,
  summarizeRepositorySkill,
  type RepositorySkill,
  type RepositorySkillSummary,
} from "@/lib/repository-skills";

const MAX_LOCAL_DISCOVERY_DIRECTORIES = 300;

function isDirectoryWithoutFollowingLinks(directory: string): boolean {
  try {
    return lstatSync(directory).isDirectory();
  } catch {
    return false;
  }
}

/** Find skill entrypoints without following symlinks outside the attached repository. */
export function localRepositorySkillPaths(repoPath: string): string[] {
  const queue: string[] = REPOSITORY_SKILL_ROOTS.filter((root) =>
    isDirectoryWithoutFollowingLinks(path.join(repoPath, root)),
  );
  const skills: string[] = [];
  let visited = 0;

  while (queue.length > 0 && visited < MAX_LOCAL_DISCOVERY_DIRECTORIES) {
    const relativeDirectory = queue.shift()!;
    visited += 1;
    let entries;
    try {
      entries = readdirSync(path.join(repoPath, relativeDirectory), {
        withFileTypes: true,
      }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      skills.push(`${relativeDirectory}/SKILL.md`);
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push(`${relativeDirectory}/${entry.name}`);
    }
  }

  return skills;
}

function readLocalSkill(repoPath: string, relativePath: string): string | null {
  const absolutePath = path.join(repoPath, ...relativePath.split("/"));
  try {
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.size > MAX_SKILL_FILE_BYTES) return null;
    return readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}

/** Metadata-only inventory for a repository already validated by the desktop shell. */
export async function listLocalRepositorySkills(
  repoPath: string,
): Promise<RepositorySkillSummary[]> {
  const skills = await discoverRepositorySkills(
    localRepositorySkillPaths(repoPath),
    async (relativePath) => readLocalSkill(repoPath, relativePath),
  );
  return skills.map(summarizeRepositorySkill);
}

/** Load one discovered local skill without accepting arbitrary repository paths. */
export function loadLocalRepositorySkill(
  repoPath: string,
  relativePath: string,
): RepositorySkill | null {
  if (!localRepositorySkillPaths(repoPath).includes(relativePath)) return null;
  const raw = readLocalSkill(repoPath, relativePath);
  return raw === null ? null : parseRepositorySkill(relativePath, raw);
}
