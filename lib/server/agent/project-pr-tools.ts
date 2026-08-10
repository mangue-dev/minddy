import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import { forgeFor, isForgeApiError, type MergeMethod } from "./forge";
import { AI_REVIEW_MAX_INLINE_COMMENTS } from "./tools";
import { resolvePrCommentAnchor, signReviewBody } from "./pr-tools";
import {
  needsRepoSync,
  readRepoSyncStates,
  repoSyncKey,
  syncRepoPullRequests,
  type PullRequestState,
} from "./pull-requests";

/**
 * LES PULL REQUESTS DU PROJET, vues et agies depuis un run ORDINAIRE (MIN-267).
 *
 * Ce que `pr-tools.ts` sert, c'est LA pull request d'une session de RELECTURE :
 * un run ancré à une PR, sans tool d'édition, qui commente celle-là et pas une
 * autre. Il manquait l'autre moitié — un run de ticket, de carnet ou de ROUTINE
 * ne pouvait pas même SAVOIR qu'une pull request existait. « Fais-moi le point
 * des PR de la semaine tous les vendredis » n'était pas exprimable : la routine
 * partait lire le dépôt en shell, ce qui ne dit rien des relectures, des checks
 * ni des états.
 *
 * D'où cette famille, servie aux ancrages TICKET et CARNET (jamais à la
 * relecture, dont la lecture seule reste une propriété du jeu de tools) :
 *
 *  - `list_pull_requests` — l'inventaire, lu en BASE (`pull_requests`), pas chez
 *    la forge : c'est la même table que la page Pull Requests, donc la même
 *    liste, et un balayage paresseux la rafraîchit quand elle a vieilli. Lister
 *    quinze PR ne coûte alors pas quinze appels d'API.
 *  - `read_pull_request` — le détail d'UNE, chez la forge. Le diff par fichier
 *    n'y vient que sur `include_diff` : une routine qui parcourt la semaine lit
 *    quinze en-têtes, pas quinze diffs.
 *  - les écritures : commentaire de fil, commentaire de ligne, réponse à un fil,
 *    VERDICT de review, et changement d'ÉTAT (fusion comprise).
 *
 * ## Ce que ça change de la doctrine, et qui l'a décidé
 *
 * `pr-tools.ts` dit, depuis MIN-141 : « Numo donne un avis, il ne tient pas la
 * porte » — aucune de ses trois écritures ne soumet de verdict à la forge, parce
 * qu'un `APPROVE` posté par l'app satisferait une protection de branche et qu'un
 * `REQUEST_CHANGES` bloquerait la PR jusqu'à ce qu'un humain le lève.
 *
 * **Cette règle ne tient plus ici, et c'est un choix explicite du propriétaire
 * du produit** (2026-08-10) : `review_pull_request` soumet un vrai verdict et
 * `set_pull_request_state` fusionne. Une routine peut donc approuver et
 * fusionner sans qu'aucun humain n'intervienne. La contrepartie est celle-là,
 * elle est réelle, et elle est assumée — ce qui la borne, ce sont les
 * protections de branche du DÉPÔT, plus rien du côté de minddy.
 *
 * L'IDENTITÉ, elle, ne bouge pas : tout part sous le token d'installation, donc
 * sous le compte de minddy — un geste automatisé porte le nom de minddy (cf. la
 * table d'identité de `forge.ts`). Ce qui, ici, est exactement ce qu'on veut :
 * une PR fusionnée par une routine ne doit pas se lire comme fusionnée par la
 * personne qui a écrit la routine il y a trois mois.
 *
 * Un mot sur l'AUTO-REVIEW : GitHub refuse d'approuver une PR ouverte par le
 * même compte (422). C'est le cas NORMAL des PR de Numo, et `submitReview` le
 * rattrape déjà en publiant le verdict en commentaire — le résultat le dit
 * (`published: "comment"`), et le tool le répercute au modèle plutôt que de le
 * laisser croire à une approbation qui n'a pas eu lieu.
 */

