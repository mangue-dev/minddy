import "server-only";

import { GITHUB_API_BASE, githubHeaders } from "@/lib/server/git/github-rest";
import { collectSignedAssets } from "@/lib/forge-image-assets";
import {
  summarizeGithubChecks,
  type ChecksSummary,
  type RawCheckRun,
  type RawCommitStatus,
} from "./checks-core";

import type { ReviewThreadState } from "@/lib/pr-review-threads";
import {
  PR_BODY_COMMENT_ID,
  type ReviewCommentReaction,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import {
  fromGithubTimeline,
  type PrTimelineEvent,
  type RawGithubTimelineEvent,
} from "@/lib/pr-timeline";
import type { CommitAuthor } from "@/lib/commit-authors";

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
  /** Nombre de commits de la PR, tel que la forge le compte. GitHub le sert avec
      le GET d'UNE PR (jamais avec la liste) ; GitLab ne le sert nulle part et le
      laisse `undefined` — l'appelant retombe alors sur la longueur de la liste
      de commits. */
  commitCount?: number;
  /** Auteur et date d'ouverture : le `body` ouvre le fil comme un commentaire, il lui faut son en-tête. */
  user?: { login: string; avatar_url: string | null } | null;
  createdAt?: string;
  /** Dernière activité CHEZ LA FORGE — le tri de la liste des PR (MIN-143). */
  updatedAt?: string;
  /** Date de fusion, quand il y en a une (MIN-143 : la table la garde). */
  mergedAt?: string | null;
  /** Identifiant GraphQL de la PR — seule clé acceptée par les mutations (MIN-138 :
      la bascule brouillon → prête n'existe QUE en GraphQL). GitLab : jamais rempli. */
  nodeId?: string;
  /** La PR peut-elle être fusionnée ? `null`/`undefined` = INCONNU, pas « non » :
      GitHub calcule la fusionnabilité en asynchrone (vérifié — une PR fraîche
      répond `mergeable: null` + `mergeable_state: "unknown"` pendant quelques
      secondes), et l'endpoint *list* ne renvoie pas du tout ces deux champs. */
  mergeable?: boolean | null;
  /** État de fusionnabilité détaillé : `clean`, `blocked` (le dépôt exige des
      approbations / des checks), `dirty` (conflit), `unstable` (checks non
      requis en échec), `unknown`. */
  mergeableState?: string | null;
}

/** Verdict d'une review, en vocabulaire neutre (GitHub : APPROVE / REQUEST_CHANGES / COMMENT). */
export type ReviewVerdict = "approve" | "request_changes" | "comment";

/**
 * Ce qui est RÉELLEMENT arrivé chez la forge quand minddy soumet une review.
 *
 * `"review"` : le verdict est publié tel quel. `"comment"` : la forge a refusé
 * l'auto-review — les PR de Numo sont ouvertes par le bot de la GitHub App, et
 * GitHub répond 422 « Can not approve your own pull request » (mesuré, cf. le
 * spike de MIN-138). Le verdict part alors en commentaire, préfixé de sa valeur,
 * et c'est minddy qui garde la trace du verdict réel (événement `pr_approved` /
 * `pr_changes_requested`). L'appelant le dit à l'utilisateur : approuver depuis
 * minddy ne coche pas la case verte de GitHub.
 */
export interface ReviewSubmission {
  published: "review" | "comment";
}

