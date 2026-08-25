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
 * POST /api/webhooks/gitlab — GitLab webhook receiver (MIN-69), for
 * /api/webhooks/github for code broker Merge Requests.
 *
 * We check the secret (`X-Gitlab-Token`, constant time comparison) then we
 * handles the `Merge Request Hook` (object_kind `merge_request`) hook:
 *
 * The secret is repository-specific (MIN-333): it is loaded only from links
 * whose `external_repo_id` matches `project.id`. The independently supplied
 * `project.path_with_namespace` must also be one of the names registered for
 * that id before any name-scoped handler runs (MIN-435). The legacy
 * `GITLAB_WEBHOOK_SECRET` is accepted only until that repository receives its
 * first dedicated secret; persisting the dedicated secret revokes the legacy
 * credential for that repository.
 *
 * - any useful action → INGEST the MR in `pull_requests` (MIN-143: from Numo
 * or a human, it is the same fact of the deposit).
 * - action `merge` / `close` / `reopen` / `open` → updates `agent_runs.pr_state`
 * (the in-app review reflects the true state on the GitLab side) AND, for a gesture made
 * DIRECTLY on GitLab, trace “open / accepted / refused the MR” in
 * the activity of the linked issue. The `update` action serves the DRAFT toggle
 * (MIN-138) — GitLab does not have a dedicated action, cf. `gitlabMrStateForAction` — and, when it
 * carries a `oldrev`, the PUSH: “committed to the MR”.
 * - action `approved` / `approval` → trace “approved the MR”. GitLab does NOT have
 *    review « request changes » native : `pr_changes_requested` ne vient que de
 * in-app action. `unapproved`/`unapproval` are IGNORED (no events
 * minddy correspondent — withdrawing an approval is not a traced action,
 * GitHub has no equivalent).
 * The hook `Note Hook` (object_kind `note`) carries COMMENTS: on a merge
 * request, they trace "commented the MR" (thread message) or "commented the code
 * of the MR" (note anchored in the diff), and trigger the replay of Numo if
 * the message MENTIONS it (MIN-162, cf. `lib/server/agent/pr-mention`). The `Issue Hook` (object_kind) hook
 * `issue`) carries the one-way synchronization of depot issues to
 * the projects that activated it (MIN-97) — one way: Minddy never writes
 * at GitLab. The hook `Emoji Hook` (object_kind `emoji`) carries the REACTIONS and
 * does not write anything: it only exists for live broadcasts (MIN-161). This is the only way
 * real-time feedback from both forges — GitHub simply doesn't have
 * reaction event. The `Pipeline Hook` (object_kind `pipeline`) hook is
 * treated in the same way for the CI headband. Any other object_kind is acknowledged without
 * traitement.
 *
 * DIRECT (MIN-161): each path pushes a `changed` on the MR topic,
 * which NAMES the affected parts — the open panel goes to read again at the forge,
 * with the token of the viewer. Issued BEFORE anti-echo guards
 * (`isServiceAccount`, `isPrActionEcho`): these guards protect the ACTIVITY of the
 * duplicate, but the fact that the MR moved is true in all cases.
 *
 * PREREQUISITES: The repository hook must be subscribed to `note_events`, `emoji_events`
 * and `pipeline_events` — this is done when it is created and at each pass
 * of `ensureGitlabIssuesHook`, but a linked repository BEFORE this version keeps a
 * hook without them until it is recreated.
 *
 * Anti-duplicate: minddy in-app actions (merge/close) are done with the token
 * OAuth from the CONNECTED ACCOUNT of the repository — their webhook echo carries this account as
 * `user`. We therefore ignore the ACTIVITY of the merge/close issued by the service account
 * (the state is always synchronized — idempotent). Assumed setback: a merge
 * handmade on gitlab.com by this same account is not traced — impossible to
 * distinguish from echo, same compromise as the GitHub bot filter.
 *
 * Fail-closed: an invalid token returns 401; missing token encryption returns
 * 503 without processing, like the GitHub receiver. A previously seen delivery
 * (`X-Gitlab-Event-UUID`) is acknowledged without being replayed.
 */

interface GitlabUserPayload {
  id?: number;
  username?: string;
}

