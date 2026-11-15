import "server-only";

import {
  MAX_SELECTED_SKILL_BYTES,
  MAX_SELECTED_SKILLS,
  REPOSITORY_SKILL_ROOTS,
  discoverRepositorySkills,
  isRepositorySkillPath,
  parseRepositorySkill,
  summarizeRepositorySkill,
  type RepositorySkill,
  type RepositorySkillSummary,
} from "@/lib/repository-skills";
import {
  resolveLinkedRepository,
  type LinkedRepository,
} from "@/lib/server/agent/repo-access";
import { isValidGitBranchName } from "@/lib/server/agent/branch-name";
import { forgeFor } from "@/lib/server/agent/forge";

async function repositorySkillPaths(target: LinkedRepository, ref: string): Promise<string[]> {
  return forgeFor(target.provider).findFilesNamed({
    token: target.token,
    repoFullName: target.repoFullName,
    ref,
    roots: REPOSITORY_SKILL_ROOTS,
    fileName: "SKILL.md",
  });
}

async function readRepositoryFile(
  target: LinkedRepository,
  path: string,
  ref: string,
): Promise<string | null> {
  return forgeFor(target.provider).getFileAtRef({
    token: target.token,
    repoFullName: target.repoFullName,
    path,
    ref,
  });
}

export async function listProjectRepositorySkills(
  projectId: string,
  requestedRef?: string | null,
): Promise<RepositorySkillSummary[]> {
  const target = await resolveLinkedRepository(projectId);
  if (!target) return [];
  const ref = requestedRef?.trim() || target.defaultBranch;
  if (!isValidGitBranchName(ref)) throw new Error("Invalid repository ref");
  const paths = await repositorySkillPaths(target, ref);
  const skills = await discoverRepositorySkills(paths, (path) =>
    readRepositoryFile(target, path, ref),
  );
  return skills.map(summarizeRepositorySkill);
}

/** Re-read selected entrypoints instead of trusting repository instructions from the client. */
export async function loadProjectRepositorySkills(
  projectId: string,
  requestedPaths: readonly string[],
  requestedRef?: string | null,
): Promise<RepositorySkill[] | null> {
  const paths = [...new Set(requestedPaths)];
  if (
    paths.length === 0 ||
    paths.length > MAX_SELECTED_SKILLS ||
    paths.some((path) => !isRepositorySkillPath(path))
  ) {
    return null;
  }
  const target = await resolveLinkedRepository(projectId);
  if (!target) return null;
  const ref = requestedRef?.trim() || target.defaultBranch;
  if (!isValidGitBranchName(ref)) return null;
  const skills = await Promise.all(
    paths.map(async (path) => {
      const raw = await readRepositoryFile(target, path, ref);
      return raw === null ? null : parseRepositorySkill(path, raw);
    }),
  );
  if (skills.some((skill) => skill === null)) return null;
  const loaded = skills as RepositorySkill[];
  const totalBytes = loaded.reduce(
    (sum, skill) => sum + new TextEncoder().encode(skill.content).byteLength,
    0,
  );
  return totalBytes <= MAX_SELECTED_SKILL_BYTES ? loaded : null;
}
