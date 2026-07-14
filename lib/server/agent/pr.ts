import "server-only";

import { GITHUB_API_BASE, githubHeaders } from "@/lib/server/git/github-rest";

/**
 * Opérations Pull Request GitHub pour l'agent de code (MIN-46) : ouvrir la PR
 * d'un run, la lire (metadata + fichiers/patches pour la review in-app), la
 * merger ou la fermer. Toutes scopées par un token d'installation frais
 * (getInstallationToken via resolveRepoCloneTarget). `repoFullName` = `owner/name`.
 */

export interface PullRequestRef {
  number: number;
  url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  title?: string;
  body?: string | null;
  head?: string;
  base?: string;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

/** Erreur d'API GitHub avec le status HTTP (permet de distinguer 422 « no commits »). */
export class GithubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
  }
}

function splitRepo(repoFullName: string): { owner: string; repo: string } {
  const [owner, repo] = repoFullName.split("/");
  return { owner, repo };
}

async function ghJson<T>(
  url: string,
  token: string,
  init?: RequestInit & { accept?: string },
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...githubHeaders(token, init?.accept), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      (data as { message?: string } | null)?.message ?? `GitHub API error (${res.status})`;
    throw new GithubApiError(message, res.status);
  }
  return data as T;
}

interface RawPull {
  number: number;
  html_url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  title?: string;
  body?: string | null;
  head?: { ref?: string };
  base?: { ref?: string };
}

function toRef(pr: RawPull): PullRequestRef {
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.state,
    draft: pr.draft,
    merged: pr.merged ?? !!pr.merged_at,
    title: pr.title,
    body: pr.body ?? null,
    head: pr.head?.ref,
    base: pr.base?.ref,
  };
}

/** PR ouverte pour `head` (branche du run), ou null. */
export async function findOpenPullRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
}): Promise<PullRequestRef | null> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pulls = await ghJson<RawPull[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  return pulls.length > 0 ? toRef(pulls[0]) : null;
}

/**
 * Ouvre la PR du run, ou renvoie celle déjà ouverte pour cette branche (reprise).
 * Lève GithubApiError(422) « No commits between… » si la branche n'a aucun diff.
 */
export async function ensurePullRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<PullRequestRef> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  try {
    const created = await ghJson<RawPull>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`,
      opts.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: opts.title,
          head: opts.head,
          base: opts.base,
          body: opts.body,
        }),
      },
    );
    return toRef(created);
  } catch (err) {
    // 422 « A pull request already exists » → on retrouve et on renvoie l'existante.
    if (err instanceof GithubApiError && err.status === 422) {
      const existing = await findOpenPullRequest({
        token: opts.token,
        repoFullName: opts.repoFullName,
        head: opts.head,
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function getPullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pr = await ghJson<RawPull>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}`,
    opts.token,
  );
  return toRef(pr);
}

/** Fichiers de la PR avec leurs patches (unified diff) — alimente la review in-app. */
export async function listPullRequestFiles(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestFile[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const files = await ghJson<
    Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>
  >(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/files?per_page=100`,
    opts.token,
  );
  return files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));
}

export async function mergePullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
  method?: "merge" | "squash" | "rebase";
}): Promise<void> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  await ghJson<unknown>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/merge`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: opts.method ?? "squash" }),
    },
  );
}

export async function closePullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  await ghJson<unknown>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}`,
    opts.token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
    },
  );
}
