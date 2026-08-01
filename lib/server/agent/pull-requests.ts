import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { isRepoProviderId, type RepoProviderId } from "@/lib/repo-providers";
import { forgeFor } from "./forge";
import { issueRefFromPr, parseIssueRef } from "./pr-ingest-core";
import type { PullRequestRef } from "./pr";

/**
 * Accès données de la table `pull_requests` (MIN-143) — le point de passage
 * UNIQUE, en clé de service : l'ingestion est serveur (webhooks + balayages),
 * la table n'a aucune policy d'écriture.
 *
 * Une PR est identifiée par `(provider, repo_full_name, number)` : c'est un fait
 * du DÉPÔT, pas d'un projet. L'accès se résout à la LECTURE, en joignant
 * `project_git_links` — deux projets qui lient le même dépôt voient la même
 * ligne.
 */

export type PullRequestState = "draft" | "open" | "merged" | "closed";

export interface PullRequestRow {
  id: string;
  provider: string;
  repo_full_name: string;
  number: number;
  url: string | null;
  title: string | null;
  state: PullRequestState;
  author_login: string | null;
  author_avatar_url: string | null;
  head_branch: string | null;
  base_branch: string | null;
  head_sha: string | null;
  issue_id: string | null;
  opened_at: string | null;
  merged_at: string | null;
  updated_at: string;
  synced_at: string;
}

/** Colonnes servies partout (la table n'en a pas d'autre à cacher). */
const PR_COLUMNS =
  "id, provider, repo_full_name, number, url, title, state, author_login, author_avatar_url, " +
  "head_branch, base_branch, head_sha, issue_id, opened_at, merged_at, updated_at, synced_at";

/** Provider stocké → id connu, avec repli GitHub (même contrat que `getRepoProvider`). */
export function rowProvider(row: { provider: string }): RepoProviderId {
  return isRepoProviderId(row.provider) ? row.provider : "github";
}

/**
 * État minddy d'une PR lue chez la forge. Les deux forges parlent en
 * `state` + booléens ; minddy n'a que quatre mots, et l'ordre compte : fusionnée
 * l'emporte sur fermée (GitHub ferme une PR en la fusionnant), et un brouillon
 * n'est un brouillon que tant qu'il est ouvert.
 */
export function prStateFromRef(ref: PullRequestRef): PullRequestState {
  if (ref.merged) return "merged";
  if (ref.state === "closed") return "closed";
  return ref.draft ? "draft" : "open";
}

export interface PullRequestUpsert {
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
  state: PullRequestState;
  url?: string | null;
  title?: string | null;
  authorLogin?: string | null;
  authorAvatarUrl?: string | null;
  headBranch?: string | null;
  baseBranch?: string | null;
  headSha?: string | null;
  openedAt?: string | null;
  mergedAt?: string | null;
  /** Dernière mise à jour CHEZ LA FORGE — le tri de la liste (défaut : maintenant). */
  updatedAt?: string | null;
  /**
   * Rattachement au ticket. `undefined` = NE PAS TOUCHER : un webhook qui ne sait
   * pas résoudre le ticket ne doit pas effacer un rattachement déjà établi (par
   * un run, ou par un balayage qui avait lu une branche depuis supprimée).
   */
  issueId?: string | null;
}

/**
 * Ligne DB d'un upsert. Une clé ABSENTE du payload n'entre pas dans le
 * `ON CONFLICT DO UPDATE SET` de PostgREST : `undefined` veut donc dire « je ne
 * sais pas », et `null` « c'est vide ». La distinction porte tout le poids ici,
 * parce que les webhooks ne charrient pas les mêmes champs que l'API : un
 * `merge_request` GitLab ne dit pas qui est l'auteur, et écraser le login lu par
 * un balayage précédent ferait clignoter la liste à chaque événement.
 *
 * Seul `provider` / `repo_full_name` / `number` (l'identité) et `state` sont
 * obligatoires — on ne met pas une PR à jour sans savoir dans quel état elle est.
 */
function toRow(input: PullRequestUpsert): Record<string, unknown> {
  const row: Record<string, unknown> = {
    provider: input.provider,
    repo_full_name: input.repoFullName,
    number: input.number,
    state: input.state,
    // La forge donne sa date sur presque tous les chemins ; à défaut, l'écriture
    // EST l'événement le plus récent qu'on connaisse de cette PR.
    updated_at: input.updatedAt ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };
  const optional: Array<[string, unknown]> = [
    ["url", input.url],
    ["title", input.title],
    ["author_login", input.authorLogin],
    ["author_avatar_url", input.authorAvatarUrl],
    ["head_branch", input.headBranch],
    ["base_branch", input.baseBranch],
    ["head_sha", input.headSha],
    ["opened_at", input.openedAt],
    ["merged_at", input.mergedAt],
    ["issue_id", input.issueId],
  ];
  for (const [column, value] of optional) {
    if (value !== undefined) row[column] = value;
  }
  return row;
}