/** The actor's forge account ID as text (column `provider_account_id`). */
function actorAccountId(user: GitlabUserPayload | undefined | null): string | null {
  return user?.id != null ? String(user.id) : null;
}

interface MergeRequestAttributes {
  iid?: number;
  action?: string;
  state?: string;
  url?: string;
  /** Old head: present on the only `update` which carries a PUSH. */
  oldrev?: string;
  /** MR draft — GitLab derives it from the `Draft:` prefix of the title. */
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
  /** Fields modified by a `update` (present only on this action). */
  changes?: { title?: unknown; draft?: unknown };
}

/**
 * Actions that describe a state of MR to INGEST (MIN-143) — broader than
 * `gitlabMrStateForAction`, which only controls the life cycle of runs and
 * ticket. `update` is one of them: at GitLab it is also what carries a
 * new push, a title change or the draft toggle.
 */
const INGESTED_MR_ACTIONS = new Set(["open", "reopen", "close", "merge", "update"]);

/**
 * Records the MR at minddy — from Numo or a human, it's the same fact of
 * depot (MIN-143).
 *
 * The AUTHOR is only indicated on `open`: the `user` of a GitLab hook is that
 * who TRIGGERED the event, not the author of the MR (`object_attributes`
 * only carries a digital `author_id`, without login). Leave it `undefined` on
 * other actions preserve what a scan has already read from the API rather than
 * overwrite it with the name of the last passer-by.
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
 * Is the hook actor the repository service account (the GitLab account whose
 * minddy uses the token)? Compared by account id (provider_account_id),
 * fallback on the login. Multiple projects can link the same repository via
 * different connections → we collect all the linked identities.
 *
 * This is the model including `forgeAccountMatches` (lib/server/agent/pr-activity.ts,
 * MIN-154) inherits, within a tolerance: here a login which wins against an id
 * DIFFERENT is of no consequence — we recognize a service account, we
 * do not attribute the gesture to anyone.
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
  // Embedded to-one relationship: object at runtime, cast via unknown (see Supabase).
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
 * Direct from an event that only knows one iid in a repository. Out so that
 * each handler pushes it in a line, BEFORE its own anti-echo guards.
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

async function handleMergeRequest(
  payload: MergeRequestEvent,
  repoFullName: string,
): Promise<void> {
  const attrs = payload.object_attributes ?? {};
  const action = attrs.action ?? "";
  const iid = attrs.iid;
  if (iid == null) return;

  // Ingestion FIRST (MIN-143): MR exists in minddy, Numo or a
  // human. She must pass BEFORE the `runs.length === 0` guard lower down, who
  // exists precisely to ignore human MRs — it is this guard who
  // rendait invisibles.
  const ingested = INGESTED_MR_ACTIONS.has(action)
    ? await ingestMergeRequest(repoFullName, iid, attrs, payload.user)
    : null;

  // Inbox: The project learns that a merge request is waiting for eyes. Here, right
  // after ingestion, and not lower with the other notifications: these
  // leave to the author of a RUN, but a human MR does not have one - it is precisely
  // the one that no one knew about. The service account is discarded: when
  // he opens, it's Numo, and the ad has already gone out on the agent side.
  if (action === "open" && !(await isServiceAccount(repoFullName, payload.user))) {
    await notifyPullRequestOpened(ingested, {
      actor: {
        accountId: actorAccountId(payload.user),
        login: payload.user?.username ?? null,
      },
    });
  }

  // Direct: the header has moved. `oldrev` is the only `update` that carries a PUSH
  // — it is there, and there only, that the list of commits changes.
  //
  // The FIL is also moving, for the same reason as on the GitHub side: the conversation
  // carries the MR ACTIVITY (MIN-159), which GitLab writes in notes `system`
  // relues par `listMergeRequestTimeline` — « added 3 commits », « approved
  // this merge request”, “merged”. These phrases come from an event
  // `merge_request` and go INTO the thread.
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

  // Runs affected. merge/close/reopen/open resets pr_state in passing.
  const runs: SyncedPrRun[] = prState
    ? await syncPrState({
        repoFullName,
        prNumber: iid,
        prState,
        prUrl: attrs.url ?? null,
        provider: "gitlab",
      })
    : await findRunsForPr({ repoFullName, prNumber: iid, provider: "gitlab" });

  // NO run: it's a human MR (MIN-143). This guard was dismissive — it's
  // he who made them ineffective on the tickets. However, she can wear it
  // one, by its branch, its title or a closing line: merge it on
  // GitLab should produce what the merge from minddy produces.
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

  // Aligns the status of the exits with the new MR state (MIN-46):
  // merged→done, closed→todo, open/reopen→in_review.
  if (prState) {
    for (const run of runs) {
      // `issueId` null = run notebook (MIN-84): no issue to align.
      if (run.createdBy && run.issueId) {
        await syncIssueStatusFromPr({ issueId: run.issueId, actorId: run.createdBy, prState });
      }
    }
  }

  if (!actionType) return;
  // Echo of an in-app action → already traced by the road with the human actor: we
  // don't re-trace. Two necessary readings: the service account (the gesture
  // of an AGENT still leaves the account which linked the deposit) and the event already
  // written — since MIN-144 a human gesture starts from the person's git account,
  // which is only that of the link for who linked the deposit.
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
  // Inbox: the author of the run learns that his MR (MIN-138) has been approved or merged.
  await notifyForgePrAction({ runs, type: actionType, actorLogin: payload.user?.username ?? null });
}

/** A note (comment) as GitLab delivers it — `Note Hook`. */
interface NoteEvent {
  object_kind?: string;
  user?: GitlabUserPayload;
  project?: { path_with_namespace?: string };
  /** `note` carries the body of the message: it is the only signal of a written `@numo`
      depuis GitLab (MIN-162). */
  object_attributes?: { noteable_type?: string; position?: unknown; note?: string | null };
  /** Present when the note concerns a merge request. */
  merge_request?: { iid?: number };
}