/** Décompte d'approbations d'une PR — tout ce que minddy en affiche. */
export interface PullRequestReviewSummary {
  approvals: number;
  changesRequested: number;
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

/**
 * Un commit de la PR — ce que l'onglet Commits montre.
 *
 * DEUX auteurs, qui ne disent pas la même chose : `author` est le COMPTE de la
 * forge, quand elle a su rattacher l'email du commit à un utilisateur (c'est lui
 * qui porte l'avatar et le login), tandis que `authorName` est le nom écrit DANS
 * le commit, que git a toujours. Un commit poussé depuis une machine dont
 * l'email n'est pas déclaré chez la forge n'a que le second — et côté GitLab,
 * dont l'API de commits de MR ne sert aucun compte, il n'y a jamais que lui.
 */
export interface PullRequestCommit {
  sha: string;
  /** Message COMPLET : première ligne = titre, le reste = corps (souvent vide). */
  message: string;
  author: { login: string; avatar_url: string | null } | null;
  authorName: string | null;
  /** Email de l'auteur — la seule clé qui dédoublonne un co-signataire d'avec
      l'auteur principal quand aucune des deux formes ne porte de compte. */
  authorEmail: string | null;
  authoredAt: string | null;
  url: string | null;
  /** Signature vérifiée par la forge. `null` = INCONNU, pas « non signé » :
      GitLab ne le sert pas sur cet endpoint (il faut un appel par commit). */
  verified: boolean | null;
  /**
   * PREMIER parent — le côté « avant » du diff de ce commit seul. C'est lui qui
   * adresse la version base d'un fichier au dépliage de contexte. `null` sur un
   * commit racine (aucun parent), où il n'y a rien à déplier avant.
   */
  parentSha: string | null;
  /** Lignes ajoutées / retirées PAR CE COMMIT. `null` = pas encore lu : aucune
      des deux forges ne sert ces chiffres avec la liste (cf. `…CommitExtras`). */
  additions: number | null;
  deletions: number | null;
  /**
   * TOUS ses auteurs, principal en tête (MIN-159) — un commit co-signé en a
   * plusieurs, et c'est le cas courant dès qu'un agent a tenu le clavier.
   * Vide tant que `…CommitExtras` n'a pas répondu ; l'appelant retombe alors sur
   * `author` / `authorName`, l'auteur principal seul.
   */
  authors: CommitAuthor[];
}

/** Ce que la liste de commits ne porte PAS, et qu'un second appel va chercher :
    le poids de chaque commit, et ses auteurs résolus en comptes de forge. */
export interface CommitExtras {
  additions: number;
  deletions: number;
  /** Auteurs, principal en tête, dédoublonnés PAR LA FORGE. Vide quand elle ne
      sait pas les résoudre (GitLab) : le repli lit alors les trailers. */
  authors: CommitAuthor[];
}

/** Le diff d'UN commit contre son parent : la vue « ce que ce commit change ». */
export interface CommitDiff {
  files: PullRequestFile[];
  additions: number;
  deletions: number;
  url: string | null;
  parentSha: string | null;
}

/**
 * Un compte de la FORGE qu'on peut mentionner sur une PR (MIN-162) — pas un
 * membre minddy : le commentaire part chez la forge, où un `@` ne désigne
 * quelqu'un que s'il désigne un compte de là-bas.
 */
export interface RepoMember {
  /** Le nom tel qu'il s'écrit après l'arobase — `@login`, brut. */
  login: string;
  avatar_url: string | null;
  /** Nom affiché quand la forge en a un (GitLab), sinon le login seul. */
  name: string | null;
}

/** Commentaire de conversation d'une PR (endpoint issues/{n}/comments de GitHub). */
export interface PullRequestComment {
  id: number;
  body: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

/**
 * Commentaire de REVIEW : ancré à une ligne du diff (endpoint pulls/{n}/comments),
 * là où `PullRequestComment` vit dans le fil plat de la conversation.
 *
 * `line` est la ligne dans la version ACTUELLE de la PR, `original_line` celle du
 * commit où le commentaire a été posé. GitHub met `line: null` quand il ne sait
 * plus rattacher le commentaire au diff courant (« outdated ») — mais l'inverse
 * n'est PAS vrai : `line` non nul ne garantit pas que la ligne soit dans le diff
 * (vérifié contre l'API : un commentaire posé sur une ligne de CONTEXTE garde son
 * `line` même après que le diff se soit déplacé ailleurs dans le fichier). Côté
 * rendu, seule la résolution effective dans les hunks fait foi.
 */
export interface PullRequestReviewComment {
  id: number;
  body: string;
  path: string;
  /** Ligne dans le diff courant, ou null si GitHub ne sait plus la rattacher. */
  line: number | null;
  /** Ligne au commit d'origine — le repli d'affichage quand `line` est null. */
  original_line: number | null;
  side: "LEFT" | "RIGHT";
  /** Première ligne d'une remarque MULTI-LIGNES (MIN-181) — `line` en est alors
      la DERNIÈRE. `null` sur une remarque d'une seule ligne, et toujours `null`
      côté GitLab, où une note s'ancre sur une ligne. Sans ces deux champs, une
      remarque posée sur les lignes 6 à 15 se relit comme une remarque sur la
      15 : l'ancre est juste, la plage a disparu. */
  start_line: number | null;
  start_side: "LEFT" | "RIGHT" | null;
  /** Racine du fil (GitHub normalise : répondre à une réponse pointe la racine). */
  in_reply_to_id: number | null;
  /** Review qui porte ce commentaire (MIN-159) — la clé qui le range sous elle
      dans le fil de conversation. `null` côté GitLab, qui n'a pas d'objet review. */
  review_id: number | null;
  /** Extrait du diff autour de la ligne, tel qu'au moment du commentaire. */
  diff_hunk: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

/**
 * L'état d'un FIL (résolution) vit dans le module pur `lib/pr-review-threads` —
 * il est partagé avec le client, qui apparie les deux listes au rendu. Réexporté
 * ici pour que `mr.ts` et `forge.ts` l'importent comme les autres types de PR.
 */
export type { ReviewThreadState } from "@/lib/pr-review-threads";
export type {
  ReviewCommentReaction,
  ReviewReactionContent,
} from "@/lib/pr-review-reactions";
export type { PrTimelineEvent } from "@/lib/pr-timeline";
export type { CommitAuthor } from "@/lib/commit-authors";

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

/**
 * Message d'erreur GitHub, DÉTAIL COMPRIS.
 *
 * Sur un 422, `message` ne vaut que « Unprocessable Entity » : le motif réel est
 * dans `errors[]` — et c'est lui qui distingue « ne peut pas approuver sa propre
 * pull request » d'un corps invalide (vérifié contre l'API, MIN-138). Les
 * entrées y sont tantôt des chaînes nues, tantôt des objets `{message}` ou
 * `{resource, field, code}` : les trois formes existent selon l'endpoint.
 */
function githubErrorMessage(data: unknown, status: number): string {
  const body = (data ?? {}) as { message?: string; errors?: unknown };
  const base = body.message ?? `GitHub API error (${status})`;
  if (!Array.isArray(body.errors)) return base;
  const details = body.errors
    .map((e) => {
      if (typeof e === "string") return e;
      const o = (e ?? {}) as { message?: string; field?: string; code?: string };
      return o.message ?? [o.field, o.code].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return details.length > 0 ? `${base}: ${details.join(", ")}` : base;
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
  if (!res.ok) throw new GithubApiError(githubErrorMessage(data, res.status), res.status);
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
  node_id?: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  title?: string;
  body?: string | null;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
  commits?: number;
  user?: { login?: string; avatar_url?: string } | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * `toRef` sert le GET d'UNE PR **et** `listPullRequests`. L'endpoint *list* ne
 * renvoie ni `mergeable`, ni `mergeable_state`, ni `merged` : ces champs y
 * restent `undefined`. C'est voulu et ça ne gêne pas le ménage de branches (qui
 * ne les lit pas), mais tout lecteur doit distinguer `undefined` (« pas
 * l'information ») de `false` (« vraiment pas fusionnable »).
 */
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
    commitCount: pr.commits,
    user: pr.user ? { login: pr.user.login ?? "", avatar_url: pr.user.avatar_url ?? null } : null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at ?? null,
    nodeId: pr.node_id,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
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

const FILES_PER_PAGE = 100;
/**
 * GitHub plafonne cet endpoint à 3 000 fichiers : trente pages le couvrent en
 * entier. Une PR qui en dépasse existe (une migration de dépôt, un lockfile
 * régénéré), et c'est justement là que la troncature doit se DIRE — un lecteur
 * qui ignore ce qu'il n'a pas vu conclut sur ce qu'il a vu.
 */
const FILES_MAX_PAGES = 30;

/**
 * Fichiers de la PR avec leurs patches (unified diff) — alimente la review
 * in-app, la vue diff et l'amorce d'une session de relecture.
 *
 * PAGINÉ (MIN-168). Une seule page en servait 100 et n'en disait rien : au-delà,
 * les fichiers suivants disparaissaient sans laisser de trace — l'appelant ne
 * pouvait même pas savoir qu'il lui en manquait. `truncated` est la moitié qui
 * manquait : il dit que la liste s'arrête au plafond, pas que le dépôt s'arrête
 * là.
 */
export async function listPullRequestFiles(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ files: PullRequestFile[]; truncated: boolean }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const files: PullRequestFile[] = [];
  let truncated = false;
  for (let page = 1; page <= FILES_MAX_PAGES; page++) {
    const batch = await ghJson<
      Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
        previous_filename?: string;
      }>
    >(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/files` +
        `?per_page=${FILES_PER_PAGE}&page=${page}`,
      opts.token,
    );
    files.push(
      ...batch.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        previous_filename: f.previous_filename,
      })),
    );
    // Page incomplète = dernière page.
    if (batch.length < FILES_PER_PAGE) break;
    if (page === FILES_MAX_PAGES) truncated = true;
  }
  return { files, truncated };
}

interface RawCommit {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; email?: string; date?: string } | null;
    verification?: { verified?: boolean } | null;
  } | null;
  author?: { login?: string; avatar_url?: string } | null;
  parents?: Array<{ sha?: string }>;
}

function toCommit(c: RawCommit): PullRequestCommit {
  return {
    sha: c.sha,
    message: c.commit?.message ?? "",
    author: c.author
      ? { login: c.author.login ?? "", avatar_url: c.author.avatar_url ?? null }
      : null,
    authorName: c.commit?.author?.name ?? null,
    authorEmail: c.commit?.author?.email ?? null,
    authoredAt: c.commit?.author?.date ?? null,
    url: c.html_url ?? null,
    verified: c.commit?.verification?.verified ?? null,
    // Premier parent seulement : sur un commit de fusion, c'est la ligne
    // principale, et c'est contre elle que les deux forges diffent.
    parentSha: c.parents?.[0]?.sha ?? null,
    // La REST des commits ne porte PAS de stats (vérifié contre l'API) : elles
    // arrivent d'ailleurs, et sont fusionnées par l'appelant. Les co-auteurs non
    // plus : la REST ne lit pas les trailers, seul GraphQL les résout.
    additions: null,
    deletions: null,
    authors: [],
  };
}

const COMMITS_PER_PAGE = 100;
/** GitHub plafonne cet endpoint à 250 commits : trois pages le couvrent en
    entier, et une PR qui en dépasse se lit chez la forge (`truncated` le dit). */
const COMMITS_MAX_PAGES = 3;

/**
 * Les commits de la PR, du plus ANCIEN au plus récent — l'ordre que GitHub
 * sert et qu'il affiche, celui dans lequel le travail s'est fait.
 *
 * Paginé pour la même raison que les commentaires de review : GitHub sert cette
 * liste dans l'ordre chronologique, donc s'arrêter à la première page ferait
 * disparaître les commits les plus RÉCENTS — précisément ceux qu'on vient
 * regarder après un nouveau push de Numo.
 */
export async function listPullRequestCommits(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ commits: PullRequestCommit[]; truncated: boolean }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const commits: PullRequestCommit[] = [];
  let truncated = false;
  for (let page = 1; page <= COMMITS_MAX_PAGES; page++) {
    const batch = await ghJson<RawCommit[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/commits` +
        `?per_page=${COMMITS_PER_PAGE}&page=${page}`,
      opts.token,
    );
    commits.push(...batch.map(toCommit));
    // Page incomplète = dernière page.
    if (batch.length < COMMITS_PER_PAGE) break;
    if (page === COMMITS_MAX_PAGES) truncated = true;
  }
  return { commits, truncated };
}

interface RawCommitExtras {
  repository?: {
    pullRequest?: {
      commits?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          commit?: {
            oid?: string;
            additions?: number;
            deletions?: number;
            authors?: {
              nodes?: Array<{
                name?: string;
                user?: { login?: string; avatarUrl?: string | null } | null;
              } | null>;
            } | null;
          } | null;
        } | null>;
      } | null;
    } | null;
  } | null;
}

/** Au-delà, l'avatar empilé n'est plus lisible — et GitHub replie aussi. */
const MAX_COMMIT_AUTHORS = 10;

const COMMIT_EXTRAS_QUERY = `
  query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        commits(first:100, after:$cursor){
          pageInfo{ hasNextPage endCursor }
          nodes{ commit{
            oid additions deletions
            authors(first:${MAX_COMMIT_AUTHORS}){ nodes{ name user{ login avatarUrl } } }
          } }
        }
      }
    }
  }`;

/**
 * Ce que la liste REST des commits ne porte pas : leur POIDS (+/− lignes) et
 * leurs AUTEURS résolus en comptes de forge — indexés par SHA.
 *
 * En GraphQL, et à part de la liste, parce que la REST ne sait faire ni l'un ni
 * l'autre : `pulls/{n}/commits` ne porte aucune stat (vérifié contre l'API), et
 * les obtenir en REST demanderait un `GET commits/{sha}` PAR commit ; quant aux
 * co-auteurs, elle ne lit tout simplement pas les trailers `Co-authored-by`.
 * GraphQL rend les deux en une requête — et sans permission de plus que la REST
 * équivalente (même constat que les fils de review).
 *
 * Les deux voyagent ensemble parce qu'ils viennent du même aller-retour : les
 * séparer en doublerait le coût pour rien.
 *
 * L'appelant traite l'échec en best-effort : sans cet appel, la liste s'affiche
 * quand même — l'indicateur +/− disparaît, et les auteurs retombent sur l'auteur
 * principal plus ce que les trailers du message disent.
 */
export async function listPullRequestCommitExtras(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<Map<string, CommitExtras>> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const extras = new Map<string, CommitExtras>();
  let cursor: string | null = null;
  for (let page = 1; page <= COMMITS_MAX_PAGES; page++) {
    const data: RawCommitExtras = await ghGraphql<RawCommitExtras>(
      opts.token,
      COMMIT_EXTRAS_QUERY,
      { owner, name: repo, number: opts.number, cursor },
    );
    const connection = data.repository?.pullRequest?.commits;
    for (const node of connection?.nodes ?? []) {
      const c = node?.commit;
      if (!c?.oid) continue;
      extras.set(c.oid, {
        additions: c.additions ?? 0,
        deletions: c.deletions ?? 0,
        // MESURÉ : GitHub rend l'auteur principal EN TÊTE puis les co-signataires,
        // déjà dédoublonnés par email — un trailer qui répète l'auteur n'ajoute
        // pas d'entrée. Il résout aussi les comptes, jusqu'à `noreply@anthropic.com`
        // (→ `claude`), ce que la REST ne fait nulle part.
        authors: (c.authors?.nodes ?? []).flatMap((a) => {
          const name = a?.name?.trim();
          if (!name && !a?.user?.login) return [];
          return [
            {
              login: a?.user?.login ?? null,
              name: name || (a?.user?.login as string),
              // L'avatar du COMPTE seulement : `GitActor.avatarUrl` sert un
              // identicon pour un email inconnu, qui se lirait comme une photo.
              avatar_url: a?.user?.avatarUrl ?? null,
            },
          ];
        }),
      });
    }
    if (!connection?.pageInfo?.hasNextPage) break;
    cursor = connection.pageInfo.endCursor ?? null;
    if (!cursor) break;
  }
  return extras;
}

/**
 * Le diff d'UN commit contre son parent — « ce que ce commit-là change », au
 * même format que le diff de la PR entière (mêmes patches, même rendu).
 *
 * GitHub sert au plus 300 fichiers sur cet endpoint ; au-delà il faudrait
 * paginer, mais un commit unique qui touche 300 fichiers ne se lit plus
 * fichier par fichier de toute façon.
 */
export async function getCommitDiff(opts: {
  token: string;
  repoFullName: string;
  sha: string;
}): Promise<CommitDiff> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const commit = await ghJson<{
    html_url?: string;
    stats?: { additions?: number; deletions?: number };
    parents?: Array<{ sha?: string }>;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
      previous_filename?: string;
    }>;
  }>(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${opts.sha}`, opts.token);

  return {
    files: (commit.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      previous_filename: f.previous_filename,
    })),
    additions: commit.stats?.additions ?? 0,
    deletions: commit.stats?.deletions ?? 0,
    url: commit.html_url ?? null,
    parentSha: commit.parents?.[0]?.sha ?? null,
  };
}

/** Pages de 100 drainées au plus pour le picker de branche — au-delà, un dépôt
    a trop de branches pour qu'une liste exhaustive serve encore à choisir. */
const MAX_BRANCH_PAGES = 5;

/**
 * Noms des branches du dépôt (picker de branche de base du lancement d'agent).
 * Paginé jusqu'à MAX_BRANCH_PAGES × 100 — le tri (défaut d'abord) est fait par
 * l'appelant, GitHub ne proposant ni tri ni recherche sur cet endpoint.
 */
export async function listBranches(opts: {
  token: string;
  repoFullName: string;
}): Promise<string[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const names: string[] = [];
  for (let page = 1; page <= MAX_BRANCH_PAGES; page++) {
    const batch = await ghJson<Array<{ name: string }>>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
      opts.token,
    );
    names.push(...batch.map((b) => b.name));
    if (batch.length < 100) break;
  }
  return names;
}

/** Deux pages = 200 comptes. Au-delà, une liste de suggestions n'aide plus
    personne : on tape trois lettres, on ne déroule pas un annuaire. */
const MAX_MEMBER_PAGES = 2;

/**
 * Les comptes GitHub qu'on peut mentionner sur ce dépôt (MIN-162) — ses
 * collaborateurs, `affiliation=all` (membres directs, hérités de l'organisation
 * et sortants). C'est la liste que GitHub propose lui-même sous un `@`.
 *
 * Le token d'installation suffit : c'est une LECTURE, comme toutes celles de la
 * vue PR. Elle demande la permission « Members » (lecture) sur l'installation —
 * sans elle GitHub répond 403, et l'appelant rend une liste vide plutôt qu'une
 * erreur : on écrit très bien un commentaire sans suggestion de mention.
 */
export async function listRepoMembers(opts: {
  token: string;
  repoFullName: string;
}): Promise<RepoMember[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const members: RepoMember[] = [];
  for (let page = 1; page <= MAX_MEMBER_PAGES; page++) {
    const batch = await ghJson<Array<{ login?: string; avatar_url?: string }>>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/collaborators` +
        `?affiliation=all&per_page=100&page=${page}`,
      opts.token,
    );
    for (const c of batch) {
      if (c.login) members.push({ login: c.login, avatar_url: c.avatar_url ?? null, name: null });
    }
    if (batch.length < 100) break;
  }
  return members;
}

