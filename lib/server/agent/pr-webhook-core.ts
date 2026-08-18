import type { PrActionEventType } from "@/lib/pr-events";
import type { PullRequestState } from "./pull-requests";

/**
 * The PURE rules which say, of a forging event, what STATE it describes and
 * what line of ACTIVITY it becomes. They live here, and not in the
 * `route.ts` : un fichier de route Next.js ne peut exporter que ses handlers,
 * therefore nothing it contains is testable - but it is exactly the type
 * of correspondence table which makes a mistake silently (a wrong action
 * spelled doesn't raise anything, it simply never traces anything).
 *
 * What remains on the roads: signature verification, resolution of
 * runs and writing. Here, only functions without side effects.
 *
 * STATE was added to it by MIN-164, and for the same reason: each receiver
 * translated “what the forge says” into minddy state in its own way, and two of these
 * translations forgot the draft. A PR is in ONE state; he cannot
 * have only one function to say it, by forge.
 */

// ── GitHub ───────────────────────────────────────────────────────────────────

/** What the status rule reads from a GitHub pull request. */
export interface GithubPrStateInput {
  state?: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
}

/**
 * Minddy state of a GitHub pull request, as the payload describes it.
 *
 * The order carries everything: GitHub CLOSES a PR by merging it (`state: "closed"`
 * + `merged: true`), so merged wins; and a draft is not a
 * draft only as long as it is open — GitHub keeps `draft: true` on a PR
 * draft closed, and announcing it “draft” would hide that it is dead.
 *
 * `merged_at` sert de repli : l'endpoint *list* de l'API ne renvoie pas `merged`
 * (see `toRef` in `pr.ts`), and some webhook payloads either.
 */