/**
 * Comment on a merge request → ticket activity. Thread message or
 * line comment based on the anchor (see `prActionForNote`).
 *
 * No “service account” guard here: nobody comments under this token —
 * a comment posted from minddy leaves the PERSON's git account, and it is
 * `isPrActionEcho` (in `recordForgePrGesture`) which recognizes its echo. There
 * adding would silence, forever, the comments of the one who linked the
 * deposit.
 */
async function handleNote(
  payload: NoteEvent,
  repoFullName: string,
): Promise<void> {
  const type = prActionForNote(payload.object_attributes ?? {});
  const iid = payload.merge_request?.iid;
  if (!type || iid == null) return;
  // Direct: the note is anchored in the diff (line remark) or not (message
  // of thread) — this is exactly what `prActionForNote` just decided.
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

  // `@numo` written from GitLab (MIN-162) — the exact counterpart of the receiver
  // GitHub. The anti-echo of a message posted from minddy is the one that
  // `recordForgePrGesture` has just been applied: we replay it here on the same
  // gesture, because the trace and the pass are not triggered at the same place.
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
 * A REACTION, as GitLab delivers it — `Emoji Hook` (object_kind `emoji`).
 *
 * This is the only live reaction path from both forges: GitHub does not have
 * reaction event at all (on the GitHub side, only reactions posed
 * SINCE minddy are broadcast, by road; a reaction posted on github.com
 * only happens at the next natural refreshment — it is a lack of
 * forge, said rather than hidden).
 *
 * Nothing to write: a reaction does not trace activity and does not live in base.
 * The two surfaces are pushed together because the hook doesn't say any way
 * reliable where the award hangs (thread or line remark) — two invalidations are worth
 * better than one more reading, and coalescing absorbs them.
 */
interface EmojiEvent {
  object_kind?: string;
  project?: { path_with_namespace?: string };
  merge_request?: { iid?: number };
}

async function handleEmoji(
  payload: EmojiEvent,
  repoFullName: string,
): Promise<void> {
  await broadcastGitlabPr(
    repoFullName,
    payload.merge_request?.iid,
    ["conversation", "reviewComments"],
  );
}

/**
 * A pipeline, as GitLab delivers — `Pipeline Hook`. Direct ALONE: the state
 * of the CI is read at the forge at each GET of the detail, it is not in base.
 * The hook only carries the merge request for a DE merge request pipeline; on
 * a branch pipeline, there is nothing to attach and we emit nothing (the poll
 * of 15 s remains the net).
 */
interface PipelineEvent {
  object_kind?: string;
  project?: { path_with_namespace?: string };
  merge_request?: { iid?: number };
}

async function handlePipeline(
  payload: PipelineEvent,
  repoFullName: string,
): Promise<void> {
  await broadcastGitlabPr(
    repoFullName,
    payload.merge_request?.iid,
    ["pr"],
  );
}

/**
 * Synchronized `issue` actions. The minddy ticket REFLECTS the remote issue,
 * then `update` is one of them — it is under this single word that GitLab puts everything
 * what GitHub details in `edited`/`labeled`/`assigned`: a `update` hook
 * carries the entire issue, and `changes` says what moved. We reconcile on
 * the complete state rather than reading `changes`, which in passing catches a
 * hook perdu.
 */
const SYNCED_ISSUE_ACTIONS = new Set(["open", "close", "reopen", "update"]);

async function handleIssue(
  payload: unknown,
  repoId: string,
  repoFullName: string,
): Promise<void> {
  const remote = normalizeGitlabIssueEvent(payload);
  if (!remote || !SYNCED_ISSUE_ACTIONS.has(remote.action)) return;
  // The normalizer reads repository identity from the provider payload. Replace
  // it with the identity already bound to the verified token before routing.
  await syncRemoteIssueEvent({ ...remote, repoId, repoFullName });
}

/**
 * The NUMERIC identifier of the repository, carried by all GitLab hooks
 * (`project.id`). He is the key to secrecy and routing (MIN-333): a
 * `path_with_namespace` is released and reassigned, an id no.
 */
function payloadRepoId(payload: unknown): string | null {
  const id = (payload as { project?: { id?: unknown } } | null)?.project?.id;
  return typeof id === "number" || (typeof id === "string" && id.trim())
    ? String(id)
    : null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Read only enough untrusted body data to locate the repository-specific
  // credential. No payload field is trusted or processed before token and
  // registered-name verification completes.
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

  // Full fail-closed behavior: this receiver mutates PR state, issue status,
  // and activity. Encryption is required for both dedicated secrets and legacy
  // migration because accepting the global token without being able to rotate
  // it would leave the broadly scoped credential valid indefinitely.
  if (!isForgeTokenCryptoConfigured()) {
    console.error(
      "[webhooks/gitlab] token encryption is not configured — event refused",
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
  // A token belonging to another repository is absent from this candidate set.
  if (verdict === "rejected") {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  const repoFullName = payload.project?.path_with_namespace;
  if (!repoFullName || !candidates.repoFullNames.includes(repoFullName)) {
    return NextResponse.json({ error: "invalid repository" }, { status: 401 });
  }
  // A hook still carries the historical global secret. Rotate it off the
  // critical path; storing its dedicated secret revokes this fallback for the
  // repository before the hook update begins.
  if (verdict === "legacy" && candidates.connectionId) {
    afterOrNow(() =>
      rotateGitlabWebhookSecret({
        externalRepoId: repoId,
        connectionId: candidates.connectionId as string,
      }),
    );
  }

  // Check replay only after authentication. Reserving an unauthenticated
  // delivery id would let an attacker silence the real delivery that uses it.
  if (
    await isReplayedForgeDelivery(
      "gitlab",
      request.headers.get("x-gitlab-event-uuid"),
    )
  ) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    // Handle merge requests, notes, issues, emoji, and pipelines. Other event
    // kinds are intentionally acknowledged without side effects.
    if (payload.object_kind === "merge_request") {
      await handleMergeRequest(payload, repoFullName);
    } else if (payload.object_kind === "note") {
      await handleNote(payload, repoFullName);
    } else if (payload.object_kind === "emoji") {
      await handleEmoji(payload, repoFullName);
    } else if (payload.object_kind === "pipeline") {
      await handlePipeline(payload, repoFullName);
    } else if (payload.object_kind === "issue") {
      await handleIssue(payload, repoId, repoFullName);
    }
  } catch (err) {
    // Handler failures remain best-effort to preserve the existing webhook contract.
    console.error("[webhooks/gitlab] handling failed:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