/** Même esprit que MAX_BRANCH_PAGES : 500 PR suffisent à un ménage de branches,
    et l'ordre `updated desc` met les plus récentes — les seules encore vivantes
    dans la tête de l'utilisateur — sur la première page. */
const MAX_PR_PAGES = 5;

/**
 * TOUTES les PR du dépôt, tous états confondus (MIN-102, ménage des branches
 * d'agent). `state=all` est indispensable : `state=closed` de GitHub couvre les
 * refusées ET les fusionnées, mais on veut aussi voir les PR OUVERTES pour ne
 * jamais proposer la suppression d'une branche qui en porte une.
 *
 * `truncated` prévient l'appelant qu'au-delà de MAX_PR_PAGES × 100 la liste est
 * coupée — l'aperçu le dit alors à l'écran plutôt que de mentir par omission.
 */
export async function listPullRequests(opts: {
  token: string;
  repoFullName: string;
}): Promise<{ pulls: PullRequestRef[]; truncated: boolean }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pulls: PullRequestRef[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PR_PAGES; page++) {
    const batch = await ghJson<RawPull[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls` +
        `?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
      opts.token,
    );
    // L'endpoint *list* ne renvoie pas `merged` : `toRef` retombe sur
    // `merged_at`, seul signal disponible ici pour distinguer fusionnée/refusée.
    pulls.push(...batch.map(toRef));
    if (batch.length < 100) break;
    if (page === MAX_PR_PAGES) truncated = true;
  }
  return { pulls, truncated };
}

