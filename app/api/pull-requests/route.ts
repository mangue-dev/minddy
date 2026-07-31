import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthedUser } from "@/lib/server/api-auth";
import { type RepoProviderId } from "@/lib/repo-providers";
import { resolveRepoCloneTargetForRepo } from "@/lib/server/agent/repo-access";
import { getRun } from "@/lib/server/agent/runs";
import {
  findPullRequest,
  listPullRequestsForUser,
  listVisibleRepos,
  needsRepoSync,
  readRepoSyncStates,
  repoSyncKey,
  resolvePrForRun,
  rowProvider,
  stampRepoSync,
  syncRepoPullRequests,
  type PullRequestState,
  type PullRequestWithIssue,
  type VisibleRepo,
} from "@/lib/server/agent/pull-requests";

/**
 * Liste GLOBALE des pull requests des dépôts liés, tous projets accessibles
 * confondus (MIN-66, élargie par MIN-143).
 *
 * Elle partait d'`agent_runs` et ne montrait donc que les PR de Numo — la moitié
 * du dépôt, sans le dire. Elle part maintenant de `pull_requests`, où une PR est
 * une ligne : celles de Numo y sont, celles des humains aussi. Le run n'est plus
 * le porteur, il est une DÉCORATION (« Numo retravaille », « relancer Numo »),
 * jointe quand elle existe.
 *
 * L'accès : RLS de `project_git_links` (le cookie client suffit) pour savoir
 * quels dépôts sont visibles, puis RLS de `pull_requests` pour les lignes.
 */

export const runtime = "nodejs";
// Un rattrapage BLOQUANT (dépôt jamais balayé) fait un aller-retour paginé chez
// la forge avant de répondre : la fenêtre par défaut d'une route ne suffit pas.
export const maxDuration = 120;

/** Combien de PR au maximum par réponse. Un dépôt actif en a des centaines. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// « Numo retravaille » = l'agent TRAVAILLE (queued/running). Un run au REPOS n'est
// PAS en train de retravailler la PR — sinon la PR resterait « en cours » pour
// toujours et les actions merge/reject seraient bloquées indéfiniment.
const WORKING_STATUSES = ["queued", "running"];

interface RunRow {
  id: string;
  status: string;
  pr_number: number | null;
  created_at: string;
  repo_link: { provider: string; repo_full_name: string | null } | null;
}

export interface PullRequestListItem {
  /** Identité de l'item — la PR, plus le run qui l'a ouverte (MIN-143). */
  prId: string;
  pr_number: number;
  pr_url: string | null;
  pr_state: PullRequestState;
  /** Provider du dépôt — pilote le vocabulaire PR/MR et les liens (MIN-69). */
  provider: RepoProviderId;
  title: string | null;
  /** Qui a ouvert la PR — ce qui distingue une PR de Numo d'une PR humaine. */
  author: { login: string; avatar_url: string | null } | null;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: { id: string; key: string; name: string } | null;
  /**
   * Run CANONIQUE de la PR (le plus ancien), ou null : une PR humaine n'en a
   * aucun. C'est lui qui porte les deep-links `?run=` historiques.
   */
  runId: string | null;
  /** Un run qui TRAVAILLE (queued/running) sur cette PR = « Numo retravaille ». */
  activeRunId: string | null;
  /** Un run ACTIF occupe l'issue → pas de nouvelle demande de changements (MIN-68). */
  busyRunId: string | null;
  /** TOUS les runs qui portent cette PR — un deep-link `?run=` matche n'importe lequel. */
  runIds: string[];
}

/** États servis par le filtre. `open` inclut les brouillons (c'en sont). */
const STATE_FILTERS: Record<string, PullRequestState[]> = {
  open: ["open", "draft"],
  merged: ["merged"],
  closed: ["closed"],
};

/**
 * Rattrapage d'un dépôt. BLOQUANT s'il n'a jamais été balayé — sans ça la page
 * s'afficherait vide sur un dépôt qu'on vient de lier. Simplement PÉRIMÉ, il
 * part dans `after()` : la réponse ne fait pas attendre l'utilisateur pour un
 * webhook perdu, et le prochain affichage sera juste.
 */
