import "server-only";

import {
  GITLAB_API_BASE,
  GITLAB_HOST,
  gitlabHeaders,
  gitlabNextPage,
} from "@/lib/server/git/gitlab-rest";
import {
  GITLAB_AWARD_NAMES,
  PR_BODY_COMMENT_ID,
  reactionFromGitlabName,
  type ReviewCommentReaction,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import { fromGitlabSystemNotes, type PrTimelineEvent } from "@/lib/pr-timeline";
import { resolveDiffPosition } from "./mr-position";
import { summarizeGitlabPipelines, type ChecksSummary, type RawPipeline } from "./checks-core";
import type {
  PullRequestRef,
  PullRequestFile,
  PullRequestComment,
  PullRequestCommit,
  CommitDiff,
  CommitExtras,
  PullRequestReviewComment,
  PullRequestReviewMessage,
  PullRequestReviewSummary,
  RepoMember,
  ReviewSubmission,
  ReviewThreadState,
  ReviewVerdict,
} from "./pr";

/**
 * Opérations Merge Request GitLab pour l'agent de code (MIN-69) — le miroir de
 * `pr.ts` contre l'API GitLab v4, derrière la MÊME surface (types neutres de
 * `pr.ts`, signatures identiques, exposées via `forge.ts`). Correspondances :
 *   • `number` = l'`iid` de la MR (numéro par projet, comme un numéro de PR) ;
 *   • le dépôt est adressé par son chemin complet URL-encodé (`group/projet`) ;
 *   • état : `opened`/`locked` → `open`, `merged` → `closed` + `merged: true`
 *     (même convention que GitHub : `state` open/closed + booléen `merged`) ;
 *   • conversation = les notes non-système ; review ancrée = les discussions
 *     portant une `position` (DiffNote). GitLab ne fournit pas de `diff_hunk`
 *     → chaîne vide (tous les rendus ont déjà un repli sans hunk).
 * Token : access token OAuth du compte connecté (minté par resolveRepoCloneTarget).
 */

/** Erreur d'API GitLab avec le status HTTP (pendant de `GithubApiError`). */
export class GitlabApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitlabApiError";
    this.status = status;
  }
}

/** Chemin projet `group/sub/projet` → id d'URL GitLab (tout encodé, `/` compris). */
function projectPath(repoFullName: string): string {
  return encodeURIComponent(repoFullName);
}

/** Message d'erreur GitLab : `message` peut être une chaîne, un objet ou un tableau. */
function errorMessage(data: unknown, status: number): string {
  const raw = (data as { message?: unknown; error?: unknown } | null) ?? {};
  const m = raw.message ?? raw.error;
  if (typeof m === "string") return m;
  if (m != null) return JSON.stringify(m);
  return `GitLab API error (${status})`;
}

async function glJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...gitlabHeaders(token), ...init?.headers },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Corps non-JSON (rare) : data reste null, le message par défaut s'applique.
  }
  if (!res.ok) throw new GitlabApiError(errorMessage(data, res.status), res.status);
  return data as T;
}

/**
 * Variante paginée (offset via X-Next-Page), bornée par `maxPages`. `stopWhen`
 * (optionnel) court-circuite les pages restantes dès que l'accumulé suffit —
 * ex. la recherche d'UNE discussion n'a pas à drainer tout le fil.
 */
async function glPaged<T>(
  baseUrl: string,
  token: string,
  maxPages: number,
  stopWhen?: (all: T[]) => boolean,
): Promise<T[]> {
  return (await glPagedBounded<T>(baseUrl, token, maxPages, stopWhen)).items;
}

/**
 * La même pagination, mais qui DIT si elle s'est arrêtée au plafond (MIN-168).
 * Une liste coupée sans le dire ne se distingue pas d'une liste complète, et
 * l'appelant conclut alors sur ce qu'il a vu comme si c'était tout.
 * `stopWhen` ne compte pas comme une troncature : là, c'est l'appelant qui a
 * décidé qu'il en avait assez.
 */
async function glPagedBounded<T>(
  baseUrl: string,
  token: string,
  maxPages: number,
  stopWhen?: (all: T[]) => boolean,
): Promise<{ items: T[]; truncated: boolean }> {
  const all: T[] = [];
  let page: number | null = 1;
  let fetched = 0;
  while (page && fetched < maxPages) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const res = await fetch(`${baseUrl}${sep}per_page=100&page=${page}`, {
      headers: gitlabHeaders(token),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // idem glJson
    }
    if (!res.ok) throw new GitlabApiError(errorMessage(data, res.status), res.status);
    all.push(...((data as T[]) ?? []));
    if (stopWhen?.(all)) return { items: all, truncated: false };
    page = gitlabNextPage(res);
    fetched++;
  }
  // Il restait une page à lire quand le plafond a coupé.
  return { items: all, truncated: page != null && fetched >= maxPages };
}

interface RawMr {
  iid: number;
  web_url: string;
  state: string; // opened | closed | locked | merged
  merged_at?: string | null;
  draft?: boolean;
  work_in_progress?: boolean;
  title?: string;
  description?: string | null;
  source_branch?: string;
  target_branch?: string;
  sha?: string | null;
  diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string } | null;
  author?: { username?: string; avatar_url?: string | null } | null;
  created_at?: string;
  updated_at?: string;
  /** État de fusionnabilité détaillé (GitLab 15.6+). */
  detailed_merge_status?: string | null;
  /** L'API historique : can_be_merged | cannot_be_merged | unchecked | checking. */
  merge_status?: string | null;
}

/**
 * Fusionnabilité GitLab → le vocabulaire GitHub que porte `PullRequestRef`, pour
 * que l'UI n'ait qu'une langue à lire. `undefined` = inconnu (GitLab calcule lui
 * aussi en asynchrone : `unchecked` / `checking` à la première lecture).
 */