export function githubPrState(pr: GithubPrStateInput): PullRequestState {
  if (pr.merged || pr.merged_at) return "merged";
  if (pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
}

/**
 * `pull_request` actions whose state DRIVES the life cycle of the run and the ticket
 * — narrower than simply INGESTED actions (`edited`, `synchronize`:
 * the RA changes, its state does not).
 *
 * `opened` is one of them: a human PR who cites a ticket must put it in
 * reviewed as would Numo, and as the GitLab receiver already does with its
 * action `open`. Without it, opening a PR only had an effect on GitLab so
 * that the merger had it on both sides (MIN-143) — the same gesture, two
 * behaviors according to the forge.
 */
const STATE_DRIVING_PR_ACTIONS = new Set([
  "opened",
  "closed",
  "reopened",
  "ready_for_review",
  "converted_to_draft",
]);

/**
 * action `pull_request` + payload → state to write, or null (action which does not describe
 * no change of state).
 *
 * The state comes from PAYLOAD, never from the action alone: ​​GitHub lets reopen a
 * PR remained messy, and `reopened` was “open” in hard copy — the ticket
 * then left for a review for a job that no one offered, which
 * MIN-138 had rightly decided.
 */
export function githubPrStateForAction(
  action: string,
  pr: GithubPrStateInput,
): PullRequestState | null {
  return STATE_DRIVING_PR_ACTIONS.has(action) ? githubPrState(pr) : null;
}

/**
 * action `pull_request` → activity event (null = action not traced).
 *
 * `synchronize` is the GitHub name of a PUSH on the PR branch: it is the
 * only signal of “someone committed to this” — the payload only carries the
 * sha before/after, never the number of commits, hence a sentence that doesn't count
 * Nothing. The other actions (`edited`, `labeled`, `assigned`…) are noise of
 * forge, pas des faits du ticket.
 *
 * `converted_to_draft` / `ready_for_review` remain outside: they change the STATE
 * (and therefore the status of the ticket, which tells itself), but minddy does not have
 * event for the draft toggle — the PR shows it in its own
 * activity (`pr-timeline`).
 */
export function prActionForPullRequest(
  action: string,
  merged: boolean,
): PrActionEventType | null {
  switch (action) {
    case "opened":
      return "pr_opened";
    case "reopened":
      return "pr_reopened";
    case "synchronize":
      return "pr_committed";
    case "closed":
      return merged ? "pr_accepted" : "pr_rejected";
    default:
      return null;
  }
}

/**
 * status of a submitted review → activity event (null = ignored).
 *
 * A “commented” review is only a MESSAGE if it carries one: submitted
 * without body, it is only the envelope of the line remarks, already traced
 * one by one by `pull_request_review_comment`. Tracing it anyway would add
 * a “commented” line that does not refer to any text.
 *
 * `dismissed` stays out: removing a review has no GitLab equivalent, and
 * minddy has no event for canceling a gesture.
 */
export function prActionForReview(review: {
  state?: string;
  body?: string | null;
}): PrActionEventType | null {
  switch (review.state) {
    case "approved":
      return "pr_approved";
    case "changes_requested":
      return "pr_changes_requested";
    case "commented":
      return review.body?.trim() ? "pr_commented" : null;
    default:
      return null;
  }
}

/**
 * Does a `issue_comment` event carry a PULL REQUEST comment to trace?
 * GitHub serves thread comments from issues AND PRs on the same event;
 * only the presence of `issue.pull_request` distinguishes them. Comments
 * remote output are not within our control (the MIN-97 sync is one way
 * unique and only carries the opening/closing).
 */
export function isPullRequestComment(payload: {
  action?: string;
  issue?: { pull_request?: unknown } | null;
}): boolean {
  return payload.action === "created" && !!payload.issue?.pull_request;
}

// ── GitLab ───────────────────────────────────────────────────────────────────

/** What the status rule reads from a merge request `object_attributes`. */
export interface GitlabMrStateInput {
  state?: string;
  /** MR draft — GitLab derives it from the `Draft:` prefix of the title. */
  draft?: boolean;
  /** The name of the draft before GitLab 14: still served by self-hosted instances. */
  work_in_progress?: boolean;
}

/**
 * Minddy state of a GitLab merge request, as the payload describes it.
 *
 * `locked` is a TRANSIENT state (a merger in progress), not a fourth
 * state of life: it therefore falls on the open side, as in `toRef` (`mr.ts`).
 *
 * BOTH names in the draft are read: GitLab renamed `work_in_progress` to
 * `draft` in 14.0, and an older self-hosted instance only sends
 * the old one. Reading only one made the draft invisible on those instances.
 */
export function gitlabMrState(attrs: GitlabMrStateInput): PullRequestState {
  if (attrs.state === "merged") return "merged";
  if (attrs.state === "closed") return "closed";
  return attrs.draft || attrs.work_in_progress ? "draft" : "open";
}

/** What the status rule reads from a complete `merge_request` event. */
export interface GitlabMrStateEvent {
  object_attributes?: GitlabMrStateInput & { action?: string };
  /** Fields modified by a `update` (present only on this action). */
  changes?: { title?: unknown; draft?: unknown };
}

/**
 * action `merge_request` + payload → state to write, or null.
 *
 * The DRAFT does not have a dedicated action at GitLab, unlike the
 * `converted_to_draft` / `ready_for_review` from GitHub: it is supported by the
 * prefix `Draft:` of the title, and its switch arrives at `action: "update"` — the
 * same action as a change of description or label. We therefore do not reread
 * the state on a `update` only if it TOUCHES the title or the draft, otherwise a
 * simple retouching of description would rewrite the state (and, in cascade, the status of the
 * ticket) at each edition.
 */
export function gitlabMrStateForAction(
  payload: GitlabMrStateEvent,
): PullRequestState | null {
  const attrs = payload.object_attributes ?? {};
  switch (attrs.action) {
    case "merge":
    case "close":
    case "open":
    case "reopen":
      return gitlabMrState(attrs);
    case "update": {
      const changes = payload.changes ?? {};
      if (changes.draft === undefined && changes.title === undefined) return null;
      // An MR already closed or merged whose title is retouched remains this
      // that it is: only a LIVING MR switches to draft.
      if (attrs.state !== "opened" && attrs.state !== "locked") return null;
      return gitlabMrState(attrs);
    }
    default:
      return null;
  }
}

/** What the GitLab rule reads from a merge request `object_attributes`. */
export interface GitlabMrActionInput {
  action?: string;
  /** Old header: GitLab ONLY puts it on a `update` which carries a push. */
  oldrev?: string;
}

/**
 * action `merge_request` → activity event (null = action not traced).
 *
 * GitLab does not have a “push” action: a new commit arrives at `update`, the
 * same action as changing title, description or label. What
 * separates them is `oldrev`, present only when the head has moved.
 *
 * `unapproved` / `unapproval` remain outside, for the original reason: remove
 * an approval is not a mapped out gesture, and GitHub has no equivalent.
 */
export function prActionForMergeRequest(
  attrs: GitlabMrActionInput,
): PrActionEventType | null {
  switch (attrs.action) {
    case "open":
      return "pr_opened";
    case "reopen":
      return "pr_reopened";
    case "merge":
      return "pr_accepted";
    case "close":
      return "pr_rejected";
    // `approved` = the MR becomes fully approved; `approval` = one
    // individual approval when several are required. Mutually
    // exclusive by event → no double trace.
    case "approved":
    case "approval":
      return "pr_approved";
    case "update":
      return attrs.oldrev ? "pr_committed" : null;
    default:
      return null;
  }
}

/** What the GitLab rule reads from a note `object_attributes`. */
export interface GitlabNoteInput {
  noteable_type?: string;
  /** Anchoring in the diff: present only on a line remark. */
  position?: unknown;
}

/**
 * GitLab note → activity event (null = note excluding merge request).
 *
 * A `Note Hook` covers the comments of everything that is commented on at GitLab
 * (issue, commit, extract, merge request): `noteable_type` is the only filter.
 * The `position` anchor then separates the code remark from the thread message —
 * it is the exact counterpart of the couple `pull_request_review_comment` / `issue_comment`
 * de GitHub.
 */
export function prActionForNote(attrs: GitlabNoteInput): PrActionEventType | null {
  if (attrs.noteable_type !== "MergeRequest") return null;
  return attrs.position ? "pr_code_commented" : "pr_commented";
}

/**
 * Gestures that minddy makes WITH the token of the account connected to the GitLab repository: their
 * echo webhook carries this account, and the trace already exists on the route or agent side.
 *
 * COMMENTS are not: no one posts them under this token — a
 * in-app comment comes from the person's git account, and is recognized by
 * `isPrActionEcho`. Putting them there would amount to permanently mute the
 * comments from whoever linked the repository.
 */
export function isServiceAccountGesture(type: PrActionEventType): boolean {
  return (
    type === "pr_accepted" ||
    type === "pr_rejected" ||
    type === "pr_opened" ||
    type === "pr_reopened" ||
    type === "pr_committed"
  );
}