/**
 * Supprime une branche distante (MIN-102). Renvoie `"deleted"`, ou
 * `"already-gone"` si la référence n'existe plus — un ménage rejoué ne doit pas
 * ressembler à une panne. GitHub répond 422 « Reference does not exist » (et
 * non 404) quand le ref a déjà disparu.
 */
export async function deleteBranch(opts: {
  token: string;
  repoFullName: string;
  branch: string;
}): Promise<"deleted" | "already-gone"> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  // Ref laissé tel quel — mêmes raisons que getMergeBaseSha : nos branches
  // portent des `/` (`minddy/agent/…`) et les %2F casseraient la route.
  try {
    await ghJson<unknown>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${opts.branch}`,
      opts.token,
      { method: "DELETE" },
    );
    return "deleted";
  } catch (err) {
    if (err instanceof GithubApiError && (err.status === 422 || err.status === 404)) {
      return "already-gone";
    }
    throw err;
  }
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

/**
 * Diff CUMULÉ d'une branche de travail contre sa base — la vue diff d'une session
 * SANS PR (le compare GitHub sert les fichiers au même format que pulls/{n}/files,
 * depuis le merge base, comme une PR). `?per_page=1` borne la liste des COMMITS
 * embarquée dans la réponse : les fichiers, eux, ne sont servis que sur la
 * première page et arrivent entiers (plafond GitHub : 300).
 * Lève GithubApiError(404) si la branche n'a pas (encore) été poussée.
 */
export async function compareBranches(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<{ files: PullRequestFile[]; url: string | null }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  // Refs laissés tels quels — mêmes raisons que getMergeBaseSha (branches à slash).
  const comparison = await ghJson<{
    html_url?: string;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
      previous_filename?: string;
    }>;
  }>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${opts.base}...${opts.head}?per_page=1`,
    opts.token,
  );
  return {
    files: (comparison.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      previous_filename: f.previous_filename,
    })),
    url: comparison.html_url ?? null,
  };
}

/** Chemin de fichier encodé segment par segment : encodeURIComponent avalerait les `/`. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Contenu brut d'un fichier à un ref donné, ou null s'il n'y existe pas. */
export async function getFileAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<string | null> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  return ghRawText(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodePath(opts.path)}?ref=${encodeURIComponent(opts.ref)}`,
    opts.token,
  );
}

/**
 * Mêmes octets, non décodés : la version image d'un fichier du diff (MIN-66).
 * `getFileAtRef` passe par `res.text()`, qui interprète le corps en UTF-8 et
 * remplace tout octet invalide par U+FFFD — un PNG en ressort corrompu. C'est la
 * seule raison d'être de ce doublon.
 */
export async function getFileBytesAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<ArrayBuffer | null> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodePath(opts.path)}?ref=${encodeURIComponent(opts.ref)}`;
  const res = await fetch(url, { headers: githubHeaders(opts.token, "application/vnd.github.raw") });
  if (res.status === 404) return null;
  if (!res.ok) {
    let message = `GitHub API error (${res.status})`;
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      // Corps non-JSON (raw) : on garde le message par défaut.
    }
    throw new GithubApiError(message, res.status);
  }
  return res.arrayBuffer();
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

// ── Reviews formelles (MIN-138) ──────────────────────────────────────────────

const GITHUB_REVIEW_EVENT: Record<ReviewVerdict, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> = {
  approve: "APPROVE",
  request_changes: "REQUEST_CHANGES",
  comment: "COMMENT",
};

/**
 * Le verdict, écrit en toutes lettres en tête du commentaire de repli — sans lui,
 * un lecteur de la PR sur GitHub ne verrait qu'un commentaire nu là où minddy
 * affiche « approuvé ». En français, comme le corps de PR que l'agent rédige
 * (`execute.ts`).
 */
const FALLBACK_VERDICT_PREFIX: Record<ReviewVerdict, string> = {
  approve: "**Approuvé depuis minddy.**",
  request_changes: "**Changements demandés depuis minddy.**",
  comment: "",
};

/** GitHub refuse-t-il parce que l'auteur ne peut pas se relire lui-même ?
    Mesuré : 422 « Review Can not approve your own pull request ». */
function isSelfReviewRefusal(err: unknown): boolean {
  return (
    err instanceof GithubApiError &&
    err.status === 422 &&
    /own pull request/i.test(err.message)
  );
}

/**
 * Soumet une review sur la PR. `approve` et `request_changes` sont TENTÉS en
 * événement de review puis repliés en commentaire si GitHub refuse l'auto-review
 * (le cas normal des PR de Numo : elles sont ouvertes par le bot de la GitHub
 * App). On tente quand même plutôt que de replier d'emblée : sur un GitHub
 * Enterprise, ou le jour où une PR portera un autre auteur, le verdict doit
 * atterrir pour de vrai — le coût est un aller-retour de plus sur un clic.
 *
 * **Tout ce qui n'est pas un verdict part dans le FIL** (`issues/{n}/comments`),
 * jamais en review `COMMENT`. VÉRIFIÉ contre l'API : le corps d'une review
 * `COMMENT` ne ressort que de `pulls/{n}/reviews` — il est absent de
 * `issues/{n}/comments`, le seul endpoint dont minddy peuple le fil de la PR
 * (`listPullRequestComments`). Un texte posté en review `COMMENT` est donc
 * lisible sur github.com et invisible DANS minddy, ce qui touchait les deux
 * chemins les plus courants : le verdict « commenter » du menu Review, et le
 * repli d'auto-review — c'est-à-dire toute approbation d'une PR de Numo.
 * GitLab faisait déjà ainsi (`submitMergeRequestReview` → `createMergeRequestNote`) :
 * les deux forges disent désormais la même chose.
 */