/**
 * Crée ou met à jour UNE pull request. Renvoie la ligne à jour, ou null si
 * l'écriture a échoué (best-effort : l'ingestion ne doit jamais faire tomber un
 * webhook).
 */
export async function upsertPullRequest(
  input: PullRequestUpsert,
): Promise<PullRequestRow | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("pull_requests")
    .upsert(toRow(input), { onConflict: "provider,repo_full_name,number" })
    .select(PR_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[pull-requests] upsert failed:", error.message);
    return null;
  }
  return (data as PullRequestRow | null) ?? null;
}

/** Pull request par son id minddy (service client — l'appelant authentifie). */
export async function findPullRequest(prId: string): Promise<PullRequestRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("pull_requests")
    .select(PR_COLUMNS)
    .eq("id", prId)
    .maybeSingle();
  return (data as PullRequestRow | null) ?? null;
}

/** Pull request par sa clé naturelle — la résolution run → PR des façades. */
export async function findPullRequestByNumber(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("pull_requests")
    .select(PR_COLUMNS)
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName)
    .eq("number", opts.number)
    .maybeSingle();
  return (data as PullRequestRow | null) ?? null;
}

/** Dépôt (provider + nom complet) d'un run, via sa liaison — ou null. */
export async function repoForRun(run: {
  repo_link_id: string | null;
  project_id: string;
}): Promise<{ provider: RepoProviderId; repoFullName: string } | null> {
  const service = getServiceClient();
  // `repo_link_id` est ON DELETE SET NULL : après un unlink, le run garde sa PR
  // mais plus son lien — on retombe alors sur la liaison COURANTE du projet.
  const query = service.from("project_git_links").select("provider, repo_full_name");
  const { data } = run.repo_link_id
    ? await query.eq("id", run.repo_link_id).maybeSingle()
    : await query.eq("project_id", run.project_id).maybeSingle();
  const row = data as { provider: string; repo_full_name: string | null } | null;
  if (!row?.repo_full_name || !isRepoProviderId(row.provider)) return null;
  return { provider: row.provider, repoFullName: row.repo_full_name };
}

/**
 * PR d'un run, créée à la volée si elle manque encore.
 *
 * Le chemin normal la crée à l'ouverture (`registerPr`) puis la tient à jour par
 * webhook. Le rattrapage compte quand même : sans webhook déployé (dev), ou pour
 * un run antérieur à cette table dont le backfill n'a rien pu faire, les façades
 * `agent-runs/[runId]/pr/*` doivent servir la PR quand même — sinon un
 * deep-link `?run=` tomberait sur un 404 pour une PR qui existe.
 */
export async function resolvePrForRun(run: {
  repo_link_id: string | null;
  project_id: string;
  issue_id: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: PullRequestState | null;
  branch_name: string | null;
  base_branch: string | null;
}): Promise<PullRequestRow | null> {
  if (run.pr_number == null) return null;
  const repo = await repoForRun(run);
  if (!repo) return null;
  const existing = await findPullRequestByNumber({ ...repo, number: run.pr_number });
  if (existing) return existing;
  return upsertPullRequest({
    provider: repo.provider,
    repoFullName: repo.repoFullName,
    number: run.pr_number,
    state: run.pr_state ?? "open",
    url: run.pr_url,
    headBranch: run.branch_name,
    baseBranch: run.base_branch,
    issueId: run.issue_id,
  });
}

/** Rattache une PR à un ticket (ou l'en détache). Best-effort. */
export async function setPullRequestIssue(
  prId: string,
  issueId: string | null,
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("pull_requests")
    .update({ issue_id: issueId })
    .eq("id", prId);
  if (error) console.error("[pull-requests] issue link failed:", error.message);
}

// ── Rattachement au ticket ───────────────────────────────────────────────────

interface RepoProject {
  id: string;
  key: string;
}

/** Projets (id + clé) qui lient ce dépôt — le périmètre des références valides. */
async function projectsForRepo(
  provider: RepoProviderId,
  repoFullName: string,
): Promise<RepoProject[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("project_git_links")
    .select("project:projects(id, key)")
    .eq("provider", provider)
    .eq("repo_full_name", repoFullName);
  // Relation to-one embarquée : objet au runtime, cast via unknown (cf. Supabase).
  return ((data ?? []) as unknown as Array<{ project: RepoProject | null }>)
    .map((r) => r.project)
    .filter((p): p is RepoProject => !!p);
}

/**
 * Ticket qu'une PR déclare porter, résolu en id minddy — ou null.
 *
 * Deux temps : la CONVENTION dit quel identifiant (`pr-ingest-core`, pur et
 * testé), la base dit s'il existe. Un ticket à la corbeille compte comme
 * inexistant : le rattacher ressusciterait une PR déjà disparue de la liste.
 */