export { PROJECT_PR_TOOL_NAMES } from "./platform-tool-names";

type ToolOutcome = { result: unknown; success: boolean };

/** Dépôt lié au projet du run, avec un token FRAIS. */
export interface ProjectRepoTarget {
  token: string;
  repoFullName: string;
  provider: RepoProviderId;
}

export interface ProjectPrToolContext {
  /** Projet du run — le périmètre de tout ce que cette famille voit. */
  projectId: string;
  /**
   * Dépôt + token, re-résolus À CHAQUE APPEL : un tour peut durer plus longtemps
   * que le token d'installation qui a cloné le dépôt. `null` = ce projet n'a pas
   * de dépôt lié (le tool le dit, il ne lève pas).
   */
  repo: () => Promise<ProjectRepoTarget | null>;
  /** Modèle du run — il signe ce que Numo écrit. */
  model: string;
  /** Langue de la signature : celle du lanceur. */
  locale: string;
  /**
   * Ancres posées par CE RUN — le MÊME objet que celui de la session de
   * relecture (`PrToolContext.inline`), persisté par `execute.ts` dans le
   * checkpoint. Le plafond est donc « 5 par run », TOUTES pull requests
   * confondues : quinze remarques ancrées restent du bruit, qu'elles tombent sur
   * une PR ou sur cinq.
   */
  inline: { used: number };
}

// ── Bornes de ce qu'on rend au modèle ───────────────────────────────────────

/** Corps de commentaire accepté — GitHub refuse au-delà de 65 536 caractères. */
const MAX_BODY_LENGTH = 65_536;
/** Patch par fichier, quand `include_diff` est demandé (même plafond que le MCP). */
const MAX_PATCH_CHARS = 4_000;
/** Fichiers listés par `read_pull_request` — au-delà, on dit combien manquent. */
const MAX_FILES = 100;
/** Messages du fil rendus, les plus RÉCENTS (une PR bavarde en porte des centaines). */
const MAX_COMMENTS = 30;
/** Fils de review rendus. */
const MAX_THREADS = 40;
/** Corps d'un message rendu — de quoi le lire, pas de quoi noyer le contexte. */
const MAX_COMMENT_CHARS = 2_000;
/** Lignes rendues par `list_pull_requests` (défaut 30). */
const MAX_LIST_LIMIT = 100;

const PR_STATES: PullRequestState[] = ["draft", "open", "merged", "closed"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : null;
}

function cap(text: string | null | undefined, max: number): string | null {
  if (!text) return text ?? null;
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text;
}

/** Le numéro de PR, exigé par tous les tools sauf la liste. */
function prNumber(args: Record<string, unknown>): number | { error: string } {
  const n = int(args.pull_request);
  if (n == null || n < 1) {
    return {
      error:
        "pull_request must be the NUMBER of a pull request of this project's repository — the one list_pull_requests returns.",
    };
  }
  return n;
}

// ── Inventaire ──────────────────────────────────────────────────────────────

/**
 * Rafraîchit la liste si elle a vieilli — le MÊME balayage paresseux que la page
 * Pull Requests (`needsRepoSync`, 15 min). Best-effort : une forge en panne rend
 * la liste telle qu'elle est en base, jamais une erreur. Sans lui, une routine
 * du vendredi matin lirait l'état laissé par le dernier webhook reçu, et un
 * webhook perdu se lirait comme « rien n'a bougé ».
 */
async function refreshIfStale(target: ProjectRepoTarget): Promise<void> {
  try {
    const states = await readRepoSyncStates([
      { provider: target.provider, repoFullName: target.repoFullName },
    ]);
    if (!needsRepoSync(states.get(repoSyncKey(target.provider, target.repoFullName)))) return;
    await syncRepoPullRequests({
      provider: target.provider,
      repoFullName: target.repoFullName,
      token: target.token,
    });
  } catch (err) {
    console.error("[project-pr-tools] sweep failed:", (err as Error).message);
  }
}