function toMergeable(mr: RawMr): { mergeable?: boolean | null; mergeableState?: string | null } {
  const detailed = mr.detailed_merge_status;
  if (!detailed) {
    // Repli sur l'API historique quand l'instance est antérieure à 15.6.
    if (mr.merge_status === "can_be_merged") return { mergeable: true, mergeableState: "clean" };
    if (mr.merge_status === "cannot_be_merged") {
      return { mergeable: false, mergeableState: "dirty" };
    }
    return { mergeable: null, mergeableState: "unknown" };
  }
  if (detailed === "mergeable") return { mergeable: true, mergeableState: "clean" };
  switch (detailed) {
    case "broken_status":
    case "conflict":
      return { mergeable: false, mergeableState: "dirty" };
    case "checking":
    case "unchecked":
    case "preparing":
      return { mergeable: null, mergeableState: "unknown" };
    default:
      // `not_approved`, `blocked_status`, `ci_must_pass`, `discussions_not_resolved`,
      // `need_rebase`, `draft_status`, `requested_changes`… : autant de refus du
      // dépôt lui-même, que l'UI dit tous de la même façon (« merge bloqué »).
      return { mergeable: false, mergeableState: "blocked" };
  }
}

function toRef(mr: RawMr): PullRequestRef {
  const merged = mr.state === "merged" || !!mr.merged_at;
  return {
    number: mr.iid,
    url: mr.web_url,
    // Convention neutre de `pr.ts` : `state` open/closed + booléen `merged`.
    // `locked` est un état transitoire (merge en cours) → open.
    state: mr.state === "opened" || mr.state === "locked" ? "open" : "closed",
    draft: mr.draft ?? mr.work_in_progress,
    merged,
    title: mr.title,
    body: mr.description ?? null,
    head: mr.source_branch,
    base: mr.target_branch,
    headSha: mr.sha ?? mr.diff_refs?.head_sha,
    user: mr.author
      ? { login: mr.author.username ?? "", avatar_url: mr.author.avatar_url ?? null }
      : null,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    mergedAt: mr.merged_at ?? null,
    // `nodeId` reste vide : c'est une clé GraphQL GitHub, sans équivalent utile
    // ici (la bascule brouillon GitLab se fait par le titre — cf. plus bas).
    ...toMergeable(mr),
  };
}

/** MR ouverte pour `head` (branche du run), ou null. */
export async function findOpenMergeRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
}): Promise<PullRequestRef | null> {
  const mrs = await glJson<RawMr[]>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests` +
      `?state=opened&source_branch=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  return mrs.length > 0 ? toRef(mrs[0]) : null;
}

/**
 * Ouvre la MR du run, ou renvoie celle déjà ouverte pour cette branche (reprise).
 * GitLab répond 409 « Another open merge request already exists » dans ce cas.
 *
 * Parité GitHub sur la branche VIDE : GitLab accepte les MR sans aucun commit —
 * on refuse nous-mêmes en 422 (le même status que le « No commits between… » de
 * GitHub), sinon l'agent ouvrirait une MR vide et pousserait le ticket en revue.
 */
export async function ensureMergeRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<PullRequestRef> {
  const compare = await glJson<{ commits?: unknown[] }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/compare` +
      `?from=${encodeURIComponent(opts.base)}&to=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  if ((compare.commits ?? []).length === 0) {
    throw new GitlabApiError("No commits between base and head branches", 422);
  }
  try {
    const created = await glJson<RawMr>(
      `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests`,
      opts.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_branch: opts.head,
          target_branch: opts.base,
          title: opts.title,
          description: opts.body,
        }),
      },
    );
    return toRef(created);
  } catch (err) {
    if (err instanceof GitlabApiError && err.status === 409) {
      const existing = await findOpenMergeRequest({
        token: opts.token,
        repoFullName: opts.repoFullName,
        head: opts.head,
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function getMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const mr = await glJson<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
  );
  return toRef(mr);
}

interface RawDiff {
  old_path?: string;
  new_path?: string;
  diff?: string;
  new_file?: boolean;
  renamed_file?: boolean;
  deleted_file?: boolean;
}

/** Compte +/- d'un unified diff (GitLab ne fournit pas les stats par fichier).
    Gardé DANS les hunks, mêmes règles que `resolveDiffPosition` : une ligne de
    contenu `++…` est bien une addition, un en-tête hors hunk n'est rien. */
function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line)) {
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}

const DIFFS_MAX_PAGES = 10;

/** Diffs bruts de la MR (endpoint /diffs, paginé). Partagé fichiers + positions.
    `stopWhen` court-circuite la pagination quand on ne cherche qu'un fichier. */
async function listRawDiffs(
  opts: {
    token: string;
    repoFullName: string;
    number: number;
  },
  stopWhen?: (all: RawDiff[]) => boolean,
): Promise<RawDiff[]> {
  return glPaged<RawDiff>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/diffs`,
    opts.token,
    DIFFS_MAX_PAGES,
    stopWhen,
  );
}

/** Diff brut GitLab → fichier neutre (statut, compteurs +/−, patch unified). */
function toPullRequestFile(d: RawDiff): PullRequestFile {
  const { additions, deletions } = countDiffLines(d.diff ?? "");
  return {
    filename: d.new_path ?? d.old_path ?? "",
    status: d.new_file
      ? "added"
      : d.deleted_file
        ? "removed"
        : d.renamed_file
          ? "renamed"
          : "modified",
    additions,
    deletions,
    // Diff vide (binaire / trop gros) → undefined, comme le `patch` GitHub.
    patch: d.diff || undefined,
    previous_filename: d.renamed_file ? d.old_path : undefined,
  };
}

/** Fichiers de la MR au format neutre (patches unified diff) — review in-app. */
export async function listMergeRequestChanges(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ files: PullRequestFile[]; truncated: boolean }> {
  const { items, truncated } = await glPagedBounded<RawDiff>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/diffs`,
    opts.token,
    DIFFS_MAX_PAGES,
  );
  return { files: items.map(toPullRequestFile), truncated };
}

interface RawCommit {
  id: string;
  message?: string;
  title?: string;
  author_name?: string | null;
  author_email?: string | null;
  authored_date?: string | null;
  created_at?: string | null;
  web_url?: string | null;
  parent_ids?: string[] | null;
  /** Servi par le détail d'UN commit, jamais par la liste d'une MR. */
  stats?: { additions?: number; deletions?: number } | null;
}

/** Même plafond que `pr.ts` : 3 pages de 100 commits, `truncated` au-delà. */
const COMMITS_MAX_PAGES = 3;

