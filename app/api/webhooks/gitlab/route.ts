import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { syncPrState, findRunsForPr, type SyncedPrRun } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import {
  applyForgePrToIssue,
  isPrActionEcho,
  recordForgePrActionEvents,
  recordForgePrGesture,
  notifyForgePrAction,
} from "@/lib/server/agent/pr-activity";
import {
  isServiceAccountGesture,
  prActionForMergeRequest,
  prActionForNote,
} from "@/lib/server/agent/pr-webhook-core";
import { normalizeGitlabIssueEvent } from "@/lib/server/git/issue-sync-core";
import { syncRemoteIssueEvent } from "@/lib/server/git/issue-sync";
import {
  findPullRequestByNumber,
  resolveIssueForPr,
  upsertPullRequest,
  type PullRequestState,
} from "@/lib/server/agent/pull-requests";
import { handleForgeNumoMention } from "@/lib/server/agent/pr-mention";
import { getServiceClient } from "@/lib/supabase-service";
import type { AgentRun } from "@/lib/server/agent/runs";

/**
 * POST /api/webhooks/gitlab — récepteur webhook GitLab (MIN-69), pendant de
 * /api/webhooks/github pour les Merge Requests de l'agent de code.
 *
 * On vérifie le secret (`X-Gitlab-Token`, comparaison à temps constant) puis on
 * traite le hook `Merge Request Hook` (object_kind `merge_request`) :
 *  - toute action utile → INGÈRE la MR dans `pull_requests` (MIN-143 : de Numo
 *    ou d'un humain, c'est le même fait du dépôt).
 *  - action `merge` / `close` / `reopen` / `open` → met à jour `agent_runs.pr_state`
 *    (la review in-app reflète le vrai état côté GitLab) ET, pour un geste fait
 *    DIRECTEMENT sur GitLab, trace « ouvert / accepté / refusé la MR » dans
 *    l'activité de l'issue liée. L'action `update` sert la bascule BROUILLON
 *    (MIN-138) — GitLab n'a pas d'action dédiée, cf. `mapMrState` — et, quand elle
 *    porte un `oldrev`, le PUSH : « a commité sur la MR ».
 *  - action `approved` / `approval` → trace « approuvé la MR ». GitLab n'a PAS de
 *    review « request changes » native : `pr_changes_requested` ne vient que de
 *    l'action in-app. `unapproved`/`unapproval` sont IGNORÉS (aucun événement
 *    minddy correspondant — retirer une approbation n'est pas une action tracée,
 *    GitHub n'a d'ailleurs pas d'équivalent).
 * Le hook `Note Hook` (object_kind `note`) porte les COMMENTAIRES : sur une merge
 * request, ils tracent « commenté la MR » (message de fil) ou « commenté le code
 * de la MR » (note ancrée dans le diff), et déclenchent la relecture de Numo si
 * le message le MENTIONNE (MIN-162, cf. `lib/server/agent/pr-mention`). Le hook `Issue Hook` (object_kind
 * `issue`) porte la synchronisation unidirectionnelle des issues du dépôt vers
 * les projets qui l'ont activée (MIN-97) — sens unique : minddy n'écrit jamais
 * chez GitLab. Tout autre object_kind est acquitté sans traitement.
 *
 * PRÉREQUIS : le hook du dépôt doit être abonné à `note_events` — c'est fait à sa
 * création et à chaque passage d'`ensureGitlabIssuesHook`, mais un dépôt lié
 * AVANT cette version garde un hook sans notes tant qu'il n'y repasse pas.
 *
 * Anti-doublon : les actions minddy in-app (merge/close) sont faites avec le token
 * OAuth du COMPTE CONNECTÉ du dépôt — leur écho webhook porte ce compte comme
 * `user`. On ignore donc l'ACTIVITÉ des merge/close émis par le compte de service
 * (l'état, lui, est toujours synchronisé — idempotent). Revers assumé : un merge
 * fait à la main sur gitlab.com par ce même compte n'est pas tracé — impossible à
 * distinguer de l'écho, même compromis que le filtre bot GitHub.
 *
 * Fail-closed intégral : token invalide → 401 ; secret non déployé → acquitté
 * SANS traitement (ce récepteur mute l'état, il n'accepte rien d'invérifiable).
 */

/**
 * action GitLab → pr_state minddy (null = pas de changement d'état à écrire).
 *
 * Le BROUILLON n'a pas d'action dédiée chez GitLab, contrairement aux
 * `converted_to_draft` / `ready_for_review` de GitHub : il est porté par le
 * préfixe `Draft:` du titre, et sa bascule arrive en `action: "update"` avec
 * `object_attributes.draft`. On ne lit donc ce booléen que sur un `update` qui
 * TOUCHE au titre ou au brouillon — sinon une simple retouche de description
 * réécrirait `pr_state` (et, en cascade, le statut du ticket) à chaque édition.
 * Le garde `state === opened` protège en plus les MR déjà fermées ou fusionnées.
 */
