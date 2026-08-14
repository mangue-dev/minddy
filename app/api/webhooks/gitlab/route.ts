import { type NextRequest, NextResponse } from "next/server";
import { afterOrNow } from "@/lib/server/after-safe";
import { syncPrState, findRunsForPr, type SyncedPrRun } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import {
  applyForgePrToIssue,
  isPrActionEcho,
  recordForgePrActionEvents,
  recordForgePrGesture,
  notifyForgePrAction,
} from "@/lib/server/agent/pr-activity";
import { notifyPullRequestOpened } from "@/lib/server/agent/pr-opened-notify";
import {
  gitlabMrState,
  gitlabMrStateForAction,
  isServiceAccountGesture,
  prActionForMergeRequest,
  prActionForNote,
} from "@/lib/server/agent/pr-webhook-core";
import { normalizeGitlabIssueEvent } from "@/lib/server/git/issue-sync-core";
import { syncRemoteIssueEvent } from "@/lib/server/git/issue-sync";
import {
  legacyGitlabWebhookSecret,
  loadWebhookSecrets,
  verifyWebhookToken,
} from "@/lib/server/git/webhook-secret";
import { isReplayedForgeDelivery } from "@/lib/server/git/webhook-dedup";
import { isForgeTokenCryptoConfigured } from "@/lib/server/git/token-crypto";
import { rotateGitlabWebhookSecret } from "@/lib/server/git/gitlab-app";
import {
  findPullRequestByNumber,
  resolveIssueForPr,
  upsertPullRequest,
  type PullRequestRow,
} from "@/lib/server/agent/pull-requests";
import { handleForgeNumoMention } from "@/lib/server/agent/pr-mention";
import {
  broadcastPrChanged,
  broadcastPrChangedByNumber,
} from "@/lib/server/agent/pr-live";
import type { PrLivePart } from "@/lib/pr-live";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * POST /api/webhooks/gitlab — récepteur webhook GitLab (MIN-69), pendant de
 * /api/webhooks/github pour les Merge Requests de l'agent de code.
 *
 * On vérifie le secret (`X-Gitlab-Token`, comparaison à temps constant) puis on
 * traite le hook `Merge Request Hook` (object_kind `merge_request`) :
 *
 * Le secret est PROPRE AU DÉPÔT (MIN-333) : il est tiré des liaisons dont
 * l'`external_repo_id` est celui de `project.id`, et de nulle autre. Un jeton
 * volé chez un locataire ne signe donc rien chez un autre — c'est exactement ce
 * que le secret global d'avant permettait, GitLab montrant le token d'un hook à
 * qui peut l'éditer. Le repli sur `GITLAB_WEBHOOK_SECRET` ne sert que les hooks
 * pas encore rotés, et déclenche leur rotation.
 *
 *  - toute action utile → INGÈRE la MR dans `pull_requests` (MIN-143 : de Numo
 *    ou d'un humain, c'est le même fait du dépôt).
 *  - action `merge` / `close` / `reopen` / `open` → met à jour `agent_runs.pr_state`
 *    (la review in-app reflète le vrai état côté GitLab) ET, pour un geste fait
 *    DIRECTEMENT sur GitLab, trace « ouvert / accepté / refusé la MR » dans
 *    l'activité de l'issue liée. L'action `update` sert la bascule BROUILLON
 *    (MIN-138) — GitLab n'a pas d'action dédiée, cf. `gitlabMrStateForAction` — et, quand elle
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
 * chez GitLab. Le hook `Emoji Hook` (object_kind `emoji`) porte les RÉACTIONS et
 * n'écrit rien : il n'existe que pour le direct (MIN-161). C'est le seul chemin
 * de réaction en temps réel des deux forges — GitHub n'a tout simplement pas
 * d'événement de réaction. Le hook `Pipeline Hook` (object_kind `pipeline`) est
 * traité de même, pour le bandeau CI. Tout autre object_kind est acquitté sans
 * traitement.
 *
 * DIRECT (MIN-161) : chaque chemin pousse un `changed` sur le topic de la MR,
 * qui NOMME les parties touchées — le panneau ouvert va relire chez la forge,
 * avec le token de celui qui regarde. Émis AVANT les gardes d'anti-écho
 * (`isServiceAccount`, `isPrActionEcho`) : ces gardes protègent l'ACTIVITÉ du
 * doublon, mais le fait que la MR ait bougé est vrai dans tous les cas.
 *
 * PRÉREQUIS : le hook du dépôt doit être abonné à `note_events`, `emoji_events`
 * et `pipeline_events` — c'est fait à sa création et à chaque passage
 * d'`ensureGitlabIssuesHook`, mais un dépôt lié AVANT cette version garde un
 * hook sans eux tant qu'il n'y repasse pas.
 *
 * Anti-doublon : les actions minddy in-app (merge/close) sont faites avec le token
 * OAuth du COMPTE CONNECTÉ du dépôt — leur écho webhook porte ce compte comme
 * `user`. On ignore donc l'ACTIVITÉ des merge/close émis par le compte de service
 * (l'état, lui, est toujours synchronisé — idempotent). Revers assumé : un merge
 * fait à la main sur gitlab.com par ce même compte n'est pas tracé — impossible à
 * distinguer de l'écho, même compromis que le filtre bot GitHub.
 *
 * Fail-closed intégral : token invalide → 401 ; aucune matière à vérifier
 * (ni chiffrement de secret configuré, ni repli) → 503 sans rien traiter, comme
 * le récepteur GitHub. Une livraison déjà vue (`X-Gitlab-Event-UUID`) est
 * acquittée sans être rejouée.
 */

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
 * `gitlabMrStateForAction`, qui ne pilote que le cycle de vie des runs et du
 * ticket. `update` en fait partie : chez GitLab c'est aussi ce qui porte un
 * nouveau push, un changement de titre ou la bascule brouillon.
 */
const INGESTED_MR_ACTIONS = new Set(["open", "reopen", "close", "merge", "update"]);

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
): Promise<PullRequestRow | null> {
  const issueId = await resolveIssueForPr({
    provider: "gitlab",
    repoFullName,
    branch: attrs.source_branch,
    title: attrs.title,
    body: attrs.description,
  });
  const isOpen = attrs.action === "open";
  return upsertPullRequest({
    provider: "gitlab",
    repoFullName,
    number: iid,
    state: gitlabMrState(attrs),
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

/**
 * Direct d'un event qui ne connaît qu'un iid dans un dépôt. Sorti pour que
 * chaque handler le pousse en une ligne, AVANT ses propres gardes d'anti-écho.
 */
async function broadcastGitlabPr(
  repoFullName: string | undefined,
  iid: number | undefined,
  parts: PrLivePart[],
): Promise<void> {
  if (!repoFullName || iid == null) return;
  await broadcastPrChangedByNumber({
    provider: "gitlab",
    repoFullName,
    number: iid,
    parts,
  });
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
  const ingested = INGESTED_MR_ACTIONS.has(action)
    ? await ingestMergeRequest(repoFullName, iid, attrs, payload.user)
    : null;

  // Inbox : le projet apprend qu'une merge request attend des yeux. Ici, juste
  // après l'ingestion, et pas plus bas avec les autres notifications : celles-ci
  // partent à l'auteur d'un RUN, or une MR humaine n'en a pas — c'est justement
  // celle dont personne n'était prévenu. Le compte de service est écarté : quand
  // il ouvre, c'est Numo, et l'annonce est déjà partie côté agent.
  if (action === "open" && !(await isServiceAccount(repoFullName, payload.user))) {
    await notifyPullRequestOpened(ingested, {
      actor: {
        accountId: actorAccountId(payload.user),
        login: payload.user?.username ?? null,
      },
    });
  }

  // Direct : l'en-tête a bougé. `oldrev` est le seul `update` qui porte un PUSH
  // — c'est là, et là seulement, que la liste des commits change.
  //
  // Le FIL bouge aussi, pour la même raison que côté GitHub : la conversation
  // porte l'ACTIVITÉ de la MR (MIN-159), que GitLab écrit en notes `system`
  // relues par `listMergeRequestTimeline` — « added 3 commits », « approved
  // this merge request », « merged ». Ces phrases naissent d'un event
  // `merge_request` et se rendent DANS le fil.
  const liveParts: PrLivePart[] = attrs.oldrev
    ? ["pr", "conversation", "commits"]
    : ["pr", "conversation"];
  if (ingested) {
    broadcastPrChanged(ingested.id, liveParts);
  } else {
    await broadcastGitlabPr(repoFullName, iid, liveParts);
  }

  const prState = gitlabMrStateForAction(payload);
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
  // Direct : la note est ancrée dans le diff (remarque de ligne) ou non (message
  // de fil) — c'est exactement ce que `prActionForNote` vient de trancher.
  await broadcastGitlabPr(repoFullName, iid, [
    type === "pr_code_commented" ? "reviewComments" : "conversation",
  ]);
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

/**
 * Une RÉACTION, telle que GitLab la livre — `Emoji Hook` (object_kind `emoji`).
 *
 * C'est le seul chemin de réaction en direct des deux forges : GitHub n'a pas
 * d'événement de réaction du tout (côté GitHub, seules les réactions posées
 * DEPUIS minddy sont diffusées, par la route ; une réaction posée sur github.com
 * n'arrive qu'au prochain rafraîchissement naturel — c'est un manque de la
 * forge, dit plutôt que caché).
 *
 * Rien à écrire : une réaction ne trace pas d'activité et ne vit pas en base.
 * Les deux surfaces sont poussées ensemble parce que le hook ne dit pas de façon
 * fiable où pend l'award (fil ou remarque de ligne) — deux invalidations valent
 * mieux qu'une lecture de plus, et le coalescing les absorbe.
 */
interface EmojiEvent {
  object_kind?: string;
  project?: { path_with_namespace?: string };
  merge_request?: { iid?: number };
}

async function handleEmoji(payload: EmojiEvent): Promise<void> {
  await broadcastGitlabPr(
    payload.project?.path_with_namespace,
    payload.merge_request?.iid,
    ["conversation", "reviewComments"],
  );
}

/**
 * Un pipeline, tel que GitLab le livre — `Pipeline Hook`. Direct SEUL : l'état
 * de la CI est lu chez la forge à chaque GET du détail, il n'est pas en base.
 * Le hook ne porte la merge request que pour un pipeline DE merge request ; sur
 * un pipeline de branche, il n'y a rien à rattacher et on n'émet rien (le poll
 * de 15 s reste le filet).
 */
interface PipelineEvent {
  object_kind?: string;
  project?: { path_with_namespace?: string };
  merge_request?: { iid?: number };
}

async function handlePipeline(payload: PipelineEvent): Promise<void> {
  await broadcastGitlabPr(
    payload.project?.path_with_namespace,
    payload.merge_request?.iid,
    ["pr"],
  );
}

/**
 * Actions `issue` synchronisées. Le ticket minddy REFLÈTE l'issue distante,
 * alors `update` en fait partie — c'est sous ce seul mot que GitLab range tout
 * ce que GitHub détaille en `edited`/`labeled`/`assigned` : un hook `update`
 * porte l'issue entière, et `changes` dit ce qui a bougé. On réconcilie sur
 * l'état complet plutôt que de lire `changes`, ce qui rattrape au passage un
 * hook perdu.
 */
const SYNCED_ISSUE_ACTIONS = new Set(["open", "close", "reopen", "update"]);

async function handleIssue(payload: unknown): Promise<void> {
  const remote = normalizeGitlabIssueEvent(payload);
  if (!remote || !SYNCED_ISSUE_ACTIONS.has(remote.action)) return;
  await syncRemoteIssueEvent(remote);
}

/**
 * L'identifiant NUMÉRIQUE du dépôt, porté par tous les hooks GitLab
 * (`project.id`). C'est lui la clé du secret et du routage (MIN-333) : un
 * `path_with_namespace` se libère et se réattribue, un id non.
 */
function payloadRepoId(payload: unknown): string | null {
  const id = (payload as { project?: { id?: unknown } } | null)?.project?.id;
  return typeof id === "number" || (typeof id === "string" && id.trim())
    ? String(id)
    : null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Le corps est lu AVANT la vérification, et c'est nécessaire : le secret est
  // propre au dépôt (MIN-333), et le seul endroit qui dise de quel dépôt il
  // s'agit, c'est la charge utile. On n'en tire qu'un identifiant, aucun
  // traitement — le corps reste invérifié jusqu'à `verifyWebhookToken`.
  let payload: MergeRequestEvent & NoteEvent & EmojiEvent & PipelineEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const repoId = payloadRepoId(payload);
  if (!repoId) {
    return NextResponse.json({ error: "unknown project" }, { status: 400 });
  }

  // FAIL-CLOSED intégral : ce récepteur MUTE l'état (pr_state, statut d'issue,
  // activité). Sans matière à vérifier, rien n'est traité — sinon n'importe qui
  // connaissant le chemin d'un dépôt lié pourrait forger un merge et passer une
  // issue en done. 503 plutôt que 200, comme le récepteur GitHub et comme
  // SECURITY.md le promet : GitLab re-livrera une fois la configuration en place.
  if (!isForgeTokenCryptoConfigured() && !legacyGitlabWebhookSecret()) {
    console.error(
      "[webhooks/gitlab] no webhook secret material configured — event refused",
    );
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 503 },
    );
  }

  const candidates = await loadWebhookSecrets({
    provider: "gitlab",
    externalRepoId: repoId,
  });
  const verdict = verifyWebhookToken(
    request.headers.get("x-gitlab-token"),
    candidates,
  );
  // Un jeton reconnu par le secret d'un AUTRE dépôt ne l'est pas ici : les
  // candidats sont ceux de ce dépôt-là, et d'eux seuls.
  if (verdict === "rejected") {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  // Hook resté sur le secret global historique : on le rote hors chemin
  // critique, et le repli s'éteint pour ce dépôt.
  if (verdict === "legacy" && candidates.connectionId) {
    afterOrNow(() =>
      rotateGitlabWebhookSecret({
        externalRepoId: repoId,
        connectionId: candidates.connectionId as string,
      }),
    );
  }

  // Rejeu : la même livraison, déjà traitée. Après la vérification — marquer une
  // livraison sans secret valide reviendrait à pouvoir faire taire l'événement
  // réel qui la porte.
  if (
    await isReplayedForgeDelivery(
      "gitlab",
      request.headers.get("x-gitlab-event-uuid"),
    )
  ) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    // Merge Requests (agent), Notes (commentaires de MR), Issues (synchro du
    // dépôt lié), Emoji et Pipeline (direct seul) — tout autre object_kind est
    // acquitté sans traitement.
    if (payload.object_kind === "merge_request") {
      await handleMergeRequest(payload);
    } else if (payload.object_kind === "note") {
      await handleNote(payload);
    } else if (payload.object_kind === "emoji") {
      await handleEmoji(payload);
    } else if (payload.object_kind === "pipeline") {
      await handlePipeline(payload);
    } else if (payload.object_kind === "issue") {
      await handleIssue(payload);
    }
  } catch (err) {
    // Best-effort : on acquitte quand même pour que GitLab ne re-livre pas.
    console.error("[webhooks/gitlab] handling failed:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