/**
 * Les commits de la MR, du plus ANCIEN au plus récent — l'ordre de `pr.ts`, et
 * donc celui que l'onglet Commits affiche des deux côtés. GitLab sert cette
 * liste à l'envers (tête de branche d'abord) : on la retrie par date, la seule
 * clé que les deux forges donnent.
 *
 * Ni compte de forge ni signature ici : l'API des commits d'une MR ne sert que
 * le nom écrit dans le commit, et la vérification demanderait un appel PAR
 * commit (`/repository/commits/{sha}/signature`). `author: null` +
 * `verified: null` disent « on ne sait pas », que le rendu traite déjà.
 */
export async function listMergeRequestCommits(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ commits: PullRequestCommit[]; truncated: boolean }> {
  const raw = await glPaged<RawCommit>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/commits`,
    opts.token,
    COMMITS_MAX_PAGES,
  );
  const commits = raw
    // La forge sert la tête de branche d'abord : l'inversion suffit dans le cas
    // courant, et le tri qui suit ne fait que remettre d'aplomb les rebases (une
    // date d'auteur peut y précéder celle du commit d'avant).
    .reverse()
    .map((c) => {
      const authoredAt = c.authored_date ?? c.created_at ?? null;
      return {
        sha: c.id,
        // `message` porte le titre ET le corps ; `title` seul est le repli des
        // instances qui ne servent que lui sur cet endpoint.
        message: c.message ?? c.title ?? "",
        author: null,
        authorName: c.author_name ?? null,
        authorEmail: c.author_email ?? null,
        authoredAt,
        // Certaines instances ne servent pas `web_url` ici : l'URL de commit est
        // stable et se reconstruit, comme celle du compare.
        url: c.web_url ?? `${GITLAB_HOST}/${opts.repoFullName}/-/commit/${c.id}`,
        verified: null,
        // Premier parent : la ligne principale d'un commit de fusion.
        parentSha: c.parent_ids?.[0] ?? null,
        // Comme chez GitHub, la liste ne porte ni stats ni auteurs (`…CommitExtras`)
        // — sauf que GitLab ne saura jamais résoudre les seconds en comptes :
        // l'appelant lira les trailers `Co-authored-by` du message.
        authors: [],
        additions: null,
        deletions: null,
      } satisfies PullRequestCommit;
    })
    // Tri STABLE, et une date illisible compare à 0 (règle de `Array.sort` sur
    // NaN) : deux commits d'un même push partagent souvent la seconde, et
    // l'ordre de la forge est alors le seul départage qu'on ait.
    .sort((a, b) => Date.parse(a.authoredAt ?? "") - Date.parse(b.authoredAt ?? ""));
  return { commits, truncated: raw.length >= COMMITS_MAX_PAGES * 100 };
}

/**
 * Au-delà, on ne va pas chercher les stats : GitLab n'a pas l'équivalent du
 * GraphQL de GitHub (aucun endpoint ne sert le poids de PLUSIEURS commits d'un
 * coup), donc chaque commit coûte un aller-retour. Cinquante suffisent aux MR
 * qu'on lit vraiment commit par commit ; au-delà, l'indicateur +/− disparaît et
 * le diff d'un commit reste ouvrable — il porte ses propres chiffres.
 */
const MAX_STATS_COMMITS = 50;
/** Requêtes de stats en vol : assez pour que 50 commits tiennent en ~10 tours. */
const STATS_CONCURRENCY = 5;

/**
 * Le poids de chaque commit de la MR, indexé par SHA — le pendant du GraphQL de
 * `pr.ts`, en beaucoup moins élégant : GitLab ne sert `stats` que sur le DÉTAIL
 * d'un commit, donc un appel par commit, en parallèle borné.
 *
 * Best-effort commit par commit : un SHA illisible (commit élagué d'un
 * force-push) n'ôte pas ses chiffres aux autres.
 */
export async function listMergeRequestCommitExtras(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<Map<string, CommitExtras>> {
  const { commits } = await listMergeRequestCommits(opts);
  const shas = commits.slice(0, MAX_STATS_COMMITS).map((c) => c.sha);
  const stats = new Map<string, CommitExtras>();

  for (let i = 0; i < shas.length; i += STATS_CONCURRENCY) {
    const slice = shas.slice(i, i + STATS_CONCURRENCY);
    await Promise.all(
      slice.map(async (sha) => {
        try {
          const commit = await glJson<RawCommit>(
            `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/commits/${sha}`,
            opts.token,
          );
          stats.set(sha, {
            additions: commit.stats?.additions ?? 0,
            deletions: commit.stats?.deletions ?? 0,
            // GitLab ne résout AUCUN compte sur ses commits, co-auteurs compris :
            // l'appelant lira les trailers du message, seule source qui reste.
            authors: [],
          });
        } catch (err) {
          console.error("[mr] commit stats unreadable:", (err as Error).message);
        }
      }),
    );
  }
  return stats;
}

/**
 * Le diff d'UN commit contre son parent, au format neutre. Deux appels : les
 * diffs d'un côté (paginés), le commit de l'autre — c'est lui qui porte les
 * stats, l'URL web et le parent, qu'aucun des deux endpoints ne sert ensemble.
 */
export async function getCommitDiff(opts: {
  token: string;
  repoFullName: string;
  sha: string;
}): Promise<CommitDiff> {
  const base = `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/commits/${opts.sha}`;
  const [diffs, commit] = await Promise.all([
    glPaged<RawDiff>(`${base}/diff`, opts.token, DIFFS_MAX_PAGES),
    glJson<RawCommit>(base, opts.token),
  ]);
  const files = diffs.map(toPullRequestFile);
  return {
    files,
    // `stats` manquant (instance ancienne) : les patches les portent déjà, on
    // recompte plutôt que d'annoncer zéro.
    additions:
      commit.stats?.additions ?? files.reduce((n, f) => n + f.additions, 0),
    deletions:
      commit.stats?.deletions ?? files.reduce((n, f) => n + f.deletions, 0),
    url: commit.web_url ?? `${GITLAB_HOST}/${opts.repoFullName}/-/commit/${opts.sha}`,
    parentSha: commit.parent_ids?.[0] ?? null,
  };
}

/**
 * Diff CUMULÉ d'une branche de travail contre sa base — le miroir du compare
 * GitHub (`pr.ts`), pour la vue diff d'une session SANS MR. `from...to` diffe
 * depuis le merge base (défaut `straight=false` de l'API), comme une MR.
 * L'URL web est construite à la main : l'API compare ne la renvoie pas.
 * Lève GitlabApiError(404) si la branche n'a pas (encore) été poussée.
 */
export async function compareBranches(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<{ files: PullRequestFile[]; url: string | null }> {
  const compare = await glJson<{ diffs?: RawDiff[] }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/compare` +
      `?from=${encodeURIComponent(opts.base)}&to=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  return {
    files: (compare.diffs ?? []).map(toPullRequestFile),
    url:
      `${GITLAB_HOST}/${opts.repoFullName}/-/compare/` +
      `${encodeURIComponent(opts.base)}...${encodeURIComponent(opts.head)}`,
  };
}

/**
 * Merge base de deux BRANCHES — le pendant sans MR de `getMergeBaseSha` : la base
 * du dépliage de contexte de la vue diff d'une session qui n'a pas encore de MR.
 * GitLab l'expose directement (endpoint repository/merge_base).
 */
export async function getBranchesMergeBaseSha(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<string> {
  const res = await glJson<{ id?: string }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/merge_base` +
      `?refs[]=${encodeURIComponent(opts.base)}&refs[]=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  if (!res.id) throw new GitlabApiError("No merge base for these branches", 502);
  return res.id;
}

/** Même plafond que `pr.ts` : 5 pages de 100 suffisent à un picker de branche. */
const MAX_BRANCH_PAGES = 5;

/**
 * Noms des branches du dépôt (picker de branche de base du lancement d'agent) —
 * miroir de `pr.ts`. Le tri (défaut d'abord) est fait par l'appelant.
 */
export async function listBranches(opts: {
  token: string;
  repoFullName: string;
}): Promise<string[]> {
  const branches = await glPaged<{ name: string }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/branches`,
    opts.token,
    MAX_BRANCH_PAGES,
  );
  return branches.map((b) => b.name);
}