export async function submitPullRequestReview(opts: {
  token: string;
  repoFullName: string;
  number: number;
  verdict: ReviewVerdict;
  body: string;
}): Promise<ReviewSubmission> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const postReview = (event: string, body: string) =>
    ghJson<unknown>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/reviews`,
      opts.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, body }),
      },
    );

  // Rien à publier comme verdict : le texte va là où il sera lu. `published`
  // reste « review » — aucune forge n'a rien refusé.
  if (opts.verdict === "comment") {
    await createPullRequestComment(opts);
    return { published: "review" };
  }
  try {
    await postReview(GITHUB_REVIEW_EVENT[opts.verdict], opts.body);
    return { published: "review" };
  } catch (err) {
    if (!isSelfReviewRefusal(err)) throw err;
    // Le préfixe garantit aussi un corps NON VIDE : GitHub accepte un `APPROVE`
    // sans message, mais refuse un commentaire qui n'en a pas.
    const body = `${FALLBACK_VERDICT_PREFIX[opts.verdict]}\n\n${opts.body}`.trim();
    await createPullRequestComment({ ...opts, body });
    return { published: "comment" };
  }
}

interface RawReview {
  state?: string; // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING
  body?: string | null;
  user?: { login?: string } | null;
  submitted_at?: string | null;
}

/**
 * Le TEXTE d'une review déjà soumise, avec son verdict — ce que le décompte
 * d'approbations ne dit pas. Lu par la passe de relecture de Numo (MIN-141) :
 * un point déjà soulevé par quelqu'un n'a pas à l'être une seconde fois, et le
 * corps d'une review vit ailleurs que le fil (`pulls/{n}/reviews`, jamais
 * `issues/{n}/comments`).
 */
export interface PullRequestReviewMessage {
  author: string | null;
  /** `approved` | `changes_requested` | `commented` | `dismissed`. */
  state: string;
  body: string;
  submittedAt: string | null;
}

/**
 * Décompte des approbations de la PR. GitHub garde TOUT l'historique des reviews
 * (approuver, puis demander des changements, laisse les deux lignes) : seule la
 * DERNIÈRE review tranchante de chaque utilisateur compte, exactement comme la
 * règle d'approbation du dépôt. Les `COMMENTED` et `DISMISSED` ne tranchent rien
 * et sont donc ignorées, sans effacer un verdict antérieur.
 */
export async function listPullRequestReviews(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewSummary> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const reviews = await ghJson<RawReview[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/reviews?per_page=100`,
    opts.token,
  );
  // L'endpoint renvoie du plus ancien au plus récent : la dernière écriture par
  // login gagne naturellement.
  const verdictByUser = new Map<string, "approved" | "changes_requested">();
  for (const r of reviews) {
    const login = r.user?.login;
    if (!login) continue;
    if (r.state === "APPROVED") verdictByUser.set(login, "approved");
    else if (r.state === "CHANGES_REQUESTED") verdictByUser.set(login, "changes_requested");
  }
  const verdicts = [...verdictByUser.values()];
  return {
    approvals: verdicts.filter((v) => v === "approved").length,
    changesRequested: verdicts.filter((v) => v === "changes_requested").length,
  };
}

/**
 * Les reviews déjà soumises, AVEC leur texte (du plus ancien au plus récent).
 * Même endpoint que le décompte ci-dessus, autre lecture : ici on garde ce qui a
 * été ÉCRIT. Les reviews sans corps sont écartées — une approbation nue n'apporte
 * rien à qui relit, son existence se lit déjà dans le décompte.
 */
export async function listPullRequestReviewMessages(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewMessage[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const reviews = await ghJson<RawReview[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/reviews?per_page=100`,
    opts.token,
  );
  return reviews
    .filter((r) => (r.body ?? "").trim())
    .map((r) => ({
      author: r.user?.login ?? null,
      state: (r.state ?? "commented").toLowerCase(),
      body: (r.body ?? "").trim(),
      submittedAt: r.submitted_at ?? null,
    }));
}

/**
 * Appel GraphQL, pour ce que la REST de GitHub ne sait pas faire : basculer une
 * PR hors brouillon (ci-dessous) et résoudre un fil de review (MIN-139).
 *
 * GraphQL répond **200 avec un tableau `errors`** quand l'opération échoue :
 * s'en remettre au status HTTP ferait passer un échec pour un succès. Vérifié
 * avec un token d'installation — aucune permission de plus que celles de la REST
 * équivalente (`pull_requests: read`/`write`).
 */
async function ghGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${GITHUB_API_BASE}/graphql`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  type GraphqlBody = { data?: T; errors?: Array<{ message?: string }> };
  let data: GraphqlBody | null = null;
  try {
    data = text ? (JSON.parse(text) as GraphqlBody) : null;
  } catch {
    // Corps non-JSON : le status seul décidera.
  }
  if (!res.ok) {
    throw new GithubApiError(
      data?.errors?.[0]?.message ?? `GitHub API error (${res.status})`,
      res.status,
    );
  }
  if (data?.errors?.length) {
    throw new GithubApiError(data.errors[0].message ?? "GraphQL error", 422);
  }
  if (!data?.data) throw new GithubApiError("GitHub returned no data", 502);
  return data.data;
}

/**
 * Bascule une PR brouillon en « prête pour la review ». La REST ne sait pas le
 * faire : c'est une mutation GraphQL, adressée par le `node_id` de la PR (d'où
 * `PullRequestRef.nodeId`).
 */
export async function markPullRequestReadyForReview(opts: {
  token: string;
  nodeId: string;
}): Promise<void> {
  await ghGraphql<unknown>(
    opts.token,
    "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id})" +
      "{pullRequest{number isDraft}}}",
    { id: opts.nodeId },
  );
}

/**
 * Checks CI de la tête de la PR : les check runs (GitHub Actions & co) ET les
 * commit statuses (l'API historique), fusionnés par `checks-core`.
 *
 * Demande les permissions `checks: read` et `statuses: read` de la GitHub App.
 * Une App qui les gagne ne les obtient PAS rétroactivement — chaque installation
 * existante doit les accepter (même piège que `hasIssuesPermission`). Tant que ce
 * n'est pas fait, GitHub répond **403 « Resource not accessible by integration »**
 * (mesuré) : l'appelant dégrade en « checks indisponibles », il ne casse pas.
 */
export async function listPullRequestChecks(opts: {
  token: string;
  repoFullName: string;
  sha: string;
}): Promise<ChecksSummary> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const base = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${opts.sha}`;
  const [runs, statuses] = await Promise.all([
    ghJson<{ check_runs?: RawCheckRun[] }>(`${base}/check-runs?per_page=100`, opts.token),
    ghJson<{ statuses?: RawCommitStatus[] }>(`${base}/status?per_page=100`, opts.token),
  ]);
  return summarizeGithubChecks(runs.check_runs ?? [], statuses.statuses ?? []);
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

/**
 * Les images des commentaires de la PR, indexées par uuid d'asset (MIN-162).
 *
 * `Accept: application/vnd.github.full+json` demande à GitHub de RENDRE le
 * markdown : la réponse porte alors un `body_html` où chaque image collée est
 * réécrite en URL signée, servable sans authentification — là où l'URL du corps
 * brut (`github.com/user-attachments/assets/…`) répond 404 à tout ce que minddy
 * détient. Le pourquoi, et la table de mesures, sont dans `lib/forge-image-assets`.
 *
 * Trois surfaces, parce qu'une image peut être n'importe où sur la PR : son
 * CORPS, un message du fil, une remarque de ligne. Elles se lisent en parallèle
 * et versent dans la même table — l'appelant cherche un uuid, pas un endroit.
 *
 * Best-effort à la surface : une lecture en échec retire des images de la table,
 * elle ne fait pas tomber l'affichage de la PR.
 */
export async function listPullRequestImageAssets(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<Map<string, string>> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const base = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const rendered = { accept: "application/vnd.github.full+json" };

  const [pr, comments, reviewComments] = await Promise.all([
    ghJson<{ body_html?: string }>(`${base}/pulls/${opts.number}`, opts.token, rendered),
    ghJson<Array<{ body_html?: string }>>(
      `${base}/issues/${opts.number}/comments?per_page=100`,
      opts.token,
      rendered,
    ),
    ghJson<Array<{ body_html?: string }>>(
      `${base}/pulls/${opts.number}/comments?per_page=100`,
      opts.token,
      rendered,
    ),
  ]);

  return collectSignedAssets([
    pr.body_html,
    ...comments.map((c) => c.body_html),
    ...reviewComments.map((c) => c.body_html),
  ]);
}

const TIMELINE_PER_PAGE = 100;
/** Garde-fou : 10 pages = 1000 faits, très au-delà de la PR la plus bavarde. */
const TIMELINE_MAX_PAGES = 10;

/**
 * L'ACTIVITÉ de la PR (MIN-159) — reviews soumises, commits poussés, labels,
 * assignations, renommages, brouillon ↔ prête, fermeture, merge.
 *
 * Sur GitHub une PR est une issue, et tout ça vit sous `issues/{n}/timeline` :
 * un flux hétérogène où chaque `event` a sa propre forme. La normalisation est
 * dans `lib/pr-timeline` (pure, partagée avec le client) ; ici on ne fait que
 * paginer — du plus ANCIEN au plus récent, comme les commentaires.
 *
 * Les reviews en font partie (`event: "reviewed"`, avec leur corps) : c'est ce
 * qui manquait le plus au fil de minddy, une approbation motivée n'y étant
 * jusqu'ici visible nulle part.
 */
export async function listPullRequestTimeline(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PrTimelineEvent[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const all: RawGithubTimelineEvent[] = [];
  for (let page = 1; page <= TIMELINE_MAX_PAGES; page++) {
    const batch = await ghJson<RawGithubTimelineEvent[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${opts.number}/timeline` +
        `?per_page=${TIMELINE_PER_PAGE}&page=${page}`,
      opts.token,
    );
    all.push(...batch);
    // Page incomplète = dernière page.
    if (batch.length < TIMELINE_PER_PAGE) break;
  }
  return fromGithubTimeline(all);
}