interface ListedRow {
  number: number;
  title: string | null;
  state: PullRequestState;
  url: string | null;
  author_login: string | null;
  head_branch: string | null;
  base_branch: string | null;
  opened_at: string | null;
  merged_at: string | null;
  updated_at: string;
  issue: { number: number; title: string; project: { key: string } | null } | null;
}

async function listPullRequests(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const target = await ctx.repo();
  if (!target) return noRepo();
  await refreshIfStale(target);

  const rawStates = Array.isArray(args.state)
    ? args.state.map(str)
    : str(args.state)
      ? [str(args.state)]
      : [];
  const states = rawStates.filter((s): s is PullRequestState =>
    (PR_STATES as string[]).includes(s),
  );
  if (rawStates.length > 0 && states.length === 0) {
    return {
      result: { error: `state must be one of: ${PR_STATES.join(", ")}.` },
      success: false,
    };
  }
  const author = str(args.author).replace(/^@/, "");
  const since = str(args.updated_since);
  if (since && Number.isNaN(Date.parse(since))) {
    return {
      result: {
        error:
          "updated_since must be a date the machine can read — '2026-08-03' or a full ISO timestamp.",
      },
      success: false,
    };
  }
  const limit = Math.min(Math.max(int(args.limit) ?? 30, 1), MAX_LIST_LIMIT);

  let query = getServiceClient()
    .from("pull_requests")
    .select(
      "number, title, state, url, author_login, head_branch, base_branch, opened_at, merged_at, updated_at, " +
        "issue:issues(number, title, project:projects(key))",
    )
    .eq("provider", target.provider)
    .eq("repo_full_name", target.repoFullName)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (states.length > 0) query = query.in("state", states);
  if (author) query = query.ilike("author_login", author);
  if (since) query = query.gte("updated_at", new Date(since).toISOString());

  const { data, error } = await query;
  if (error) return { result: { error: error.message }, success: false };

  const rows = (data ?? []) as unknown as ListedRow[];
  return {
    result: {
      repository: target.repoFullName,
      count: rows.length,
      // La liste est BORNÉE : le dire, plutôt que de laisser conclure « voilà
      // toutes les PR de la semaine » sur une fenêtre coupée au plafond.
      truncated: rows.length === limit,
      pull_requests: rows.map((row) => ({
        number: row.number,
        title: row.title,
        state: row.state,
        author: row.author_login,
        head: row.head_branch,
        base: row.base_branch,
        url: row.url,
        opened_at: row.opened_at,
        merged_at: row.merged_at,
        updated_at: row.updated_at,
        issue: row.issue
          ? {
              identifier: row.issue.project
                ? `${row.issue.project.key}-${row.issue.number}`
                : null,
              title: row.issue.title,
            }
          : null,
      })),
    },
    success: true,
  };
}

// ── Détail ──────────────────────────────────────────────────────────────────