/** Même plafond que `pr.ts` (MAX_MEMBER_PAGES). */
const MAX_MEMBER_PAGES = 2;

/**
 * Les comptes GitLab qu'on peut mentionner sur ce projet (MIN-162).
 *
 * `members/all` et non `members` : GitLab distingue les membres DIRECTS du
 * projet de ceux qui en héritent par le groupe parent — et sur une instance
 * organisée en groupes, la seconde liste est l'essentiel des gens. C'est le
 * pendant exact de l'`affiliation=all` de GitHub.
 *
 * GitLab sert un `name` en plus du `username` : on le garde, la suggestion se
 * cherche alors aussi bien par nom que par identifiant — mais c'est toujours
 * `@username` qui s'insère, seul lui notifie.
 */
export async function listRepoMembers(opts: {
  token: string;
  repoFullName: string;
}): Promise<RepoMember[]> {
  const rows = await glPaged<{ username?: string; name?: string; avatar_url?: string | null }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/members/all`,
    opts.token,
    MAX_MEMBER_PAGES,
  );
  return rows
    .filter((r): r is { username: string; name?: string; avatar_url?: string | null } =>
      !!r.username,
    )
    .map((r) => ({
      login: r.username,
      avatar_url: r.avatar_url ?? null,
      name: r.name ?? null,
    }));
}

/** Même plafond que `pr.ts` (MAX_PR_PAGES) pour le ménage des branches. */
const MAX_MR_PAGES = 5;

/**
 * TOUTES les MR du dépôt, tous états confondus (MIN-102) — miroir de `pr.ts`.
 * `state=all` est ici doublement nécessaire : GitLab compte `merged` et `closed`
 * comme deux états DISTINCTS (`state=closed` ne ramène PAS les fusionnées), et
 * on veut de toute façon voir les MR ouvertes pour protéger leurs branches.
 */
export async function listPullRequests(opts: {
  token: string;
  repoFullName: string;
}): Promise<{ pulls: PullRequestRef[]; truncated: boolean }> {
  const raw = await glPaged<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests` +
      `?state=all&order_by=updated_at&sort=desc`,
    opts.token,
    MAX_MR_PAGES,
  );
  return {
    pulls: raw.map(toRef),
    // glPaged s'arrête sur `maxPages` sans le dire : une moisson pleine à ras
    // bord est le seul indice qu'il restait des pages.
    truncated: raw.length >= MAX_MR_PAGES * 100,
  };
}

/**
 * Supprime une branche distante (MIN-102) — miroir de `deleteBranch` de `pr.ts`.
 * Contrairement à GitHub, le nom de branche est ENTIÈREMENT URL-encodé ici
 * (l'API GitLab attend un segment, pas un chemin). 404 → `"already-gone"`.
 */
export async function deleteBranch(opts: {
  token: string;
  repoFullName: string;
  branch: string;
}): Promise<"deleted" | "already-gone"> {
  try {
    await glJson<unknown>(
      `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/branches/` +
        encodeURIComponent(opts.branch),
      opts.token,
      { method: "DELETE" },
    );
    return "deleted";
  } catch (err) {
    if (err instanceof GitlabApiError && err.status === 404) return "already-gone";
    throw err;
  }
}

/**
 * SHA de la BASE du diff servi par GitLab pour cette MR : `diff_refs.base_sha`.
 *
 * Le miroir du piège documenté dans `pr.ts` (getMergeBaseSha), inversé : GitHub
 * recalcule le diff à la volée (le merge base VIVANT est le bon), GitLab fige le
 * diff à `diff_refs` — rafraîchi seulement quand la branche source pousse, PAS
 * quand la cible avance. Recalculer un merge base vivant décalerait les lignes
 * dépliées après un rebase/force-push de la cible (ou après merge). L'ancre
 * persistée survit aussi à la suppression de la branche source.
 */
export async function getMergeBaseSha(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<string> {
  const mr = await glJson<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
  );
  const sha = mr.diff_refs?.base_sha;
  if (!sha) throw new GitlabApiError("Merge request has no diff refs", 502);
  return sha;
}

