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
  /** SHA de la tête — ancre immuable pour calculer le merge base (getMergeBaseSha). */
  headSha?: string;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  /** Chemin AVANT la PR si le fichier a été renommé — c'est lui qui adresse la version de base. */
  previous_filename?: string;
}

/** Commentaire de conversation d'une PR (endpoint issues/{n}/comments de GitHub). */
export interface PullRequestComment {
  id: number;
  body: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
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

/**
 * Variante texte de `ghJson` : avec `Accept: application/vnd.github.raw` GitHub
 * sert le contenu du fichier tel quel, pas du JSON (et jusqu'à 100 Mo, là où la
 * réponse JSON plafonne à 1 Mo). 404 → null (fichier absent à ce ref).
 */
async function ghRawText(url: string, token: string): Promise<string | null> {
  const res = await fetch(url, { headers: githubHeaders(token, "application/vnd.github.raw") });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    let message = `GitHub API error (${res.status})`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // Corps non-JSON (raw) : on garde le message par défaut.
    }
    throw new GithubApiError(message, res.status);
  }
  return text;
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
  head?: { ref?: string; sha?: string };
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
    headSha: pr.head?.sha,
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
    Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
      previous_filename?: string;
    }>
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
    previous_filename: f.previous_filename,
  }));
}

/**
 * SHA du **merge base** de la PR — le point de référence des patches GitHub.
 *
 * GitHub diffe une PR à trois points (`base...head`) : les numéros de ligne
 * « anciens » des patches comptent depuis l'ancêtre commun, PAS depuis le tip de
 * la branche de base. Utiliser `pr.base.sha` est un piège : si la base a avancé
 * depuis, les lignes décalent et l'expansion injecte silencieusement le mauvais
 * code. On passe le nom de branche vivant (et non `base.sha`, figé à l'ouverture
 * de la PR) : si `head` a fusionné la base entre-temps, l'ancêtre commun a bougé
 * et seule la branche vivante donne celui que GitHub a réellement utilisé.
 */
export async function getMergeBaseSha(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<string> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  // Refs laissés tels quels : les noms de branche à slash (`numo/min-42`) sont
  // valides ici, et les %2F casseraient la route compare de GitHub.
  const comparison = await ghJson<{ merge_base_commit?: { sha?: string } }>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${opts.base}...${opts.head}?per_page=1`,
    opts.token,
  );
  const sha = comparison.merge_base_commit?.sha;
  if (!sha) throw new GithubApiError("No merge base for this pull request", 502);
  return sha;
}

/** Contenu brut d'un fichier à un ref donné, ou null s'il n'y existe pas. */
export async function getFileAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<string | null> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  // Chemin encodé segment par segment : encodeURIComponent avalerait les `/`.
  const path = opts.path.split("/").map(encodeURIComponent).join("/");
  return ghRawText(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(opts.ref)}`,
    opts.token,
  );
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

/**
 * Rouvre une PR refusée (MIN-68) : une run froide qui hérite d'une PR `closed`
 * retravaille SA branche — on remet la PR en revue plutôt que d'en ouvrir une
 * seconde sur la même branche. Renvoie la PR rouverte. Échoue (422) si la branche
 * tête a été supprimée entre-temps : l'appelant retombe alors sur une PR neuve.
 */
export async function reopenPullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pr = await ghJson<RawPull>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}`,
    opts.token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "open" }),
    },
  );
  return toRef(pr);
}

interface RawComment {
  id: number;
  body?: string;
  user?: { login?: string; avatar_url?: string } | null;
  created_at: string;
  html_url: string;
}

function toComment(c: RawComment): PullRequestComment {
  return {
    id: c.id,
    body: c.body ?? "",
    user: c.user ? { login: c.user.login ?? "", avatar_url: c.user.avatar_url ?? null } : null,
    created_at: c.created_at,
    html_url: c.html_url,
  };
}

/**
 * Commentaires de conversation de la PR (fil de discussion). Sur GitHub une PR
 * EST une issue, donc ses commentaires vivent sous `issues/{n}/comments`.
 */
export async function listPullRequestComments(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestComment[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const comments = await ghJson<RawComment[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${opts.number}/comments?per_page=100`,
    opts.token,
  );
  return comments.map(toComment);
}

/** Ajoute un commentaire à la conversation de la PR (auteur = la GitHub App minddy). */
export async function createPullRequestComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
}): Promise<PullRequestComment> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const created = await ghJson<RawComment>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${opts.number}/comments`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toComment(created);
}