export async function resolveIssueForPr(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  branch?: string | null;
  title?: string | null;
  body?: string | null;
  /** Projets du dépôt, quand l'appelant les a déjà (balayage : une fois pour toutes). */
  projects?: RepoProject[];
}): Promise<string | null> {
  const projects = opts.projects ?? (await projectsForRepo(opts.provider, opts.repoFullName));
  if (projects.length === 0) return null;
  const ref = issueRefFromPr({
    projectKeys: projects.map((p) => p.key),
    branch: opts.branch,
    title: opts.title,
    body: opts.body,
  });
  if (!ref) return null;
  const parsed = parseIssueRef(ref);
  if (!parsed) return null;
  const project = projects.find((p) => p.key === parsed.key);
  if (!project) return null;

  const service = getServiceClient();
  const { data } = await service
    .from("issues")
    .select("id")
    .eq("project_id", project.id)
    .eq("number", parsed.number)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ── Balayage d'un dépôt ──────────────────────────────────────────────────────

/**
 * Fenêtre de fraîcheur du balayage paresseux. Un webhook perdu ne doit pas
 * laisser la liste fausse pour toujours ; un cron qui balaierait TOUS les dépôts
 * liés coûterait cher pour ce seul rattrapage. On resynchronise donc à la
 * lecture, et pas plus souvent que ça.
 */
export const REPO_SYNC_TTL_MS = 15 * 60_000;

export interface RepoSyncState {
  provider: string;
  repo_full_name: string;
  synced_at: string;
  truncated: boolean;
}

/** État de balayage des dépôts demandés (clé `provider:repo`). */
export async function readRepoSyncStates(
  repos: Array<{ provider: RepoProviderId; repoFullName: string }>,
): Promise<Map<string, RepoSyncState>> {
  if (repos.length === 0) return new Map();
  const service = getServiceClient();
  const { data } = await service
    .from("pull_request_syncs")
    .select("provider, repo_full_name, synced_at, truncated")
    .in("repo_full_name", [...new Set(repos.map((r) => r.repoFullName))]);
  const map = new Map<string, RepoSyncState>();
  for (const row of (data ?? []) as RepoSyncState[]) {
    map.set(`${row.provider}:${row.repo_full_name}`, row);
  }
  return map;
}

export function repoSyncKey(provider: RepoProviderId, repoFullName: string): string {
  return `${provider}:${repoFullName}`;
}

/** Le dépôt a-t-il besoin d'un rattrapage ? (jamais balayé, ou trop vieux). */
export function needsRepoSync(state: RepoSyncState | undefined): boolean {
  if (!state) return true;
  return Date.now() - Date.parse(state.synced_at) > REPO_SYNC_TTL_MS;
}

/**
 * Tamponne un balayage sans rien avoir pu lire (forge en panne, token refusé).
 * Sans ce tampon, un dépôt en échec relancerait un balayage à CHAQUE affichage
 * de la page ; avec lui, il réessaie à la fenêtre suivante.
 */
export async function stampRepoSync(
  provider: RepoProviderId,
  repoFullName: string,
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service.from("pull_request_syncs").upsert(
    { provider, repo_full_name: repoFullName, synced_at: new Date().toISOString() },
    { onConflict: "provider,repo_full_name" },
  );
  if (error) console.error("[pull-requests] sync stamp failed:", error.message);
}

/**
 * Balaye TOUTES les PR d'un dépôt chez la forge et les met à jour dans minddy.
 *
 * C'est le rattrapage : à la liaison du dépôt (il faut bien un point de départ)
 * et à la lecture quand `synced_at` est vieux. Il n'y a pas de cron — le webhook
 * est le chemin normal, celui-ci ne répare que ses trous.
 *
 * Le rattachement au ticket n'écrase JAMAIS un lien déjà posé : un run a pu le
 * poser, ou un balayage précédent l'avoir lu sur une branche depuis supprimée.
 * On ne résout donc que les PR qui n'en ont pas.
 *
 * Renvoie le nombre de PR vues et si la pagination a été coupée. Best-effort :
 * une forge en panne ne doit pas faire tomber la page.
 */
export async function syncRepoPullRequests(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  token: string;
}): Promise<{ count: number; truncated: boolean }> {
  const forge = forgeFor(opts.provider);
  const { pulls, truncated } = await forge.listPullRequests({
    token: opts.token,
    repoFullName: opts.repoFullName,
  });

  const service = getServiceClient();
  const { data: existing } = await service
    .from("pull_requests")
    .select("number, issue_id")
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName);
  const issueByNumber = new Map(
    ((existing ?? []) as Array<{ number: number; issue_id: string | null }>).map((r) => [
      r.number,
      r.issue_id,
    ]),
  );

  const projects = await projectsForRepo(opts.provider, opts.repoFullName);
  const rows: Record<string, unknown>[] = [];
  for (const pull of pulls) {
    const known = issueByNumber.get(pull.number) ?? null;
    const issueId =
      known ??
      (await resolveIssueForPr({
        provider: opts.provider,
        repoFullName: opts.repoFullName,
        branch: pull.head,
        title: pull.title,
        body: pull.body,
        projects,
      }));
    rows.push(
      toRow({
        provider: opts.provider,
        repoFullName: opts.repoFullName,
        number: pull.number,
        state: prStateFromRef(pull),
        url: pull.url,
        title: pull.title ?? null,
        authorLogin: pull.user?.login ?? null,
        authorAvatarUrl: pull.user?.avatar_url ?? null,
        headBranch: pull.head ?? null,
        baseBranch: pull.base ?? null,
        headSha: pull.headSha ?? null,
        openedAt: pull.createdAt ?? null,
        mergedAt: pull.mergedAt ?? null,
        updatedAt: pull.updatedAt ?? pull.createdAt,
        issueId,
      }),
    );
  }

  if (rows.length > 0) {
    const { error } = await service
      .from("pull_requests")
      .upsert(rows, { onConflict: "provider,repo_full_name,number" });
    if (error) console.error("[pull-requests] sweep upsert failed:", error.message);
  }

  const { error: stampError } = await service.from("pull_request_syncs").upsert(
    {
      provider: opts.provider,
      repo_full_name: opts.repoFullName,
      synced_at: new Date().toISOString(),
      truncated,
    },
    { onConflict: "provider,repo_full_name" },
  );
  if (stampError) console.error("[pull-requests] sweep stamp failed:", stampError.message);

  return { count: pulls.length, truncated };
}

