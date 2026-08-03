import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isRepoProviderId, type RepoProviderId } from "@/lib/repo-providers";
import { issueIdentifier } from "@/lib/issue-constants";
import { displayName } from "@/lib/display-name";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import type { Forge } from "./forge";
import { toPrLineThreads, type PrReviewIssueContext, type PrReviewNote } from "./prompt";
import type { PullRequestState } from "./pull-requests";

/**
 * L'ancrage PULL REQUEST d'un run d'agent (MIN-168), résolu UNE fois et servi
 * tel quel à tout ce qui en a besoin.
 *
 * Sans ce module, chacun refaisait sa propre résolution : le lancement lisait
 * `pull_requests` pour choisir un projet, l'exécution la relisait pour trouver
 * les branches, les tools la reliraient pour le numéro, le prompt pour le titre.
 * Quatre lectures, quatre occasions de diverger — et une PR dont la tête a bougé
 * entre deux d'entre elles ferait commenter un diff que l'agent n'a pas lu.
 *
 * Ce que le run a besoin de savoir de sa PR tient dans un seul objet : chez quelle
 * forge, dans quel dépôt, sous quel numéro, entre quelles branches, à quel sha, et
 * pour quel ticket le cas échéant.
 */

export interface PrRunContext {
  /** Ligne `pull_requests` — l'entité, pas le numéro (cf. MIN-143). */
  id: string;
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
  title: string | null;
  url: string | null;
  state: PullRequestState;
  /** Branche RELUE. Absente = la PR n'a jamais été synchronisée en entier. */
  headBranch: string | null;
  baseBranch: string | null;
  /** Tête au moment de la lecture — le sha que la session aura relu. */
  headSha: string | null;
  /** Ticket que la PR met en œuvre, quand elle en porte un (MIN-143). */
  issueId: string | null;
}

const PR_RUN_COLUMNS =
  "id, provider, repo_full_name, number, title, url, state, head_branch, base_branch, head_sha, issue_id";

interface PrRunRow {
  id: string;
  provider: string;
  repo_full_name: string;
  number: number;
  title: string | null;
  url: string | null;
  state: string;
  head_branch: string | null;
  base_branch: string | null;
  head_sha: string | null;
  issue_id: string | null;
}

function toContext(row: PrRunRow): PrRunContext {
  return {
    id: row.id,
    // Même repli que `rowProvider` : un provider inconnu en base se lit GitHub
    // plutôt que de faire tomber la session.
    provider: isRepoProviderId(row.provider) ? row.provider : "github",
    repoFullName: row.repo_full_name,
    number: row.number,
    title: row.title,
    url: row.url,
    state: (row.state as PullRequestState) ?? "open",
    headBranch: row.head_branch,
    baseBranch: row.base_branch,
    headSha: row.head_sha,
    issueId: row.issue_id,
  };
}

/** La PR d'un run de review, ou null si elle n'existe plus. Service client. */
export async function loadPrRunContext(pullRequestId: string): Promise<PrRunContext | null> {
  const { data } = await getServiceClient()
    .from("pull_requests")
    .select(PR_RUN_COLUMNS)
    .eq("id", pullRequestId)
    .maybeSingle();
  return data ? toContext(data as PrRunRow) : null;
}

/**
 * La référence SERVEUR qui porte la tête d'une pull request — celle qui marche
 * même quand la branche vit dans un FORK.
 *
 * `head_branch` seul ne suffit pas : sur une PR de fork, cette branche n'existe
 * pas dans le dépôt de base, et un `git fetch` dessus ne trouve rien. Les deux
 * forges publient pour ça une ref virtuelle sur le dépôt de base, qui pointe le
 * commit de tête quel que soit l'endroit d'où il vient — `refs/pull/<n>/head`
 * chez GitHub, `refs/merge-requests/<iid>/head` chez GitLab. C'est elle qu'on
 * cherche, et c'est ce qui rend une review de fork possible.
 */
export function pullRequestHeadRef(provider: RepoProviderId, number: number): string {
  return provider === "gitlab"
    ? `refs/merge-requests/${number}/head`
    : `refs/pull/${number}/head`;
}

/**
 * Nom LOCAL de la branche de review dans la sandbox. Ce n'est pas une branche de
 * travail : rien n'y sera commité ni poussé (cf. `writesToRepo` dans
 * `execute.ts`). On garde néanmoins le nom de la branche de tête quand on le
 * connaît — l'agent lit `git status` et doit y reconnaître la PR qu'il relit.
 */
export function pullRequestLocalBranch(pr: PrRunContext): string {
  return pr.headBranch?.trim() || `pr-${pr.number}`;
}

// ── Ce que le dépôt ne contient pas ──────────────────────────────────────────

/** Derniers commentaires du ticket remontés — au-delà, l'amorce n'en garderait
 *  de toute façon que les plus récents. */
const ISSUE_COMMENTS_LIMIT = 40;

/** Type minimal d'une ligne de `comments`. */
type IssueCommentRow = { body: unknown; author_id: unknown; via_assistant: unknown };

/**
 * Le ticket que la PR met en œuvre — le contexte qui distingue « ce code est
 * correct » de « ce code fait ce qu'on lui demandait ». Best-effort : une PR sans
 * ticket (le cas normal d'une PR humaine, MIN-143) se relit très bien sans.
 *
 * Le PLAN et les COMMENTAIRES viennent ensemble, et c'est délibéré : le plan dit
 * ce qui avait été décidé, les commentaires disent ce dont on s'est écarté et
 * pourquoi. Le plan seul ferait signaler comme des fautes des écarts assumés et
 * argumentés — c'est-à-dire le contraire d'une relecture utile.
 */
