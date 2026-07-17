import "server-only";

import {
  GITLAB_API_BASE,
  GITLAB_HOST,
  gitlabHeaders,
  gitlabNextPage,
} from "@/lib/server/git/gitlab-rest";
import { resolveDiffPosition } from "./mr-position";
import type {
  PullRequestRef,
  PullRequestFile,
  PullRequestComment,
  PullRequestReviewComment,
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
    headers: { ...gitlabHeaders(token), ...(init?.headers ?? {}) },
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
    if (stopWhen?.(all)) break;
    page = gitlabNextPage(res);
    fetched++;
  }
  return all;
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

/** Fichiers de la MR au format neutre (patches unified diff) — review in-app. */
export async function listMergeRequestChanges(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestFile[]> {
  const diffs = await listRawDiffs(opts);
  return diffs.map((d) => {
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
  });
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
 * Merge la MR. Pas de `squash` forcé : contrairement à GitHub (méthode choisie
 * par requête), la méthode de merge GitLab est un réglage du projet (merge
 * commit / fast-forward, option squash) — on respecte sa configuration.
 */
export async function mergeMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/merge`,
    opts.token,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
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
    in_reply_to_id: rootId,
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