/** Contenu brut d'un fichier à un ref donné, ou null s'il n'y existe pas. */
export async function getFileAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<string | null> {
  const url =
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/files/` +
    `${encodeURIComponent(opts.path)}/raw?ref=${encodeURIComponent(opts.ref)}`;
  const res = await fetch(url, { headers: gitlabHeaders(opts.token, "text/plain") });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Corps raw : message par défaut.
    }
    throw new GitlabApiError(errorMessage(data, res.status), res.status);
  }
  return text;
}

/**
 * Mêmes octets, non décodés — le pendant GitLab de `getFileBytesAtRef` de
 * `pr.ts` : `res.text()` interprète le corps en UTF-8 et corrompt tout binaire.
 * Sert la vue côte à côte des images du diff (MIN-66).
 */
export async function getFileBytesAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<ArrayBuffer | null> {
  const url =
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/files/` +
    `${encodeURIComponent(opts.path)}/raw?ref=${encodeURIComponent(opts.ref)}`;
  const res = await fetch(url, { headers: gitlabHeaders(opts.token, "application/octet-stream") });
  if (res.status === 404) return null;
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // Corps raw : message par défaut.
    }
    throw new GitlabApiError(errorMessage(data, res.status), res.status);
  }
  return res.arrayBuffer();
}

/**
 * Merge la MR. La STRATÉGIE (merge commit / fast-forward) est un réglage du
 * projet chez GitLab, pas un paramètre d'appel comme chez GitHub : le seul
 * levier par MR est `squash`. D'où `mergeMethods` réduit à `["merge","squash"]`
 * côté `forge.ts` — « merge » veut dire ici « la stratégie du projet, sans
 * écrasement des commits ».
 */
export async function mergeMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
  method?: "merge" | "squash" | "rebase";
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/merge`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squash: opts.method === "squash" }),
    },
  );
}

/** Préfixes de titre par lesquels GitLab marque une MR brouillon (`WIP:` est
    l'ancienne forme, encore acceptée par les instances anciennes). */
const DRAFT_TITLE_PREFIX = /^\s*(?:\[?draft\]?|\[?wip\]?)\s*:?\s*/i;

/**
 * Bascule une MR brouillon en « prête pour la review ». GitLab n'a pas de champ
 * ni d'action dédiée : le brouillon EST le préfixe `Draft:` du titre — on relit
 * donc le titre et on le renvoie sans son préfixe. Le pendant de la mutation
 * GraphQL de GitHub (`markPullRequestReadyForReview`).
 */
export async function markMergeRequestReadyForReview(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  const path = `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`;
  const mr = await glJson<RawMr>(path, opts.token);
  const title = (mr.title ?? "").replace(DRAFT_TITLE_PREFIX, "").trim();
  if (!title) throw new GitlabApiError("Merge request has no title to restore", 422);
  await glJson<unknown>(path, opts.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

// ── Reviews formelles (MIN-138) ──────────────────────────────────────────────

/** Comme `pr.ts` : le verdict écrit en toutes lettres en tête de la note de repli. */
const FALLBACK_VERDICT_PREFIX: Record<ReviewVerdict, string> = {
  approve: "**Approuvé depuis minddy.**",
  request_changes: "**Changements demandés depuis minddy.**",
  comment: "",
};

/** GitLab refuse-t-il l'approbation (auteur de la MR, ou tier sans l'API) ?
    Contrairement au 422 de GitHub, c'est un 401 — et un 403/404 sur les
    instances où l'endpoint d'approbation n'est pas servi. */
function isApprovalRefusal(err: unknown): boolean {
  return (
    err instanceof GitlabApiError &&
    (err.status === 401 || err.status === 403 || err.status === 404)
  );
}

export async function approveMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/approve`,
    opts.token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

export async function unapproveMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/unapprove`,
    opts.token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

/**
 * Soumet une review sur la MR — le pendant de `submitPullRequestReview`, avec
 * deux écarts que GitLab impose :
 *  • il n'y a pas de review composite : l'approbation et le message sont deux
 *    appels (`/approve` puis une note), et le message ne doit pas se perdre si
 *    l'approbation échoue ;
 *  • il n'y a **pas** de `REQUEST_CHANGES` natif → une note préfixée du verdict,
 *    comme le documente déjà le webhook (`app/api/webhooks/gitlab/route.ts`).
 * Comme sur GitHub, l'auto-approbation est refusée (réglage projet
 * `merge_requests_author_approval`, interdit par défaut) : on retombe alors sur
 * la note seule, et c'est minddy qui garde la trace du verdict.
 */
export async function submitMergeRequestReview(opts: {
  token: string;
  repoFullName: string;
  number: number;
  verdict: ReviewVerdict;
  body: string;
}): Promise<ReviewSubmission> {
  let published: ReviewSubmission["published"] =
    opts.verdict === "request_changes" ? "comment" : "review";

  if (opts.verdict === "approve") {
    try {
      await approveMergeRequest(opts);
    } catch (err) {
      if (!isApprovalRefusal(err)) throw err;
      published = "comment";
    }
  }

  const prefix = published === "comment" ? FALLBACK_VERDICT_PREFIX[opts.verdict] : "";
  const body = `${prefix}\n\n${opts.body}`.trim();
  // Une approbation nue sans message n'a rien à dire de plus : la note ne part
  // que si elle porte quelque chose (le préfixe compte comme un contenu).
  if (body) {
    await createMergeRequestNote({ ...opts, body });
  }
  return { published };
}

interface RawApprovals {
  approved_by?: Array<{ user?: { username?: string } | null }> | null;
}

/**
 * Décompte des approbations de la MR. GitLab tient la liste courante des
 * approbateurs (pas un historique de reviews comme GitHub) : il n'y a donc rien
 * à réduire, et `changesRequested` vaut toujours 0 — l'état « changements
 * demandés » n'existe pas côté GitLab (minddy le porte en note + événement).
 */
export async function listMergeRequestApprovals(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewSummary> {
  const data = await glJson<RawApprovals>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/approvals`,
    opts.token,
  );
  return { approvals: (data.approved_by ?? []).length, changesRequested: 0 };
}

/**
 * Les reviews déjà soumises, avec leur texte — TOUJOURS VIDE côté GitLab, et
 * c'est la bonne réponse plutôt qu'un manque : GitLab n'a pas d'objet « review ».
 * Une approbation y est une signature sans texte (`/approvals`, décomptée
 * ci-dessus), et tout ce qui s'écrit sur une MR est une NOTE — donc déjà servi
 * par `listMergeRequestNotes`. Rendre les notes ici les compterait deux fois.
 */