async function readPullRequest(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const target = await ctx.repo();
  if (!target) return noRepo();
  const forge = forgeFor(target.provider);
  const call = { token: target.token, repoFullName: target.repoFullName, number };
  const includeDiff = args.include_diff === true;

  const pr = await forge.getPullRequest(call);
  // Tout le reste est BEST-EFFORT : un dépôt sans CI, une App sans la permission
  // des checks ou une forge qui n'a pas d'objet review ne doivent pas empêcher de
  // lire la pull request. `null` veut dire « pas lisible », jamais « rien ».
  const [diff, reviewComments, reviewThreads, comments, reviews, checks] = await Promise.all([
    forge.listPullRequestFiles(call).catch(() => ({ files: [], truncated: false })),
    forge.listPullRequestReviewComments(call).catch(() => []),
    forge.listReviewThreads(call).catch(() => []),
    forge.listPullRequestComments(call).catch(() => []),
    forge.listReviews(call).catch(() => null),
    pr.headSha ? forge.listChecks({ ...call, sha: pr.headSha }).catch(() => null) : null,
  ]);

  const threads = groupReviewThreads(reviewComments, reviewThreads);
  const files = diff.files.slice(0, MAX_FILES);

  return {
    result: {
      number: pr.number,
      url: pr.url,
      title: pr.title ?? null,
      body: cap(pr.body ?? null, MAX_COMMENT_CHARS),
      state: pr.merged ? "merged" : pr.state,
      draft: !!pr.draft,
      author: pr.user?.login ?? null,
      head: pr.head ?? null,
      base: pr.base ?? null,
      created_at: pr.createdAt ?? null,
      updated_at: pr.updatedAt ?? null,
      merged_at: pr.mergedAt ?? null,
      // `mergeable: null` veut dire INCONNU chez GitHub (le calcul est
      // asynchrone), pas « non » : le rendre tel quel plutôt qu'en booléen.
      mergeable: pr.mergeable ?? null,
      mergeable_state: pr.mergeableState ?? null,
      repository: target.repoFullName,
      checks: checks
        ? {
            state: checks.state,
            passing: checks.passing,
            total: checks.total,
            failing: checks.checks
              .filter((c) => c.state === "failure")
              .map((c) => ({ name: c.name, url: c.url, description: c.description })),
          }
        : null,
      reviews: reviews
        ? { approvals: reviews.approvals, changes_requested: reviews.changesRequested }
        : null,
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        ...(includeDiff ? { patch: cap(f.patch ?? null, MAX_PATCH_CHARS) } : {}),
      })),
      files_truncated: diff.truncated || diff.files.length > files.length,
      // Sans le diff, le dire : un modèle qui lit une liste de fichiers sans
      // patch doit savoir que le contenu s'obtient, pas qu'il n'existe pas.
      ...(includeDiff ? {} : { diff_omitted: "call again with include_diff: true to get the patches" }),
      review_comments: threads.slice(0, MAX_THREADS).map((thread) => ({
        id: thread.id,
        path: thread.root.path,
        line: thread.root.line,
        original_line: thread.root.original_line,
        side: thread.root.side,
        outdated: thread.root.line == null,
        resolved: !!thread.resolution?.resolved,
        url: thread.root.html_url,
        comments: thread.comments.map((c) => ({
          author: c.user?.login ?? null,
          body: cap(c.body, MAX_COMMENT_CHARS),
          created_at: c.created_at,
        })),
      })),
      comments: comments.slice(-MAX_COMMENTS).map((c) => ({
        author: c.user?.login ?? null,
        body: cap(c.body, MAX_COMMENT_CHARS),
        created_at: c.created_at,
      })),
    },
    success: true,
  };
}

// ── Écritures ───────────────────────────────────────────────────────────────

async function commentPullRequest(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const body = str(args.body);
  if (!body) return { result: { error: "body is required." }, success: false };
  const target = await ctx.repo();
  if (!target) return noRepo();

  const signed = signReviewBody(body, ctx.model, ctx.locale).slice(0, MAX_BODY_LENGTH);
  const comment = await forgeFor(target.provider).createPullRequestComment({
    token: target.token,
    repoFullName: target.repoFullName,
    number,
    body: signed,
  });
  return { result: { id: comment.id, url: comment.html_url }, success: true };
}