async function sweepRepo(userId: string, repo: VisibleRepo): Promise<boolean> {
  try {
    const target = await resolveRepoCloneTargetForRepo({
      userId,
      provider: repo.provider,
      repoFullName: repo.repoFullName,
    });
    if (!target) return false;
    const { truncated } = await syncRepoPullRequests({
      provider: repo.provider,
      repoFullName: repo.repoFullName,
      token: target.token,
    });
    return truncated;
  } catch (err) {
    console.error(
      `[pull-requests] sweep ${repo.repoFullName} failed:`,
      (err as Error).message,
    );
    // On tamponne quand même : une forge en panne ne doit pas faire re-tenter le
    // balayage à CHAQUE affichage de la page. La liste reste celle d'avant, et
    // la prochaine fenêtre réessaiera.
    await stampRepoSync(repo.provider, repo.repoFullName);
    return false;
  }
}

/**
 * PR visée par un deep-link (`?pr=` direct, `?run=` historique) quand la page
 * ne la contient pas — la liste est bornée, un lien ne l'est pas.
 *
 * Elle est lue en clé de service, donc l'accès se revérifie ici : la PR doit
 * appartenir à un dépôt que cet utilisateur voit. Renvoie null si elle est déjà
 * dans la page, introuvable, ou hors de son périmètre.
 */