export async function listMergeRequestReviewMessages(): Promise<PullRequestReviewMessage[]> {
  return [];
}

/**
 * Checks CI de la MR : ses pipelines, du plus récent au plus ancien — seul le
 * dernier décrit l'état courant (cf. `checks-core`). Le scope OAuth `api` déjà
 * acquis suffit : aucune permission à faire accepter, contrairement à GitHub.
 */
export async function listMergeRequestChecks(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<ChecksSummary> {
  const pipelines = await glJson<RawPipeline[]>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/pipelines`,
    opts.token,
  );
  return summarizeGitlabPipelines(pipelines ?? []);
}

export async function closeMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state_event: "close" }),
    },
  );
}

/** Rouvre une MR refusée (MIN-68) — même règle produit que GitHub : on réitère
    la dernière MR de la branche, jamais de doublon. */
export async function reopenMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const mr = await glJson<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state_event: "reopen" }),
    },
  );
  return toRef(mr);
}

interface RawNote {
  id: number;
  body?: string;
  system?: boolean;
  type?: string | null; // "DiffNote" pour les notes ancrées au diff
  author?: { username?: string; avatar_url?: string | null } | null;
  created_at: string;
  position?: RawPosition | null;
  original_position?: RawPosition | null;
  /** Résolution du FIL, portée par chaque note résolvable (MIN-139). */
  resolved?: boolean;
  resolvable?: boolean;
  resolved_by?: { username?: string } | null;
}

interface RawPosition {
  old_path?: string | null;
  new_path?: string | null;
  old_line?: number | null;
  new_line?: number | null;
}

/** Ancre web d'une note (GitLab ne renvoie pas d'URL par note). */
function noteUrl(repoFullName: string, iid: number, noteId: number): string {
  return `${GITLAB_HOST}/${repoFullName}/-/merge_requests/${iid}#note_${noteId}`;
}

function toComment(
  repoFullName: string,
  iid: number,
  n: RawNote,
): PullRequestComment {
  return {
    id: n.id,
    body: n.body ?? "",
    user: n.author
      ? { login: n.author.username ?? "", avatar_url: n.author.avatar_url ?? null }
      : null,
    created_at: n.created_at,
    html_url: noteUrl(repoFullName, iid, n.id),
  };
}

const NOTES_MAX_PAGES = 10;

/**
 * Commentaires de conversation de la MR : les notes NON système et NON ancrées
 * au diff (les DiffNotes vivent dans les discussions de review, autre endpoint).
 */
export async function listMergeRequestNotes(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestComment[]> {
  const notes = await glPaged<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/notes` +
      `?sort=asc&order_by=created_at`,
    opts.token,
    NOTES_MAX_PAGES,
  );
  return notes
    .filter((n) => !n.system && n.type !== "DiffNote")
    .map((n) => toComment(opts.repoFullName, opts.number, n));
}

/**
 * L'ACTIVITÉ de la MR (MIN-159) : approbations, commits poussés, labels,
 * assignations, changements de titre, brouillon ↔ prête, merge, fermeture.
 *
 * GitLab ne type RIEN de tout ça : il l'écrit en anglais dans une note marquée
 * `system`, sur le même endpoint que les commentaires. C'est donc l'exacte
 * moitié que `listMergeRequestNotes` jette, relue avec l'autre filtre — la
 * reconnaissance des phrases (et le repli quand aucune ne colle) est dans
 * `lib/pr-timeline`, partagé avec GitHub et le client.
 *
 * Oui, ce sont les mêmes pages que le fil : deux appels au lieu d'un. C'est le
 * prix d'une interface où les deux forges répondent à la même question, là où
 * GitHub sert bien deux endpoints distincts. Les pages sont chaudes chez GitLab,
 * et fusionner les deux méthodes obligerait tout appelant à connaître ce détail.
 */
export async function listMergeRequestTimeline(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PrTimelineEvent[]> {
  const notes = await glPaged<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/notes` +
      `?sort=asc&order_by=created_at`,
    opts.token,
    NOTES_MAX_PAGES,
  );
  return fromGitlabSystemNotes(notes, (noteId) =>
    noteUrl(opts.repoFullName, opts.number, noteId),
  );
}

/** Ajoute une note à la conversation de la MR (auteur = le compte connecté). */
export async function createMergeRequestNote(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
}): Promise<PullRequestComment> {
  const created = await glJson<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/notes`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toComment(opts.repoFullName, opts.number, created);
}

interface RawDiscussion {
  id: string;
  notes?: RawNote[];
}

/** Position → (ligne, côté) au sens GitHub : new_line → RIGHT, sinon LEFT. */
function lineOf(p: RawPosition | null | undefined): {
  line: number | null;
  side: "LEFT" | "RIGHT";
} {
  if (p?.new_line != null) return { line: p.new_line, side: "RIGHT" };
  return { line: p?.old_line ?? null, side: "LEFT" };
}

function toReviewComment(
  repoFullName: string,
  iid: number,
  n: RawNote,
  rootId: number | null,
): PullRequestReviewComment {
  const { line, side } = lineOf(n.position);
  const original = lineOf(n.original_position ?? n.position);
  return {
    id: n.id,
    body: n.body ?? "",
    path: n.position?.new_path ?? n.position?.old_path ?? "",
    line,
    original_line: original.line,
    side,
    // GitLab ancre une note sur UNE ligne (`old_line`/`new_line`) : pas de plage
    // à relire, et l'UI n'en propose pas non plus de ce côté (MIN-181).
    start_line: null,
    start_side: null,
    in_reply_to_id: rootId,
    // Aucune review à laquelle rattacher ce commentaire : GitLab n'a pas d'objet
    // review, ses notes de diff se rendent seules dans le fil (MIN-159).
    review_id: null,
    // GitLab n'expose pas d'extrait de hunk par note — tous les rendus (UI,
    // prompt de l'agent) ont un repli sans hunk (chemin + ligne + corps).
    diff_hunk: "",
    user: n.author
      ? { login: n.author.username ?? "", avatar_url: n.author.avatar_url ?? null }
      : null,
    created_at: n.created_at,
    html_url: noteUrl(repoFullName, iid, n.id),
  };
}

const DISCUSSIONS_MAX_PAGES = 10;

async function listRawDiscussions(
  opts: {
    token: string;
    repoFullName: string;
    number: number;
  },
  stopWhen?: (all: RawDiscussion[]) => boolean,
): Promise<RawDiscussion[]> {
  return glPaged<RawDiscussion>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/discussions`,
    opts.token,
    DISCUSSIONS_MAX_PAGES,
    stopWhen,
  );
}