function mapMrState(payload: MergeRequestEvent): AgentRun["pr_state"] | null {
  const attrs = payload.object_attributes ?? {};
  switch (attrs.action) {
    case "merge":
      return "merged";
    case "close":
      return "closed";
    case "open":
    case "reopen":
      return attrs.draft ? "draft" : "open";
    case "update": {
      const changes = payload.changes ?? {};
      const touchesDraft = changes.draft !== undefined || changes.title !== undefined;
      if (!touchesDraft) return null;
      if (attrs.state !== "opened" && attrs.state !== "locked") return null;
      return attrs.draft ? "draft" : "open";
    }
    default:
      return null;
  }
}

interface GitlabUserPayload {
  id?: number;
  username?: string;
}

/** L'id du compte de forge de l'acteur, en texte (colonne `provider_account_id`). */
function actorAccountId(user: GitlabUserPayload | undefined | null): string | null {
  return user?.id != null ? String(user.id) : null;
}

interface MergeRequestAttributes {
  iid?: number;
  action?: string;
  state?: string;
  url?: string;
  /** Ancienne tête : présente sur le seul `update` qui porte un PUSH. */
  oldrev?: string;
  /** MR brouillon — GitLab le dérive du préfixe `Draft:` du titre. */
  draft?: boolean;
  work_in_progress?: boolean;
  title?: string;
  description?: string | null;
  source_branch?: string;
  target_branch?: string;
  last_commit?: { id?: string } | null;
  created_at?: string;
  updated_at?: string;
}

interface MergeRequestEvent {
  object_kind?: string;
  user?: GitlabUserPayload;
  project?: { path_with_namespace?: string };
  object_attributes?: MergeRequestAttributes;
  /** Champs modifiés par un `update` (présents seulement sur cette action). */
  changes?: { title?: unknown; draft?: unknown };
}

/**
 * Actions qui décrivent un état de MR à INGÉRER (MIN-143) — plus large que
 * `mapMrState`, qui ne pilote que le cycle de vie des runs et du ticket. `update`
 * en fait partie : chez GitLab c'est aussi ce qui porte un nouveau push, un
 * changement de titre ou la bascule brouillon.
 */
const INGESTED_MR_ACTIONS = new Set(["open", "reopen", "close", "merge", "update"]);

/** État minddy de la MR telle que le payload la décrit. */
function payloadMrState(attrs: MergeRequestAttributes): PullRequestState {
  if (attrs.state === "merged") return "merged";
  if (attrs.state === "closed") return "closed";
  return attrs.draft || attrs.work_in_progress ? "draft" : "open";
}

/**
 * Enregistre la MR chez minddy — de Numo ou d'un humain, c'est le même fait du
 * dépôt (MIN-143).
 *
 * L'AUTEUR n'est renseigné que sur `open` : le `user` d'un hook GitLab est celui
 * qui a DÉCLENCHÉ l'événement, pas l'auteur de la MR (`object_attributes` ne
 * porte qu'un `author_id` numérique, sans login). Le laisser `undefined` sur les
 * autres actions préserve ce qu'un balayage a déjà lu chez l'API plutôt que de
 * l'écraser par le nom du dernier passant.
 */
async function ingestMergeRequest(
  repoFullName: string,
  iid: number,
  attrs: MergeRequestAttributes,
  actor: GitlabUserPayload | undefined,
): Promise<void> {
  const issueId = await resolveIssueForPr({
    provider: "gitlab",
    repoFullName,
    branch: attrs.source_branch,
    title: attrs.title,
    body: attrs.description,
  });
  const isOpen = attrs.action === "open";
  await upsertPullRequest({
    provider: "gitlab",
    repoFullName,
    number: iid,
    state: payloadMrState(attrs),
    url: attrs.url ?? null,
    title: attrs.title ?? null,
    authorLogin: isOpen ? (actor?.username ?? null) : undefined,
    headBranch: attrs.source_branch ?? null,
    baseBranch: attrs.target_branch ?? null,
    headSha: attrs.last_commit?.id ?? null,
    openedAt: attrs.created_at ?? null,
    updatedAt: attrs.updated_at,
    issueId: issueId ?? undefined,
  });
}

/**
 * L'acteur du hook est-il le compte de service du dépôt (le compte GitLab dont
 * minddy utilise le token) ? Comparé par id de compte (provider_account_id),
 * repli sur le login. Plusieurs projets peuvent lier le même dépôt via des
 * connexions différentes → on collecte toutes les identités liées.
 *
 * C'est le modèle dont `forgeAccountMatches` (lib/server/agent/pr-activity.ts,
 * MIN-154) hérite, à une tolérance près : ici un login qui gagne contre un id
 * DIFFÉRENT est sans conséquence — on reconnaît un compte de service, on
 * n'attribue le geste à personne.
 */