async function pinnedRow(
  supabase: SupabaseClient,
  params: URLSearchParams,
  repos: VisibleRepo[],
  page: PullRequestWithIssue[],
): Promise<PullRequestWithIssue | null> {
  const prId = params.get("pr");
  const runId = params.get("run");
  if (!prId && !runId) return null;

  let pr = prId ? await findPullRequest(prId) : null;
  if (!pr && runId) {
    const run = await getRun(runId);
    pr = run ? await resolvePrForRun(run) : null;
  }
  if (!pr) return null;
  const found = pr;
  if (page.some((row) => row.id === found.id)) return null;

  const visible = new Set(repos.map((r) => repoSyncKey(r.provider, r.repoFullName)));
  if (!visible.has(repoSyncKey(rowProvider(found), found.repo_full_name))) return null;

  // Le ticket voyage avec, lu par le client AUTHENTIFIÉ : sa RLS le rend null
  // s'il est à la corbeille, exactement comme sur les lignes de la page.
  let issue: PullRequestWithIssue["issue"] = null;
  if (found.issue_id) {
    const { data } = await supabase
      .from("issues")
      .select("id, number, title, project_id")
      .eq("id", found.issue_id)
      .maybeSingle();
    issue = (data as PullRequestWithIssue["issue"]) ?? null;
  }
  return { ...found, issue };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state") ?? "open";
  const states = STATE_FILTERS[stateParam] ?? null; // null = tous les états
  const limit = Math.min(
    Math.max(Number.parseInt(params.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const repos = await listVisibleRepos(auth.supabase);
  if (repos.length === 0) {
    return NextResponse.json({ pullRequests: [], hasMore: false, truncated: false });
  }

  // ── Rattrapage ────────────────────────────────────────────────────────────
  const syncs = await readRepoSyncStates(repos);
  const seen = new Set<string>();
  // Coupure vue par un balayage BLOQUANT de cette requête : `syncs` a été lu
  // AVANT lui et dit encore « jamais balayé » pour ce dépôt. Sans ce report, le
  // tout premier affichage d'un dépôt de plus de MAX_PR_PAGES × 100 PR se
  // tairait sur la coupure — précisément le mensonge par omission qu'on corrige.
  let sweptTruncated = false;
  for (const repo of repos) {
    const key = repoSyncKey(repo.provider, repo.repoFullName);
    if (seen.has(key)) continue;
    seen.add(key);
    const state = syncs.get(key);
    if (!needsRepoSync(state)) continue;
    if (state) after(() => sweepRepo(auth.user.id, repo));
    else if (await sweepRepo(auth.user.id, repo)) sweptTruncated = true;
  }

  // ── Les PR ────────────────────────────────────────────────────────────────
  let rows: PullRequestWithIssue[];
  try {
    // +1 pour savoir s'il en reste, sans compter la table entière.
    rows = await listPullRequestsForUser(auth.supabase, repos, {
      limit: limit + 1,
      states: states ?? undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Deep-link ÉPINGLÉ. Sans ça, une PR plus ancienne que la page (un ticket
  // clos il y a des mois) manquerait de la liste, et la page retomberait
  // silencieusement sur la première — c'est-à-dire ouvrirait la PR d'un autre
  // ticket sans rien signaler.
  const pinned = await pinnedRow(auth.supabase, params, repos, page);
  if (pinned) page.unshift(pinned);

  // ── Les runs, en décoration ───────────────────────────────────────────────
  // RLS `agent_runs` = can_access_project : on ne voit que les siens. Restreint
  // aux numéros de CETTE page — la liste des runs d'un compte actif est longue,
  // et on n'a besoin que de ceux qui décorent ce qu'on affiche.
  const numbers = [...new Set(page.map((p) => p.number))];
  const runsByPr = new Map<string, RunRow[]>();
  if (numbers.length > 0) {
    const { data } = await auth.supabase
      .from("agent_runs")
      .select("id, status, pr_number, created_at, repo_link:project_git_links(provider, repo_full_name)")
      .in("pr_number", numbers)
      .order("created_at", { ascending: true });
    for (const run of (data ?? []) as unknown as RunRow[]) {
      const link = run.repo_link;
      if (!link?.repo_full_name || run.pr_number == null) continue;
      const key = `${link.provider}:${link.repo_full_name}:${run.pr_number}`;
      const list = runsByPr.get(key);
      if (list) list.push(run);
      else runsByPr.set(key, [run]);
    }
  }

  const projectById = new Map(repos.map((r) => [r.project.id, r.project]));
  const projectByRepo = new Map(
    repos.map((r) => [repoSyncKey(r.provider, r.repoFullName), r.project]),
  );

  const pullRequests: PullRequestListItem[] = page.map((row) => {
    const provider = rowProvider(row);
    const runs = runsByPr.get(`${provider}:${row.repo_full_name}:${row.number}`) ?? [];
    const working = runs.filter((r) => WORKING_STATUSES.includes(r.status));
    // `issue_id` renseigné mais ressource imbriquée nulle = ticket à la corbeille
    // (MIN-133). La PR reste dans la liste, simplement DÉTACHÉE : elle existe
    // chez la forge, et la cacher serait à nouveau montrer la moitié du dépôt.
    const issue = row.issue;
    return {
      prId: row.id,
      pr_number: row.number,
      pr_url: row.url,
      pr_state: row.state,
      provider,
      title: row.title,
      author: row.author_login
        ? { login: row.author_login, avatar_url: row.author_avatar_url }
        : null,
      head_branch: row.head_branch,
      created_at: row.opened_at ?? row.updated_at,
      updated_at: row.updated_at,
      issue: issue ? { id: issue.id, number: issue.number, title: issue.title } : null,
      project:
        (issue ? projectById.get(issue.project_id) : null) ??
        projectByRepo.get(repoSyncKey(provider, row.repo_full_name)) ??
        null,
      runId: runs[0]?.id ?? null,
      activeRunId: working[0]?.id ?? null,
      busyRunId: working[0]?.id ?? null,
      runIds: runs.map((r) => r.id),
    };
  });

  // Une pagination de forge coupée doit se VOIR : la liste n'est pas exhaustive,
  // et le taire, c'est mentir par omission — exactement ce que MIN-143 corrige.
  const truncated = sweptTruncated || [...seen].some((key) => syncs.get(key)?.truncated);

  return NextResponse.json({ pullRequests, hasMore, truncated });
}