/**
 * Commentaires de review de la MR — les notes ancrées à une ligne du diff
 * (DiffNotes), aplaties depuis les discussions : la racine du fil porte
 * `in_reply_to_id: null`, ses réponses pointent la racine (fils plats, même
 * modèle que GitHub).
 */
export async function listMergeRequestDiffComments(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewComment[]> {
  const discussions = await listRawDiscussions(opts);
  const all: PullRequestReviewComment[] = [];
  for (const d of discussions) {
    const notes = (d.notes ?? []).filter((n) => !n.system && n.type === "DiffNote");
    if (notes.length === 0) continue;
    const rootId = notes[0].id;
    notes.forEach((n, i) => {
      all.push(toReviewComment(opts.repoFullName, opts.number, n, i === 0 ? null : rootId));
    });
  }
  return all;
}

/**
 * État de résolution des fils de review (MIN-139) — le pendant GitLab de la
 * requête GraphQL de `pr.ts`, mais sans autre ENDPOINT à interroger : les
 * discussions portent déjà tout, `listMergeRequestDiffComments` ne fait que le
 * jeter en aplatissant. `threadId` est l'id de discussion (une chaîne, à la
 * différence des ids de notes), `rootCommentId` la première DiffNote — la même
 * racine que côté GitHub, donc la même clé d'appariement.
 *
 * Prix à payer, à ne pas se cacher : c'est une SECONDE passe paginée sur
 * `/discussions`, lancée en parallèle de la première par `prReviewCommentsResponse`.
 * Les deux lectures coûtent donc deux fois les mêmes pages. Les fusionner
 * demanderait de changer la forme de `Forge` (un appel rendant commentaires ET
 * fils), ce que la lecture REST + GraphQL de GitHub ne permet pas de servir aussi
 * simplement — d'où ce doublon, borné par `DISCUSSIONS_MAX_PAGES`.
 *
 * `resolved` est porté par CHAQUE note du fil (GitLab résout le fil, pas la
 * note) : lire la racine suffit. Une discussion non résolvable (rare sur une
 * DiffNote) est signalée `resolved: false` — l'appelant n'a pas à en faire un
 * cas particulier, la forge refusera la bascule si elle n'est pas permise.
 */
export async function listMergeRequestDiffThreads(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<ReviewThreadState[]> {
  const discussions = await listRawDiscussions(opts);
  const states: ReviewThreadState[] = [];
  for (const d of discussions) {
    const root = (d.notes ?? []).find((n) => !n.system && n.type === "DiffNote");
    if (!root) continue;
    states.push({
      rootCommentId: root.id,
      threadId: d.id,
      resolved: !!root.resolved,
      resolvedBy: root.resolved_by?.username ?? null,
    });
  }
  return states;
}

/**
 * Résout (ou rouvre) un fil de review. Natif en REST ici, là où GitHub exige
 * GraphQL : la discussion est l'objet, et `resolved` un de ses champs.
 */
export async function setMergeRequestDiscussionResolved(opts: {
  token: string;
  repoFullName: string;
  number: number;
  threadId: string;
  resolved: boolean;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}` +
      `/discussions/${encodeURIComponent(opts.threadId)}`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: opts.resolved }),
    },
  );
}

// ── Réactions emoji des commentaires de review (MIN-139) ─────────────────────

interface RawAward {
  id: number;
  name?: string;
  user?: { username?: string } | null;
}

/** Notes interrogées au plus, et combien à la fois : GitLab n'a pas d'appel
    groupé pour les awards, donc c'est un N+1 — borné, jamais illimité. */
const AWARDS_MAX_NOTES = 120;
const AWARDS_CONCURRENCY = 8;

/** `Promise.all` par tranches : cent notes ne doivent pas partir d'un coup. */
async function mapLimited<A, B>(
  items: A[],
  limit: number,
  fn: (item: A) => Promise<B>,
): Promise<B[]> {
  const out: B[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

/** Login du compte connecté — GitLab décerne les awards SOUS SON NOM, et c'est
    la seule façon de savoir lesquels sont les nôtres (pas de `viewerHasReacted`
    ici, contrairement au GraphQL de GitHub). */
async function gitlabCurrentUsername(token: string): Promise<string | null> {
  const me = await glJson<{ username?: string }>(`${GITLAB_API_BASE}/user`, token);
  return me?.username ?? null;
}

/**
 * Collection d'awards d'un sujet : une NOTE, ou la merge request elle-même —
 * `PR_BODY_COMMENT_ID` (MIN-147), le corps qui ouvre le fil de conversation.
 *
 * Rien d'autre ne distingue les deux surfaces côté GitLab : une note du fil et
 * une note de review portent leurs awards sous la même URL, ce qui laisse
 * `listMergeRequestNoteAwards` et `setMergeRequestNoteAward` servir les deux.
 */
function awardsUrl(repoFullName: string, iid: number, noteId: number): string {
  const base = `${GITLAB_API_BASE}/projects/${projectPath(repoFullName)}/merge_requests/${iid}`;
  return noteId === PR_BODY_COMMENT_ID
    ? `${base}/award_emoji`
    : `${base}/notes/${noteId}/award_emoji`;
}

/**
 * Réactions des commentaires de review — le pendant GitLab de la requête
 * `reactionGroups` de `pr.ts`, mais **note par note** : l'API des awards n'existe
 * que par note, et rien dans la réponse des discussions ne les porte. C'est donc
 * le N+1 que le cadrage du ticket redoutait, rendu supportable par un plafond
 * (`AWARDS_MAX_NOTES`) et une concurrence bornée plutôt que par un pari.
 *
 * Une note dont la lecture échoue rend simplement zéro réaction : une réaction
 * illisible ne doit pas emporter la vue de review.
 *
 * `viewerIsActor` (MIN-145) : à faux, le token est celui du LIEN de projet et
 * non celui de la personne qui regarde — « la mienne » n'aurait alors aucun
 * sens. On ne demande même pas `GET /user` (un aller-retour économisé) et tout
 * sort en `mine: false`.
 */
export async function listMergeRequestNoteAwards(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentIds: number[];
  viewerIsActor: boolean;
}): Promise<ReviewCommentReaction[]> {
  const ids = opts.commentIds.slice(0, AWARDS_MAX_NOTES);
  if (ids.length === 0) return [];
  if (opts.commentIds.length > ids.length) {
    console.warn(
      `[mr] awards read capped at ${AWARDS_MAX_NOTES} notes (${opts.commentIds.length} asked)`,
    );
  }
  const me = opts.viewerIsActor
    ? await gitlabCurrentUsername(opts.token).catch(() => null)
    : null;

  const perNote = await mapLimited(ids, AWARDS_CONCURRENCY, async (noteId) => {
    const awards = await glJson<RawAward[]>(
      awardsUrl(opts.repoFullName, opts.number, noteId),
      opts.token,
    ).catch(() => [] as RawAward[]);

    // Agrégé par emoji : l'API rend une ligne PAR personne, l'UI un compte.
    const byContent = new Map<ReviewReactionContent, ReviewCommentReaction>();
    for (const award of awards ?? []) {
      const content = award.name ? reactionFromGitlabName(award.name) : null;
      if (!content) continue;
      const entry = byContent.get(content) ?? { commentId: noteId, content, count: 0, mine: false };
      entry.count += 1;
      if (me && award.user?.username === me) entry.mine = true;
      byContent.set(content, entry);
    }
    return [...byContent.values()];
  });

  return perNote.flat();
}

/**
 * Pose ou retire une réaction sur une note. GitLab refuse un award en double
 * (404 « has already been taken ») et ne laisse retirer que le SIEN : les deux
 * chemins passent donc par la liste, comme côté GitHub.
 *
 * `login` est celui de l'acteur (MIN-145) et il est **ignoré ici** : GitLab
 * décerne l'award sous le compte du token, et `GET /user` en donne le nom — rien
 * n'est à passer de l'extérieur. Il n'existe dans la signature que parce que
 * GitHub, lui, en a besoin pour retrouver la réaction à supprimer (même
 * arrangement que `commentIds`, que GitHub ignore).
 */
export async function setMergeRequestNoteAward(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  const url = awardsUrl(opts.repoFullName, opts.number, opts.commentId);
  const name = GITLAB_AWARD_NAMES[opts.content];
  const me = await gitlabCurrentUsername(opts.token);
  const awards = await glJson<RawAward[]>(url, opts.token);
  const mine = (awards ?? []).find((a) => a.name === name && a.user?.username === me);

  if (opts.on) {
    // Déjà décernée : ne pas la reposter, GitLab répondrait par une erreur là où
    // l'état demandé est déjà atteint.
    if (mine) return;
    await glJson<unknown>(url, opts.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return;
  }
  if (!mine) return;
  await glJson<unknown>(`${url}/${mine.id}`, opts.token, { method: "DELETE" });
}

/**
 * Poste un commentaire de review sur une ligne (nouvelle discussion GitLab),
 * ancré par les `diff_refs` (base/start/head) lus À CHAUD sur la MR. Ligne hors
 * diff → GitlabApiError(422), même contrat que GitHub (« lineNotInDiff » côté
 * route). Le fichier est adressé par son chemin ACTUEL (new_path) même côté
 * LEFT — la convention GitHub que toute l'UI suit — avec repli sur old_path.
 */
export async function createMergeRequestDiffComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
}): Promise<PullRequestReviewComment> {
  const matchesPath = (d: RawDiff): boolean =>
    d.new_path === opts.path || d.old_path === opts.path;
  // MR (diff_refs) et diffs sont indépendants — en parallèle, et la pagination
  // des diffs s'arrête dès que le fichier visé est trouvé.
  const [mrRaw, diffs] = await Promise.all([
    glJson<RawMr>(
      `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
      opts.token,
    ),
    listRawDiffs(opts, (all) => all.some(matchesPath)),
  ]);
  const refs = mrRaw.diff_refs;
  if (!refs?.base_sha || !refs.head_sha) {
    throw new GitlabApiError("Merge request has no diff refs", 502);
  }

  const file = diffs.find((d) => d.new_path === opts.path) ?? diffs.find(matchesPath);
  const position = file?.diff ? resolveDiffPosition(file.diff, opts.line, opts.side) : null;
  if (!position) {
    throw new GitlabApiError("The line is not part of the merge request diff", 422);
  }

  const created = await glJson<RawDiscussion>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/discussions`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: opts.body,
        position: {
          position_type: "text",
          base_sha: refs.base_sha,
          start_sha: refs.start_sha ?? refs.base_sha,
          head_sha: refs.head_sha,
          old_path: file?.old_path ?? opts.path,
          new_path: file?.new_path ?? opts.path,
          ...(position.oldLine != null ? { old_line: position.oldLine } : {}),
          ...(position.newLine != null ? { new_line: position.newLine } : {}),
        },
      }),
    },
  );
  const note = (created.notes ?? [])[0];
  if (!note) throw new GitlabApiError("GitLab returned no note for the discussion", 502);
  return toReviewComment(opts.repoFullName, opts.number, note, null);
}

/**
 * Répond dans un fil de review. `commentId` est l'id d'une note du fil : GitLab
 * adresse les réponses par discussion — on retrouve la discussion porteuse puis
 * on y ajoute la note (fil plat, la réponse pointe la racine).
 */
export async function replyToMergeRequestDiffComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  body: string;
}): Promise<PullRequestReviewComment> {
  const holdsComment = (d: RawDiscussion): boolean =>
    (d.notes ?? []).some((n) => n.id === opts.commentId);
  // La pagination s'arrête dès que la discussion porteuse est trouvée.
  const discussions = await listRawDiscussions(opts, (all) => all.some(holdsComment));
  const discussion = discussions.find(holdsComment);
  if (!discussion) {
    throw new GitlabApiError("Review thread not found for this comment", 404);
  }
  const rootId = (discussion.notes ?? []).find((n) => n.type === "DiffNote")?.id ?? opts.commentId;
  const created = await glJson<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}` +
      `/discussions/${encodeURIComponent(discussion.id)}/notes`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toReviewComment(opts.repoFullName, opts.number, created, rootId);
}