async function commentPullRequestLine(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const body = str(args.body);
  const path = str(args.path);
  const line = int(args.line);
  const side = args.side === "LEFT" ? "LEFT" : "RIGHT";
  if (!body) return { result: { error: "body is required." }, success: false };
  if (!path) return { result: { error: "path is required." }, success: false };
  if (line == null || line < 1) {
    return { result: { error: "line must be a positive integer." }, success: false };
  }

  // Le plafond AVANT tout appel de forge : dépassé, il n'y a rien à tenter.
  if (AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used <= 0) {
    return {
      result: {
        error:
          `You have already posted the ${AI_REVIEW_MAX_INLINE_COMMENTS} line comments this run allows, ` +
          `across every pull request. Say the rest in a pull request comment (comment_pull_request), most serious first.`,
      },
      success: false,
    };
  }

  const target = await ctx.repo();
  if (!target) return noRepo();
  const forge = forgeFor(target.provider);
  const call = { token: target.token, repoFullName: target.repoFullName, number };

  // Même validation d'ancre que la session de relecture : une ligne commentable
  // est une ligne du DIFF, et un refus rend les PLAGES qui le sont.
  const { files } = await forge.listPullRequestFiles(call);
  const anchor = resolvePrCommentAnchor(files, { path, line, side });
  if (!anchor.ok) return { result: { error: anchor.error }, success: false };

  return await forgeCall(async () => {
    const comment = await forge.createPullRequestReviewComment({
      ...call,
      body: body.slice(0, MAX_BODY_LENGTH),
      path: anchor.path,
      line,
      side,
    });
    ctx.inline.used++;
    return {
      result: {
        id: comment.id,
        path: anchor.path,
        line,
        side,
        url: comment.html_url,
        remaining: AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used,
      },
      success: true,
    };
  }, "The head may have moved since you read the diff — put the point in a pull request comment.");
}

async function replyPullRequestThread(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const body = str(args.body);
  const commentId = int(args.comment_id);
  if (!body) return { result: { error: "body is required." }, success: false };
  if (commentId == null || commentId <= 0) {
    return {
      result: {
        error:
          "comment_id must be the numeric id of a REVIEW comment of that pull request — read_pull_request lists one per thread.",
      },
      success: false,
    };
  }
  const target = await ctx.repo();
  if (!target) return noRepo();

  return await forgeCall(async () => {
    const reply = await forgeFor(target.provider).replyToPullRequestReviewComment({
      token: target.token,
      repoFullName: target.repoFullName,
      number,
      commentId,
      body: body.slice(0, MAX_BODY_LENGTH),
    });
    return { result: { id: reply.id, url: reply.html_url }, success: true };
  }, "Check that comment_id is a review comment (anchored to a line) of THIS pull request.");
}

const VERDICTS = ["approve", "request_changes", "comment"] as const;
type Verdict = (typeof VERDICTS)[number];

async function reviewPullRequest(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const verdict = str(args.verdict) as Verdict;
  const body = str(args.body);
  if (!VERDICTS.includes(verdict)) {
    return { result: { error: `verdict must be one of: ${VERDICTS.join(", ")}.` }, success: false };
  }
  if (!body) {
    return {
      result: { error: "body is required: a verdict without its reasons is not a review." },
      success: false,
    };
  }
  const target = await ctx.repo();
  if (!target) return noRepo();

  return await forgeCall(async () => {
    const submission = await forgeFor(target.provider).submitReview({
      token: target.token,
      repoFullName: target.repoFullName,
      number,
      verdict,
      body: signReviewBody(body, ctx.model, ctx.locale).slice(0, MAX_BODY_LENGTH),
    });
    return {
      result: {
        verdict,
        published: submission.published,
        // Le cas NORMAL d'une PR ouverte par Numo : la forge refuse l'auto-review
        // et le verdict part en commentaire. Le dire, sinon le modèle rapporte
        // « approuvée » sur une PR que personne n'a approuvée.
        ...(submission.published === "comment"
          ? {
              note:
                "The forge refused the formal verdict (a pull request cannot be reviewed by the account that opened it), " +
                "so it was posted as a comment carrying the verdict. Nothing was approved on the forge — say so.",
            }
          : {}),
      },
      success: true,
    };
  }, "Check the pull request is open and that the repository allows reviews from this app.");
}

const STATES = ["merged", "closed", "open", "ready_for_review"] as const;
type TargetState = (typeof STATES)[number];

