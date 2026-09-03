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
  resolveRepoCloneTarget,
  type RepoCloneTarget,
} from "@/lib/server/agent/repo-access";
import { getFileAtRef as getGithubFileAtRef } from "@/lib/server/agent/pr";
import { getFileAtRef as getGitlabFileAtRef } from "@/lib/server/agent/mr";
import {
  GITHUB_API_BASE,
  githubHeaders,
} from "@/lib/server/git/github-rest";
import {
  GITLAB_API_BASE,
  gitlabHeaders,
  gitlabNextPage,
} from "@/lib/server/git/gitlab-rest";

const MAX_DISCOVERY_DIRECTORIES = 300;
const MAX_GITLAB_PAGES_PER_ROOT = 10;

function splitGithubRepo(repoFullName: string): { owner: string; repo: string } {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error("Invalid GitHub repository name");
  return { owner, repo };
}

function encodeGithubPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubSkillPaths(
  target: RepoCloneTarget,
  fetcher: typeof fetch,
): Promise<string[]> {
  const { owner, repo } = splitGithubRepo(target.repoFullName);
  const queue: string[] = [...REPOSITORY_SKILL_ROOTS];
  const paths: string[] = [];
  let visited = 0;

  while (queue.length > 0 && visited < MAX_DISCOVERY_DIRECTORIES) {
    const directory = queue.shift()!;
    visited += 1;
    const url =
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/contents/${encodeGithubPath(directory)}?ref=${encodeURIComponent(target.defaultBranch)}`;
    const response = await fetcher(url, {
      headers: githubHeaders(target.token),
      cache: "no-store",
    });
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`GitHub skill discovery failed (${response.status})`);
    }
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) continue;
    const entries = data.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as { path?: unknown; type?: unknown; name?: unknown };
      return typeof item.path === "string" && typeof item.type === "string"
        ? [{ path: item.path, type: item.type, name: item.name }]
        : [];
    });
    const entrypoint = entries.find(
      (entry) => entry.type === "file" && entry.name === "SKILL.md",
    );
    if (entrypoint) {
      paths.push(entrypoint.path);
      continue;
    }
    for (const entry of entries) {
      if (entry.type === "dir") queue.push(entry.path);
    }
  }

  return paths;
}

async function gitlabSkillPaths(
  target: RepoCloneTarget,
  fetcher: typeof fetch,
): Promise<string[]> {
  const paths: string[] = [];
  for (const root of REPOSITORY_SKILL_ROOTS) {
    let page = 1;
    for (let count = 0; count < MAX_GITLAB_PAGES_PER_ROOT; count += 1) {
      const query = new URLSearchParams({
        path: root,
        ref: target.defaultBranch,
        recursive: "true",
        per_page: "100",
        page: String(page),
      });
      const response = await fetcher(
        `${GITLAB_API_BASE}/projects/${encodeURIComponent(target.repoFullName)}/repository/tree?${query}`,
        { headers: gitlabHeaders(target.token), cache: "no-store" },
      );
      if (response.status === 404) break;
      if (!response.ok) {
        throw new Error(`GitLab skill discovery failed (${response.status})`);
      }
      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) break;
      for (const entry of data) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as { path?: unknown; type?: unknown; name?: unknown };
        if (
          item.type === "blob" &&
          item.name === "SKILL.md" &&
          typeof item.path === "string" &&
          isRepositorySkillPath(item.path)
        ) {
          paths.push(item.path);
        }
      }
      const next = gitlabNextPage(response);
      if (!next) break;
      page = next;
    }
  }
  return paths;
}

async function repositorySkillPaths(
  target: RepoCloneTarget,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  return target.provider === "github"
    ? githubSkillPaths(target, fetcher)
    : gitlabSkillPaths(target, fetcher);
}

async function readRepositoryFile(
  target: RepoCloneTarget,
  path: string,
): Promise<string | null> {
  const options = {
    token: target.token,
    repoFullName: target.repoFullName,
    path,
    ref: target.defaultBranch,
  };
  return target.provider === "github"
    ? getGithubFileAtRef(options)
    : getGitlabFileAtRef(options);
}

async function projectRepositoryTarget(
  projectId: string,
): Promise<RepoCloneTarget | null> {
  // This code runs in trusted server infrastructure. Full forge credentials stay
  // here and avoid creating a durable GitLab project token for every picker open.
  return resolveRepoCloneTarget(projectId, "full");
}

export async function listProjectRepositorySkills(
  projectId: string,
): Promise<RepositorySkillSummary[]> {
  const target = await projectRepositoryTarget(projectId);
  if (!target) return [];
  const paths = await repositorySkillPaths(target);
  const skills = await discoverRepositorySkills(paths, (path) =>
    readRepositoryFile(target, path),
  );
  return skills.map(summarizeRepositorySkill);
}

/** Re-read selected entrypoints instead of trusting repository instructions from the client. */
export async function loadProjectRepositorySkills(
  projectId: string,
  requestedPaths: readonly string[],
): Promise<RepositorySkill[] | null> {
  const paths = [...new Set(requestedPaths)];
  if (
    paths.length === 0 ||
    paths.length > MAX_SELECTED_SKILLS ||
    paths.some((path) => !isRepositorySkillPath(path))
  ) {
    return null;
  }
  const target = await projectRepositoryTarget(projectId);
  if (!target) return null;
  const skills = await Promise.all(
    paths.map(async (path) => {
      const raw = await readRepositoryFile(target, path);
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