interface RawReviewComment extends RawComment {
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string | null;
  start_line?: number | null;
  start_side?: string | null;
  in_reply_to_id?: number | null;
  diff_hunk?: string;
  pull_request_review_id?: number | null;
}

function toReviewComment(c: RawReviewComment): PullRequestReviewComment {
  return {
    id: c.id,
    body: c.body ?? "",
    path: c.path ?? "",
    line: c.line ?? null,
    original_line: c.original_line ?? null,
    side: c.side === "LEFT" ? "LEFT" : "RIGHT",
    // Remarque multi-lignes : `line` en est la DERNIÈRE ligne, `start_line` la
    // première. Sans relire ces deux-là, un commentaire posé sur les lignes 6 à
    // 15 revient de la forge comme un commentaire sur la 15 — il l'est, au sens
    // de l'ancre, mais l'écran ne dirait plus rien de la plage.
    start_line: c.start_line ?? null,
    start_side: c.start_side === "LEFT" ? "LEFT" : c.start_side === "RIGHT" ? "RIGHT" : null,
    in_reply_to_id: c.in_reply_to_id ?? null,
    review_id: c.pull_request_review_id ?? null,
    diff_hunk: c.diff_hunk ?? "",
    user: c.user ? { login: c.user.login ?? "", avatar_url: c.user.avatar_url ?? null } : null,
    created_at: c.created_at,
    html_url: c.html_url,
  };
}

const REVIEW_COMMENTS_PER_PAGE = 100;
/** Garde-fou : 10 pages = 1000 commentaires de review, très au-delà du réel. */
const REVIEW_COMMENTS_MAX_PAGES = 10;

/**
 * Commentaires de review de la PR — ceux ancrés à une ligne de code.
 *
 * PAGINÉ, contrairement à ses voisins de ce fichier : GitHub sert ce endpoint du
 * plus ANCIEN au plus récent, donc s'arrêter à la première page ferait disparaître
 * les commentaires les plus RÉCENTS — précisément ceux qui portent la demande du
 * jour, et que l'agent doit lire. Un fil de review dépasse 100 bien plus vite
 * qu'une PR ne dépasse 100 fichiers changés.
 */
export async function listPullRequestReviewComments(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewComment[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const all: PullRequestReviewComment[] = [];
  for (let page = 1; page <= REVIEW_COMMENTS_MAX_PAGES; page++) {
    const batch = await ghJson<RawReviewComment[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/comments` +
        `?per_page=${REVIEW_COMMENTS_PER_PAGE}&page=${page}`,
      opts.token,
    );
    all.push(...batch.map(toReviewComment));
    // Page incomplète = dernière page.
    if (batch.length < REVIEW_COMMENTS_PER_PAGE) break;
  }
  return all;
}

/**
 * Poste un commentaire de review sur une ligne (équivalent du « Add single
 * comment » de GitHub : il part tout de suite, hors review groupée).
 *
 * `commitId` DOIT être la tête de la PR (`PullRequestRef.headSha`), et la ligne
 * doit appartenir au diff : vérifié contre l'API réelle, une ligne hors diff —
 * typiquement une ligne de contexte dépliée dans la vue — se fait refuser en
 * **422** (`pull_request_review_thread.line: could not be resolved`). L'appelant
 * ne doit donc proposer l'affordance que sur les lignes des hunks d'origine.
 *
 * `startLine`/`startSide` sont là pour les commentaires multi-lignes (hors
 * périmètre aujourd'hui) : GitHub les accepte sur ce même endpoint.
 */
export async function createPullRequestReviewComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
  commitId: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
}): Promise<PullRequestReviewComment> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const created = await ghJson<RawReviewComment>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/comments`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: opts.body,
        commit_id: opts.commitId,
        path: opts.path,
        line: opts.line,
        side: opts.side,
        ...(opts.startLine != null ? { start_line: opts.startLine } : {}),
        ...(opts.startSide ? { start_side: opts.startSide } : {}),
      }),
    },
  );
  return toReviewComment(created);
}

/**
 * Répond dans un fil de review. `commentId` peut être n'importe quel commentaire
 * du fil : GitHub rattache la réponse à la RACINE (vérifié contre l'API — répondre
 * à une réponse renvoie `in_reply_to_id` = la racine). Les fils sont donc plats.
 */