async function setPullRequestState(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const state = str(args.state) as TargetState;
  if (!STATES.includes(state)) {
    return { result: { error: `state must be one of: ${STATES.join(", ")}.` }, success: false };
  }
  const target = await ctx.repo();
  if (!target) return noRepo();
  const forge = forgeFor(target.provider);
  const call = { token: target.token, repoFullName: target.repoFullName, number };

  if (state === "merged") {
    const method = str(args.merge_method) as MergeMethod;
    if (method && !forge.mergeMethods.includes(method)) {
      return {
        result: {
          error: `merge_method '${method}' is not offered by ${forge.provider}. Available: ${forge.mergeMethods.join(", ")}.`,
        },
        success: false,
      };
    }
    return await forgeCall(async () => {
      await forge.mergePullRequest({ ...call, ...(method ? { method } : {}) });
      return { result: { number, state: "merged", method: method || null }, success: true };
    }, "A merge is refused when the branch is protected, the checks are red, the approvals are missing or the branch conflicts — read_pull_request shows mergeable_state.");
  }

  if (state === "closed") {
    return await forgeCall(async () => {
      await forge.closePullRequest(call);
      return { result: { number, state: "closed" }, success: true };
    }, "");
  }

  if (state === "open") {
    return await forgeCall(async () => {
      const pr = await forge.reopenPullRequest(call);
      return { result: { number, state: pr.merged ? "merged" : pr.state }, success: true };
    }, "A merged pull request cannot be reopened.");
  }

  // `ready_for_review` : GitHub n'adresse la mutation que par le node id
  // GraphQL, que seul le GET d'UNE pull request sert (cf. `forge.ts`).
  return await forgeCall(async () => {
    const pr = await forge.getPullRequest(call);
    if (!pr.draft) {
      return {
        result: { number, state: "open", note: "This pull request was not a draft — nothing to do." },
        success: true,
      };
    }
    await forge.markReadyForReview({ ...call, ...(pr.nodeId ? { nodeId: pr.nodeId } : {}) });
    return { result: { number, state: "open" }, success: true };
  }, "");
}

// ── Plomberie ───────────────────────────────────────────────────────────────

function noRepo(): ToolOutcome {
  return {
    result: {
      error:
        "This project has no linked repository, so it has no pull requests. Say so instead of retrying.",
    },
    success: false,
  };
}

/**
 * Un refus de FORGE rendu comme une erreur de tool, jamais comme une exception :
 * le modèle peut corriger un 422 s'il lit ce que la forge a dit, il ne peut que
 * subir un tour qui tombe. `hint` dit ce qu'il y a à en faire.
 */
async function forgeCall(
  fn: () => Promise<ToolOutcome>,
  hint: string,
): Promise<ToolOutcome> {
  try {
    return await fn();
  } catch (err) {
    if (isForgeApiError(err)) {
      return {
        result: {
          error: `The forge refused this (${err.status}): ${err.message}.${hint ? ` ${hint}` : ""}`,
        },
        success: false,
      };
    }
    throw err;
  }
}

/** Exécute un tool de cette famille. L'appelant a déjà routé sur les noms. */
export async function executeProjectPrTool(
  ctx: ProjectPrToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "list_pull_requests":
        return await listPullRequests(ctx, args);
      case "read_pull_request":
        return await readPullRequest(ctx, args);
      case "comment_pull_request":
        return await commentPullRequest(ctx, args);
      case "comment_pull_request_line":
        return await commentPullRequestLine(ctx, args);
      case "reply_pull_request_thread":
        return await replyPullRequestThread(ctx, args);
      case "review_pull_request":
        return await reviewPullRequest(ctx, args);
      case "set_pull_request_state":
        return await setPullRequestState(ctx, args);
      default:
        return { result: { error: `Unknown pull request tool: ${name}` }, success: false };
    }
  } catch (err) {
    if (isForgeApiError(err)) {
      return {
        result: { error: `The forge refused this (${err.status}): ${err.message}` },
        success: false,
      };
    }
    return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
  }
}