async function isServiceAccount(
  repoFullName: string,
  user: GitlabUserPayload | undefined,
): Promise<boolean> {
  if (!user || (user.id == null && !user.username)) return false;
  const service = getServiceClient();
  const { data } = await service
    .from("project_git_links")
    .select("git_connections(provider_account_id, account_login)")
    .eq("repo_full_name", repoFullName)
    .eq("provider", "gitlab");
  // Relation to-one embarquée : objet au runtime, cast via unknown (cf. Supabase).
  const connections = ((data ?? []) as unknown as Array<{
    git_connections: { provider_account_id: string | null; account_login: string | null } | null;
  }>).map((r) => r.git_connections);
  return connections.some(
    (c) =>
      c &&
      ((user.id != null && c.provider_account_id === String(user.id)) ||
        (!!user.username && c.account_login === user.username)),
  );
}

async function handleMergeRequest(payload: MergeRequestEvent): Promise<void> {
  const attrs = payload.object_attributes ?? {};
  const action = attrs.action ?? "";
  const iid = attrs.iid;
  const repoFullName = payload.project?.path_with_namespace;
  if (iid == null || !repoFullName) return;

  // Ingestion D'ABORD (MIN-143) : la MR existe chez minddy, de Numo ou d'un
  // humain. Elle doit passer AVANT le garde `runs.length === 0` plus bas, qui
  // existe précisément pour ignorer les MR humaines — c'est ce garde qui les
  // rendait invisibles.
  if (INGESTED_MR_ACTIONS.has(action)) {
    await ingestMergeRequest(repoFullName, iid, attrs, payload.user);
  }

  const prState = mapMrState(payload);
  const actionType = prActionForMergeRequest(attrs);
  if (!prState && !actionType) return;

  // Runs concernés. merge/close/reopen/open recalent pr_state au passage.
  const runs: SyncedPrRun[] = prState
    ? await syncPrState({
        repoFullName,
        prNumber: iid,
        prState,
        prUrl: attrs.url ?? null,
        provider: "gitlab",
      })
    : await findRunsForPr({ repoFullName, prNumber: iid, provider: "gitlab" });

  // AUCUN run : c'est une MR humaine (MIN-143). Ce garde renvoyait sec — c'est
  // lui qui les rendait sans effet sur les tickets. Elle peut pourtant en porter
  // un, par sa branche, son titre ou une ligne de fermeture : la fusionner sur
  // GitLab doit produire ce que la fusionner depuis minddy produit.
  if (runs.length === 0) {
    const echoed =
      !!actionType &&
      isServiceAccountGesture(actionType) &&
      (await isServiceAccount(repoFullName, payload.user));
    await applyForgePrToIssue({
      provider: "gitlab",
      repoFullName,
      prNumber: iid,
      prState,
      actionType: echoed ? null : actionType,
      accountId: actorAccountId(payload.user),
      login: payload.user?.username ?? null,
    });
    return;
  }

  // Aligne le statut des issues sur le nouvel état MR (MIN-46) :
  // merged→done, closed→todo, open/reopen→in_review.
  if (prState) {
    for (const run of runs) {
      // `issueId` null = run carnet (MIN-84) : aucune issue à aligner.
      if (run.createdBy && run.issueId) {
        await syncIssueStatusFromPr({ issueId: run.issueId, actorId: run.createdBy, prState });
      }
    }
  }

  if (!actionType) return;
  // Écho d'une action in-app → déjà tracée par la route avec l'acteur humain : on
  // ne re-trace pas. Deux lectures nécessaires : le compte de service (le geste
  // d'un AGENT part encore du compte qui a lié le dépôt) et l'événement déjà
  // écrit — depuis MIN-144 un geste humain part du compte git de la personne,
  // qui n'est celui du lien que pour qui a lié le dépôt.
  const echo =
    (isServiceAccountGesture(actionType) &&
      (await isServiceAccount(repoFullName, payload.user))) ||
    (await isPrActionEcho({
      issueIds: runs.map((r) => r.issueId),
      type: actionType,
      prNumber: iid,
      provider: "gitlab",
      accountId: actorAccountId(payload.user),
      login: payload.user?.username ?? null,
    }));
  if (echo) return;

  await recordForgePrActionEvents({
    runs,
    type: actionType,
    prNumber: iid,
    provider: "gitlab",
    login: payload.user?.username ?? null,
  });
  // Inbox : l'auteur du run apprend qu'on a approuvé ou fusionné sa MR (MIN-138).
  await notifyForgePrAction({ runs, type: actionType, actorLogin: payload.user?.username ?? null });
}