// ── Lecture pour l'utilisateur ───────────────────────────────────────────────

/** Dépôt lié, vu par un utilisateur — porte le projet qui donne l'accès. */
export interface VisibleRepo {
  provider: RepoProviderId;
  repoFullName: string;
  project: { id: string; key: string; name: string; icon_url: string | null };
}

/**
 * Dépôts que cet utilisateur peut voir, via le client AUTHENTIFIÉ (la RLS de
 * `project_git_links` fait le filtre — aucun filtre projet manuel). Un dépôt lié
 * par plusieurs de ses projets apparaît une fois par projet : c'est l'appelant
 * qui décide lequel afficher, et `resolveRepoCloneTargetForRepo` lequel utiliser
 * pour minter un token.
 */
export async function listVisibleRepos(
  supabase: SupabaseClient,
): Promise<VisibleRepo[]> {
  const { data } = await supabase
    .from("project_git_links")
    .select("provider, repo_full_name, project:projects(id, key, name, icon_url)");
  return ((data ?? []) as unknown as Array<{
    provider: string;
    repo_full_name: string | null;
    project: VisibleRepo["project"] | null;
  }>)
    .filter((r) => !!r.repo_full_name && !!r.project && isRepoProviderId(r.provider))
    .map((r) => ({
      provider: r.provider as RepoProviderId,
      repoFullName: r.repo_full_name as string,
      project: r.project as VisibleRepo["project"],
    }));
}

/** Une PR de la liste, avec son ticket et le projet de ce ticket (jointures RLS). */
export interface PullRequestWithIssue extends PullRequestRow {
  issue: { id: string; number: number; title: string; project_id: string } | null;
}

/**
 * PR des dépôts `repos`, la plus fraîche en tête, via le client AUTHENTIFIÉ.
 *
 * Le filtre `(provider, repo_full_name)` est appliqué en DEUX temps : la requête
 * élargit sur les noms de dépôts, puis l'appelant recoupe le couple exact. Un
 * `or()` PostgREST sur des couples serait fragile (les noms de dépôts partent
 * dans la grammaire du filtre) pour n'éviter qu'un cas d'homonymie inter-forges.
 */
export async function listPullRequestsForUser(
  supabase: SupabaseClient,
  repos: VisibleRepo[],
  opts?: { limit?: number; states?: PullRequestState[] },
): Promise<PullRequestWithIssue[]> {
  if (repos.length === 0) return [];
  const names = [...new Set(repos.map((r) => r.repoFullName))];
  const pairs = new Set(repos.map((r) => repoSyncKey(r.provider, r.repoFullName)));

  let query = supabase
    .from("pull_requests")
    .select(`${PR_COLUMNS}, issue:issues(id, number, title, project_id)`)
    .in("repo_full_name", names)
    .order("updated_at", { ascending: false });
  if (opts?.states) query = query.in("state", opts.states);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PullRequestWithIssue[]).filter((row) =>
    pairs.has(`${row.provider}:${row.repo_full_name}`),
  );
}