export async function replyToPullRequestReviewComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  body: string;
}): Promise<PullRequestReviewComment> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const created = await ghJson<RawReviewComment>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/comments/${opts.commentId}/replies`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toReviewComment(created);
}

// ── Résolution des fils de review (MIN-139) ──────────────────────────────────

/** Même garde-fou que la pagination des commentaires : 10 × 100 fils. */
const REVIEW_THREADS_MAX_PAGES = 10;

interface RawReviewThreads {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          id?: string;
          isResolved?: boolean;
          resolvedBy?: { login?: string } | null;
          comments?: { nodes?: Array<{ databaseId?: number | null }> };
        } | null>;
      };
    } | null;
  } | null;
}

/**
 * État de résolution des fils de review — **le seul endroit où GitHub le dit**.
 *
 * L'API REST des commentaires (`listPullRequestReviewComments`) ne connaît que
 * des commentaires : ni l'id du FIL, ni sa résolution. Plutôt que de basculer
 * toute la lecture sur GraphQL, on ajoute CETTE requête à côté : elle rend, par
 * fil, son node id (seule clé des mutations) et l'id REST de son commentaire
 * racine (`databaseId`) — c'est-à-dire exactement la clé sur laquelle
 * `groupReviewThreads` regroupe déjà. Les deux listes s'apparient donc sans
 * heuristique.
 *
 * `comments(first:1)` suffit : GitHub sert les commentaires d'un fil du plus
 * ancien au plus récent, et le premier EST la racine (celui dont la REST dit
 * `in_reply_to_id: null`).
 */
export async function listPullRequestReviewThreads(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<ReviewThreadState[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const query = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        reviewThreads(first:100,after:$cursor){
          pageInfo{hasNextPage endCursor}
          nodes{id isResolved resolvedBy{login} comments(first:1){nodes{databaseId}}}
        }
      }
    }
  }`;

  const states: ReviewThreadState[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < REVIEW_THREADS_MAX_PAGES; page++) {
    const data: RawReviewThreads = await ghGraphql<RawReviewThreads>(opts.token, query, {
      owner,
      name: repo,
      number: opts.number,
      cursor,
    });
    const threads = data.repository?.pullRequest?.reviewThreads;
    for (const node of threads?.nodes ?? []) {
      const rootCommentId = node?.comments?.nodes?.[0]?.databaseId;
      // Un fil sans node id ou sans racine lisible n'est appariable à rien : on
      // le laisse tomber plutôt que d'inventer une clé.
      if (!node?.id || rootCommentId == null) continue;
      states.push({
        rootCommentId,
        threadId: node.id,
        resolved: !!node.isResolved,
        resolvedBy: node.resolvedBy?.login ?? null,
      });
    }
    if (!threads?.pageInfo?.hasNextPage || !threads.pageInfo.endCursor) break;
    cursor = threads.pageInfo.endCursor;
  }
  return states;
}

/**
 * Résout (ou rouvre) un fil de review. GraphQL SEULEMENT : la REST n'expose
 * aucune de ces deux opérations, et le fil s'adresse par son node id — celui que
 * `listPullRequestReviewThreads` vient de rendre, jamais un id de commentaire.
 */
export async function setPullRequestReviewThreadResolved(opts: {
  token: string;
  threadId: string;
  resolved: boolean;
}): Promise<void> {
  const mutation = opts.resolved
    ? "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}"
    : "mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}";
  await ghGraphql<unknown>(opts.token, mutation, { id: opts.threadId });
}

// ── Réactions emoji des commentaires de review (MIN-139) ─────────────────────

/** Enum GraphQL des réactions → vocabulaire canonique (`pr-review-reactions`). */
const GH_REACTION_BY_ENUM: Record<string, ReviewReactionContent> = {
  THUMBS_UP: "+1",
  THUMBS_DOWN: "-1",
  LAUGH: "laugh",
  HOORAY: "hooray",
  CONFUSED: "confused",
  HEART: "heart",
  ROCKET: "rocket",
  EYES: "eyes",
};

/** Un groupe de réaction GraphQL, tel que le rendent les DEUX requêtes (review et
    conversation) : le même fragment, donc la même forme. */
type RawReactionGroup = {
  content?: string;
  viewerHasReacted?: boolean;
  reactors?: { totalCount?: number } | null;
} | null;

/** Groupes GraphQL → réactions canoniques d'UN sujet. Les groupes à zéro sont
    écartés (GitHub garde un instant celui d'une réaction retirée : le rendre
    afficherait un emoji que plus personne n'a posé), et `mine` est forcé à faux
    quand le token n'est pas celui de l'humain — cf. `viewerIsActor`. */
function toReactions(
  commentId: number,
  groups: RawReactionGroup[] | null | undefined,
  viewerIsActor: boolean,
): ReviewCommentReaction[] {
  const out: ReviewCommentReaction[] = [];
  for (const group of groups ?? []) {
    const content = group?.content ? GH_REACTION_BY_ENUM[group.content] : undefined;
    const count = group?.reactors?.totalCount ?? 0;
    if (!content || count <= 0) continue;
    out.push({
      commentId,
      content,
      count,
      mine: viewerIsActor && !!group?.viewerHasReacted,
    });
  }
  return out;
}

/** Commentaires lus par fil : un fil de review qui dépasse est rarissime, et ce
    qui déborde ne perd que ses réactions — jamais son texte, servi par la REST. */
const REACTIONS_COMMENTS_PER_THREAD = 50;

interface RawReactionThreads {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          comments?: {
            nodes?: Array<{
              databaseId?: number | null;
              reactionGroups?: RawReactionGroup[] | null;
            } | null>;
          } | null;
        } | null>;
      };
    } | null;
  } | null;
}

/**
 * Réactions de TOUS les commentaires de review, en une requête GraphQL.
 *
 * La REST sait les compter (le payload d'un commentaire porte un objet
 * `reactions`) mais ne dit PAS si l'identité courante a déjà réagi — or c'est
 * exactement ce qui décide l'état du bouton. Le savoir en REST demanderait un
 * appel par commentaire ; `reactionGroups` le donne pour toute la PR d'un coup,
 * avec `viewerHasReacted` — « le viewer » étant, littéralement, le porteur du
 * token qui lit.
 *
 * D'où `viewerIsActor` (MIN-145) : à faux, le token est celui de l'installation
 * et `viewerHasReacted` parle du BOT. On force alors `mine: false` plutôt que de
 * rendre tel quel un « j'ai réagi » qui n'est celui de personne. Les comptes,
 * eux, sont les mêmes pour tout le monde.
 *
 * `commentIds` est ignoré : la requête part de la PR, pas des commentaires. Il
 * n'est là que parce que GitLab, lui, n'a rien d'équivalent et doit interroger
 * note par note.
 */