/** Une note (commentaire) telle que GitLab la livre — `Note Hook`. */
interface NoteEvent {
  object_kind?: string;
  user?: GitlabUserPayload;
  project?: { path_with_namespace?: string };
  /** `note` porte le corps du message : c'est le seul signal d'un `@numo` écrit
      depuis GitLab (MIN-162). */
  object_attributes?: { noteable_type?: string; position?: unknown; note?: string | null };
  /** Présent quand la note porte sur une merge request. */
  merge_request?: { iid?: number };
}

/**
 * Commentaire sur une merge request → activité du ticket. Message de fil ou
 * remarque de ligne selon l'ancrage (cf. `prActionForNote`).
 *
 * Pas de garde « compte de service » ici : personne ne commente sous ce token —
 * un commentaire posté depuis minddy part du compte git de la PERSONNE, et c'est
 * `isPrActionEcho` (dans `recordForgePrGesture`) qui reconnaît son écho. L'y
 * ajouter rendrait muets, pour toujours, les commentaires de celui qui a lié le
 * dépôt.
 */
async function handleNote(payload: NoteEvent): Promise<void> {
  const type = prActionForNote(payload.object_attributes ?? {});
  const iid = payload.merge_request?.iid;
  const repoFullName = payload.project?.path_with_namespace;
  if (!type || iid == null || !repoFullName) return;
  await recordForgePrGesture({
    provider: "gitlab",
    repoFullName,
    prNumber: iid,
    type,
    accountId: actorAccountId(payload.user),
    login: payload.user?.username ?? null,
  });

  // `@numo` écrit depuis GitLab (MIN-162) — le pendant exact du récepteur
  // GitHub. L'anti-écho d'un message posté depuis minddy est celui que
  // `recordForgePrGesture` vient d'appliquer : on le rejoue ici sur le même
  // geste, parce que la trace et la passe ne se déclenchent pas au même endroit.
  if (!payload.object_attributes?.note) return;
  const pr = await findPullRequestByNumber({
    provider: "gitlab",
    repoFullName,
    number: iid,
  });
  if (!pr) return;
  const echo = await isPrActionEcho({
    issueIds: [pr.issue_id],
    type,
    prNumber: iid,
    provider: "gitlab",
    accountId: actorAccountId(payload.user),
    login: payload.user?.username ?? null,
  });
  if (echo) return;

  await handleForgeNumoMention({
    provider: "gitlab",
    repoFullName,
    prNumber: iid,
    body: payload.object_attributes.note,
    authorLogin: payload.user?.username ?? null,
  });
}

/** Actions `issue` synchronisées (MIN-97) — les éditions (`update`) et les
    suppressions ne le sont pas (v1 : ouverture / fermeture / réouverture). */
const SYNCED_ISSUE_ACTIONS = new Set(["open", "close", "reopen"]);

async function handleIssue(payload: unknown): Promise<void> {
  const remote = normalizeGitlabIssueEvent(payload);
  if (!remote || !SYNCED_ISSUE_ACTIONS.has(remote.action)) return;
  await syncRemoteIssueEvent(remote);
}

/** Comparaison à temps constant du X-Gitlab-Token (secret partagé verbatim). */
function tokenMatches(provided: string | null, secret: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.GITLAB_WEBHOOK_SECRET;

  // FAIL-CLOSED : ce récepteur MUTE l'état (pr_state, statut d'issue, activité).
  // Sans secret déployé, on acquitte SANS traiter — sinon n'importe qui
  // connaissant le chemin d'un dépôt lié pourrait forger un merge et passer une
  // issue en done. (Le webhook GitHub historique est resté fail-open ; ici la
  // variable est neuve, aucun déploiement existant à ne pas casser.)
  if (!secret) {
    console.warn("[webhooks/gitlab] GITLAB_WEBHOOK_SECRET is not set — payload ignored");
    return NextResponse.json({ ok: true });
  }
  if (!tokenMatches(request.headers.get("x-gitlab-token"), secret)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as MergeRequestEvent & NoteEvent;
    // Merge Requests (agent), Notes (commentaires de MR) et Issues (synchro du
    // dépôt lié) — tout autre object_kind est acquitté sans traitement.
    if (payload.object_kind === "merge_request") {
      await handleMergeRequest(payload);
    } else if (payload.object_kind === "note") {
      await handleNote(payload);
    } else if (payload.object_kind === "issue") {
      await handleIssue(payload);
    }
  } catch (err) {
    // Best-effort : on acquitte quand même pour que GitLab ne re-livre pas.
    console.error("[webhooks/gitlab] handling failed:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