export async function loadPrIssueContext(
  issueId: string | null,
): Promise<PrReviewIssueContext | null> {
  if (!issueId) return null;
  try {
    const service = getServiceClient();
    const [{ data }, { data: commentRows }] = await Promise.all([
      service
        .from("issues")
        .select("number, title, description, plan, projects(key)")
        .eq("id", issueId)
        .is("deleted_at", null)
        .maybeSingle(),
      // Les PLUS RÉCENTS d'abord côté SQL, remis dans l'ordre de lecture ensuite :
      // un `limit` ascendant garderait le début d'une discussion, jamais sa fin.
      service
        .from("comments")
        .select("body, author_id, via_assistant")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false })
        .limit(ISSUE_COMMENTS_LIMIT),
    ]);
    if (!data) return null;
    const key = ((data.projects as { key?: string } | null)?.key ?? "").toString();
    return {
      identifier: issueIdentifier(key, data.number as number),
      title: (data.title as string) ?? "",
      description: (data.description as string | null) ?? null,
      plan: (data.plan as string | null) ?? null,
      comments: await issueNotes(service, commentRows ?? []),
    };
  } catch (err) {
    console.error("[pr-run] issue context failed:", (err as Error).message);
    return null;
  }
}

/**
 * Les commentaires du ticket, nommés. Un commentaire de Numo se signe « Numo »
 * (son `author_id` est celui de la personne qui l'a déclenché — l'afficher ferait
 * dire à un humain ce que l'assistant a écrit) ; les autres passent par la
 * résolution de nom commune, jamais par l'e-mail brut.
 */
async function issueNotes(
  service: ReturnType<typeof getServiceClient>,
  rows: IssueCommentRow[],
): Promise<PrReviewNote[]> {
  const ordered = [...rows].reverse();
  const users = await fetchAuthUsersById(
    service,
    ordered.map((r) => r.author_id as string).filter(Boolean),
  );
  return ordered.map((row) => ({
    author: row.via_assistant
      ? "Numo"
      : displayName(toNamed(users.get(row.author_id as string)), "User"),
    body: (row.body as string | null) ?? "",
  }));
}

/** Repli journalisé d'une lecture de contexte : ce qui manque manque, la session a lieu. */
function unreadable<T>(what: string, fallback: T): (err: unknown) => T {
  return (err) => {
    console.error(`[pr-run] ${what} unreadable:`, (err as Error).message);
    return fallback;
  };
}

/** Tout ce que l'amorce d'une session de relecture tire d'ailleurs que du dépôt. */
export interface PrReviewBoot {
  issue: PrReviewIssueContext | null;
  files: Awaited<ReturnType<Forge["listPullRequestFiles"]>>["files"];
  filesTruncated: boolean;
  comments: PrReviewNote[];
  reviews: PrReviewNote[];
  lineThreads: ReturnType<typeof toPrLineThreads>;
  checks: Awaited<ReturnType<Forge["listChecks"]>> | null;
  /** Corps de la PR, relu chez la forge (la ligne `pull_requests` ne le porte pas). */
  body: string | null;
  /** Tête réelle au moment de l'amorce — le sha effectivement relu. */
  headSha: string | null;
}

/**
 * Charge, en parallèle, ce que la session de relecture ne peut PAS lire dans la
 * sandbox : le ticket, la discussion déjà tenue sur la PR, la CI, et la liste des
 * fichiers (le sommaire du diff). Le diff lui-même n'est pas chargé — l'agent le
 * lit dans le dépôt, en entier et à jour.
 *
 * Chaque lecture est BEST-EFFORT, liste par liste : une permission manquante sur
 * l'une (les reviews soumises n'ont pas la même garde que les commentaires selon
 * les installations) prive l'amorce de celle-là, pas des autres, et n'empêche pas
 * une relecture que quelqu'un paie.
 */
export async function loadPrReviewBoot(input: {
  forge: Forge;
  call: { token: string; repoFullName: string; number: number };
  pr: PrRunContext;
}): Promise<PrReviewBoot> {
  const { forge, call, pr } = input;

  const [ref, diff, comments, reviews, reviewComments, reviewThreads] = await Promise.all([
    forge.getPullRequest(call).catch(unreadable("pull request", null)),
    forge
      .listPullRequestFiles(call)
      .catch(unreadable("files", { files: [], truncated: false })),
    forge.listPullRequestComments(call).catch(unreadable("comments", [])),
    forge.listReviewMessages(call).catch(unreadable("submitted reviews", [])),
    forge.listPullRequestReviewComments(call).catch(unreadable("review comments", [])),
    forge.listReviewThreads(call).catch(unreadable("review threads", [])),
  ]);

  // La tête vue par la forge fait foi sur la ligne `pull_requests`, qui peut
  // dater du dernier webhook.
  const headSha = ref?.headSha ?? pr.headSha ?? null;
  const checks = headSha
    ? await forge
        .listChecks({ ...call, sha: headSha })
        .catch(unreadable("checks", null))
    : null;

  const issue = await loadPrIssueContext(pr.issueId);

  return {
    issue,
    files: diff.files,
    filesTruncated: diff.truncated,
    comments: comments.map((c) => ({ author: c.user?.login ?? "someone", body: c.body })),
    reviews: reviews.map((r) => ({
      author: r.author ?? "someone",
      about: r.state.replace(/_/g, " "),
      body: r.body,
    })),
    lineThreads: toPrLineThreads(reviewComments, reviewThreads),
    checks,
    body: ref?.body ?? null,
    headSha,
  };
}