export async function listPullRequestReviewCommentReactions(opts: {
  token: string;
  repoFullName: string;
  number: number;
  viewerIsActor: boolean;
}): Promise<ReviewCommentReaction[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const query = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        reviewThreads(first:100,after:$cursor){
          pageInfo{hasNextPage endCursor}
          nodes{comments(first:${REACTIONS_COMMENTS_PER_THREAD}){nodes{databaseId reactionGroups{content viewerHasReacted reactors{totalCount}}}}}
        }
      }
    }
  }`;

  const reactions: ReviewCommentReaction[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < REVIEW_THREADS_MAX_PAGES; page++) {
    const data: RawReactionThreads = await ghGraphql<RawReactionThreads>(opts.token, query, {
      owner,
      name: repo,
      number: opts.number,
      cursor,
    });
    const threads = data.repository?.pullRequest?.reviewThreads;
    for (const thread of threads?.nodes ?? []) {
      for (const comment of thread?.comments?.nodes ?? []) {
        const commentId = comment?.databaseId;
        if (commentId == null) continue;
        reactions.push(
          ...toReactions(commentId, comment?.reactionGroups, opts.viewerIsActor),
        );
      }
    }
    if (!threads?.pageInfo?.hasNextPage || !threads.pageInfo.endCursor) break;
    cursor = threads.pageInfo.endCursor;
  }
  return reactions;
}

interface RawReaction {
  id?: number;
  content?: string;
  user?: { login?: string } | null;
}

/**
 * Le compte à qui APPARTIENT ce token (`GET /user`) — le pendant GitHub de
 * `gitlabCurrentUsername` de `mr.ts`. Il n'est demandé qu'en dernier recours :
 * le login de l'acteur voyage déjà avec l'appel, et cet aller-retour n'existe
 * que pour le rattraper quand il est PÉRIMÉ. Rend null si la question échoue —
 * un token d'installation, par exemple, n'a pas de porteur à nommer.
 */
async function githubCurrentLogin(token: string): Promise<string | null> {
  const me = await ghJson<{ login?: string }>(`${GITHUB_API_BASE}/user`, token).catch(
    () => null,
  );
  return me?.login ?? null;
}

/**
 * Pose ou retire une réaction sur un commentaire de review. REST des deux côtés
 * de la bascule : la mutation GraphQL équivalente s'adresse par node id, que la
 * palette n'a pas pour un commentaire encore SANS réaction.
 *
 * Geste humain (MIN-145) : le token est celui de l'ACTEUR, et `login` son compte
 * — la réaction à retirer se cherche par ce nom, parce que la REST ne sait pas
 * supprimer « la mienne » sans son id, et que la liste ne les distingue que par
 * leur auteur. Sans `login`, on lève : retomber sur le bot ferait exactement le
 * bug que ce ticket corrige, et poser une réaction qu'on ne saura jamais retirer
 * n'est pas mieux.
 *
 * Ce nom n'est qu'un RACCOURCI, jamais l'autorité : quand il ne désigne aucune
 * réaction du commentaire, c'est au token qu'on demande son porteur (cf. le
 * retrait plus bas). L'autorité, c'est lui — le nom stocké peut avoir vieilli.
 */
export async function setPullRequestReviewCommentReaction(opts: {
  token: string;
  repoFullName: string;
  commentId: number;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  return setGithubReaction({
    ...opts,
    base: `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/comments/${opts.commentId}/reactions`,
  });
}

/**
 * La bascule elle-même, à une COLLECTION de réactions près (`base`) : la même
 * mécanique sert les commentaires de review, ceux du fil, et le corps de la PR —
 * seule l'URL change d'une surface à l'autre.
 */
async function setGithubReaction(opts: {
  token: string;
  base: string;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  if (!opts.login) throw new Error("Reaction requires the actor's GitHub login");
  const base = opts.base;

  if (opts.on) {
    // Idempotent : GitHub rend 200 (et non 201) quand la réaction existait déjà.
    await ghJson<unknown>(base, opts.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: opts.content }),
    });
    return;
  }

  const existing = await ghJson<RawReaction[]>(
    `${base}?content=${encodeURIComponent(opts.content)}&per_page=100`,
    opts.token,
  );
  const reactionOf = (login: string | null) =>
    login
      ? (existing ?? []).find((r) => r.user?.login === login && r.content === opts.content)
      : undefined;

  let mine = reactionOf(opts.login);
  // `login` est un CACHE : il vient de `git_user_identities`, écrit à la
  // connexion du compte et jamais rafraîchi. Qui renomme son compte GitHub garde
  // un token valide et un `viewerHasReacted` juste — sa réaction s'allume donc —
  // mais ce nom-là ne désigne plus personne, et le retrait sortirait par le
  // `return` ci-dessous : chip toujours allumé, aucun message, un clic sans
  // effet à répéter indéfiniment. Le token, lui, ne périme pas son porteur : on
  // le lui demande. Seulement s'il reste un candidat — une liste vide n'a aucun
  // nom à départager, et c'est le cas courant du « déjà retiré ».
  if (!mine && (existing?.length ?? 0) > 0) {
    const current = await githubCurrentLogin(opts.token);
    if (current && current !== opts.login) mine = reactionOf(current);
  }
  // Rien à retirer : la bascule a déjà l'effet demandé, ce n'est pas une panne.
  if (mine?.id == null) return;
  await ghJson<unknown>(`${base}/${mine.id}`, opts.token, { method: "DELETE" });
}

// ── Réactions du FIL de conversation (MIN-147) ───────────────────────────────

/**
 * Collection de réactions visée par un id de commentaire de conversation.
 *
 * Une PR EST une issue chez GitHub : ses messages vivent sous
 * `issues/comments/{id}`, et son CORPS — le message qui ouvre le fil — sous
 * `issues/{n}` lui-même. `PR_BODY_COMMENT_ID` fait la bascule entre les deux.
 */
function conversationReactionsUrl(opts: {
  repoFullName: string;
  number: number;
  commentId: number;
}): string {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const subject =
    opts.commentId === PR_BODY_COMMENT_ID
      ? `issues/${opts.number}`
      : `issues/comments/${opts.commentId}`;
  return `${GITHUB_API_BASE}/repos/${owner}/${repo}/${subject}/reactions`;
}

interface RawConversationReactions {
  repository?: {
    pullRequest?: {
      reactionGroups?: RawReactionGroup[] | null;
      comments?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          databaseId?: number | null;
          reactionGroups?: RawReactionGroup[] | null;
        } | null>;
      } | null;
    } | null;
  } | null;
}

/** Pages de commentaires de fil lues pour leurs réactions — au-delà, seuls les
    emoji manquent : le TEXTE des commentaires vient de la REST, sans plafond. */
const CONVERSATION_REACTIONS_MAX_PAGES = 5;

/**
 * Réactions du fil de conversation — le corps de la PR ET tous ses commentaires,
 * en une requête GraphQL, exactement comme leur pendant de review.
 *
 * Le corps sort sous `PR_BODY_COMMENT_ID` : c'est un message de plus dans le fil
 * pour qui lit, un sujet à part pour qui écrit (cf. `conversationReactionsUrl`).
 *
 * `viewerIsActor` (MIN-145) : à faux, `viewerHasReacted` parle du BOT et non de
 * la personne qui regarde — tout sort en `mine: false`, les comptes restent justes.
 */
export async function listPullRequestConversationReactions(opts: {
  token: string;
  repoFullName: string;
  number: number;
  viewerIsActor: boolean;
}): Promise<ReviewCommentReaction[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const groups = "reactionGroups{content viewerHasReacted reactors{totalCount}}";
  const query = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        ${groups}
        comments(first:100,after:$cursor){
          pageInfo{hasNextPage endCursor}
          nodes{databaseId ${groups}}
        }
      }
    }
  }`;

  const reactions: ReviewCommentReaction[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < CONVERSATION_REACTIONS_MAX_PAGES; page++) {
    const data: RawConversationReactions = await ghGraphql<RawConversationReactions>(
      opts.token,
      query,
      { owner, name: repo, number: opts.number, cursor },
    );
    const pr = data.repository?.pullRequest;
    // Le corps ne vient QUE de la première page : il est porté par la PR, pas par
    // la pagination des commentaires, et le relire compterait ses réactions deux fois.
    if (page === 0) {
      reactions.push(
        ...toReactions(PR_BODY_COMMENT_ID, pr?.reactionGroups, opts.viewerIsActor),
      );
    }
    for (const comment of pr?.comments?.nodes ?? []) {
      const commentId = comment?.databaseId;
      if (commentId == null) continue;
      reactions.push(...toReactions(commentId, comment?.reactionGroups, opts.viewerIsActor));
    }
    const pageInfo = pr?.comments?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
  }
  return reactions;
}

/** Pose ou retire une réaction sur un message du fil — ou sur le corps de la PR
    (`PR_BODY_COMMENT_ID`). Même mécanique que la review, autre collection. */
export async function setPullRequestConversationReaction(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  return setGithubReaction({ ...opts, base: conversationReactionsUrl(opts) });
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
