/**
 * The ACTIVITY of a pull request — anything that happened to it that is not a
 * message: reviews submitted, commits pushed, deployments, labels,
 * assignments, requests for review, renames, draft passages ↔ ready, close,
 * reopen, merge.
 *
 * Deliberately PUR and shared client/server, like `pr-review-threads`: the
 * two forges describe these facts in very different forms (events
 * typed on the GitHub side, system notes in English on the GitLab side), and it is here that the
 * translation into a single vocabulary is done — once, not in each view.
 *
 * What is NOT included in this list: thread messages, already served by
 * `listPullRequestComments`. Returning them here would count them twice.
 */

import { mergeCommitAuthors, type CommitAuthor } from "./commit-authors";

/**
 * The facts that Minddy knows how to name. An event that the forge describes but that
 * cette liste ne couvre pas se range sous `system` : il garde son texte d'origine
 * rather than disappearing — better a sentence from GitLab than a hole in
 * activity (it is also the withdrawal of all system notes that no reason
 * recognizes).
 *
 * `reviewed` is the only one that carries CONTENT: a review subject to a verdict
 * AND, often, a body. It is delivered as a message, not as a line.
 */
export type PrTimelineKind =
  | "reviewed"
  | "review_dismissed"
  | "review_requested"
  | "review_request_removed"
  | "committed"
  | "deployed"
  | "deployment_environment_changed"
  | "force_pushed"
  | "branch_deleted"
  | "branch_restored"
  | "labeled"
  | "unlabeled"
  | "assigned"
  | "unassigned"
  | "renamed"
  | "milestoned"
  | "demilestoned"
  | "ready_for_review"
  | "converted_to_draft"
  | "merged"
  | "closed"
  | "reopened"
  | "referenced"
  | "cross_referenced"
  | "locked"
  | "unlocked"
  | "auto_merge_enabled"
  | "auto_merge_disabled"
  | "system";

/** Verdict of a submitted review — the vocabulary of `reviewed`. */
export type PrReviewState = "approved" | "changes_requested" | "commented" | "dismissed";

/**
 * A fact of the activity of the PR, forge-agnostic.
 *
 * `id` is a STRING and not a number: GitHub numbers its events, GitLab
 * its notes, and commits only have an SHA — uniqueness is obtained by prefixing
 * (`event:123`, `note:45`, `commit:abc…`). It is only used for the rendering key and
 * to matching reviews with their line comments.
 *
 * All detail fields are optional: each `kind` only fills one
 * handful, and a forge that does not know how to fill a field rather leaves it absent
 * than inventing a value.
 */
export interface PrTimelineEvent {
  id: string;
  kind: PrTimelineKind;
  /** Who made the gesture? Null when the forge does not say so (certain automatisms). */
  actor: { login: string; avatar_url: string | null } | null;
  /**
   * ALL authors, when the fact has several (MIN-159) — one commit
   * co-signed, a folded push. `actor` remains the first of them: the
   * rendus qui n'empilent pas d'avatars continuent de marcher.
   */
  actors?: CommitAuthor[];
  /** ISO 8601. Null for an undated fact — it is then placed at the end of the thread. */
  createdAt: string | null;
  /** Verdict — `reviewed` seulement. */
  reviewState?: PrReviewState;
  /** Body of a review, or plain text of a system note (`system`). */
  body?: string;
  /** Id of the review at the forge — the key that connects its line comments. */
  reviewId?: number;
  /** ALL reviews folded into this fact (`groupTimelineReviews`): one point
      posed alone is a review in itself on GitHub, and it is often necessary
      a dozen to say just one thing. Filled on `reviewed`, never
      elsewhere — the caller picks up the line comments to display there. */
  reviewIds?: number[];
  /** Nom du label — `labeled` / `unlabeled`. Couleur hex SANS `#`, quand connue. */
  label?: { name: string; color: string | null };
  /** Login concerned — assignment, review request, review rejected. */
  subject?: string | null;
  /** Titles before / after — `renamed`. */
  from?: string | null;
  to?: string | null;
  /** SHA + first line of the message — `committed`. */
  sha?: string | null;
  /** Number of commits pushed at once, when the forge summarizes it (GitLab). */
  commitCount?: number | null;
  /** Nom du jalon — `milestoned` / `demilestoned`. Nom de branche — `branch_*`. */
  name?: string | null;
  /** What the event references — `referenced` / `cross_referenced`. */
  reference?: string | null;
  /** Link to the fact at the forge, when it serves one. */
  url?: string | null;
}

/**
 * The AUTHORS of each commit — which the timeline does not give.
 *
 * A `committed` event only carries what is written IN the commit: A name
 * git (“manged”) and an email. Two things are missing, and the list of commits
 * — already loaded for its tab — has them both:
 * - the COUNT behind this name (“mango-dev”, his avatar), which the forge resolves
 * by email. Without it, the activity displayed the local `user.name` and an avatar
 * made from this name, while the real photo was one tab away;
 * - CO-AUTHORS, which git only puts in the message trailers. A commit
 * written with an agent always has one, and showing only one was tantamount to
 * assign the work to one person.
 *
 * The pairing is done by SHA, the only common key. A commit missing from the
 * list (it is capped, cf. `truncated`) keeps its git name: a true name
 * but partial is better than a guessed account.
 */
export function resolveCommitActors(
  events: PrTimelineEvent[],
  // `authors` is OPTIONAL here while the route always fills it: a
  // tab opened at the time of a deployment caches the response of the
  // version before, which did not carry it. A new field read without guard made
  // drop the entire page for an avatar — tolerance is therefore declared in the
  // type, where the data crosses the network.
  commits: Array<{ sha: string; authors?: CommitAuthor[] }>,
): PrTimelineEvent[] {
  if (commits.length === 0) return events;
  const bySha = new Map(
    commits.filter((c) => c.authors?.length).map((c) => [c.sha, c.authors as CommitAuthor[]]),
  );
  return events.map((event) => {
    if (event.kind !== "committed" || !event.sha) return event;
    const authors = bySha.get(event.sha);
    if (!authors?.length) return event;
    const [first] = authors;
    return {
      ...event,
      // `actor` remains the main author — it is he who opens the sentence and who
      // decides the grouping of thrusts.
      actor: { login: first.login ?? first.name, avatar_url: first.avatar_url },
      actors: authors,
    };
  });
}

/**
 * A pushed commit is said to be “so-and-so pushed 3 commits”, not commit by
 * commit: GitHub emits a `committed` PER COMMIT event, and a PR of twenty
 * commits would drown out everything else in the thread.
 *
 * Grouping follows what GitHub shows: CONSECUTIVE commits of the same
 * author, not separated by another fact. Two pushes spaced by a review
 * two blocks remain — it's the order of the thread that tells the story, not the author.
 *
 * `commitCount` then carries the total and `sha` the LAST commit of the group (the one
 * to which the link points); the other fields come from the first.
 */
export function groupTimelineCommits(events: PrTimelineEvent[]): PrTimelineEvent[] {
  const out: PrTimelineEvent[] = [];
  for (const event of events) {
    const previous = out[out.length - 1];
    if (
      event.kind === "committed" &&
      previous?.kind === "committed" &&
      // `?? null` : deux commits sans auteur connu se regroupent aussi, un commit
      // without an author does not stick to a signed commit.
      (previous.actor?.login ?? null) === (event.actor?.login ?? null)
    ) {
      out[out.length - 1] = {
        ...previous,
        commitCount: (previous.commitCount ?? 1) + (event.commitCount ?? 1),
        sha: event.sha ?? previous.sha,
        url: event.url ?? previous.url,
        // A push is signed by ALL those who wrote its commits: the
        // co-author of the third commit pushed as much as the author of the first.
        actors: mergeCommitAuthors([previous.actors ?? [], event.actors ?? []]),
        // The group's date is when it ended: "pushed 3 commits" reads
        // by the time the last one arrived.
        createdAt: event.createdAt ?? previous.createdAt,
      };
      continue;
    }
    out.push(event);
  }
  return out;
}

/**
 * A point placed alone on a line of code is, at GitHub, a REVIEW of its own
 * all by itself — measured: three `POST pulls/{n}/comments` produce three
 * `reviewed` events without body. This is exactly how Numo files
 * his finds, one per call: without this withdrawal, a pass of twelve points
 * ajouterait douze cartes « minddy-app[bot] a relu » au fil.
 *
 * We therefore fold the CONSECUTIVE reviews, WITHOUT BODY and from the SAME author into one
 * alone — what a review submitted as a whole would have produced, and what the thread
 * must say: “so and so reread, here are his N points”.
 *
 * What never folds: a review that has a BODY. She says something
 * thing ; merging it into the next one would make its text or its verdict disappear.
 */
export function groupTimelineReviews(events: PrTimelineEvent[]): PrTimelineEvent[] {
  const out: PrTimelineEvent[] = [];
  for (const event of events) {
    if (event.kind !== "reviewed") {
      out.push(event);
      continue;
    }
    const ids = event.reviewId != null ? [event.reviewId] : [];
    const previous = out[out.length - 1];
    const mergeable =
      !event.body &&
      previous?.kind === "reviewed" &&
      !previous.body &&
      (previous.actor?.login ?? null) === (event.actor?.login ?? null) &&
      // One verdict does not merge with another: approving then commenting are
      // two facts, even to the nearest second.
      previous.reviewState === event.reviewState;
    if (mergeable) {
      out[out.length - 1] = {
        ...previous,
        reviewIds: [...(previous.reviewIds ?? []), ...ids],
        createdAt: event.createdAt ?? previous.createdAt,
      };
      continue;
    }
    out.push({ ...event, reviewIds: ids });
  }
  return out;
}

/**
 * Background noise that GitHub itself does not display in a PR thread:
 * subscriptions, mentions, pinnings. Serve them “because the API gives them”
 * would make the thread UNREADABLE — the goal is the completeness of what happened
 * PAST, not the forge database log.
 */
const IGNORED_GITHUB_EVENTS = new Set([
  "subscribed",
  "unsubscribed",
  "mentioned",
  "pinned",
  "unpinned",
  "commented", // the message thread, already served separately.
  "line-commented", // line comments, attached to their review by its id.
  "commit-commented",
]);

/** `event` from GitHub → our vocabulary. `null` = to ignore. */
const GITHUB_EVENT_KIND: Record<string, PrTimelineKind> = {
  reviewed: "reviewed",
  review_dismissed: "review_dismissed",
  review_requested: "review_requested",
  review_request_removed: "review_request_removed",
  committed: "committed",
  deployed: "deployed",
  deployment_environment_changed: "deployment_environment_changed",
  head_ref_force_pushed: "force_pushed",
  head_ref_deleted: "branch_deleted",
  head_ref_restored: "branch_restored",
  labeled: "labeled",
  unlabeled: "unlabeled",
  assigned: "assigned",
  unassigned: "unassigned",
  renamed: "renamed",
  milestoned: "milestoned",
  demilestoned: "demilestoned",
  ready_for_review: "ready_for_review",
  convert_to_draft: "converted_to_draft",
  merged: "merged",
  closed: "closed",
  reopened: "reopened",
  referenced: "referenced",
  "cross-referenced": "cross_referenced",
  locked: "locked",
  unlocked: "unlocked",
  auto_merge_enabled: "auto_merge_enabled",
  auto_merge_disabled: "auto_merge_disabled",
};

/** `state` from a GitHub review → our verdict. */
export function toReviewState(raw: string | null | undefined): PrReviewState {
  const state = (raw ?? "").toUpperCase();
  if (state === "APPROVED") return "approved";
  if (state === "CHANGES_REQUESTED") return "changes_requested";
  if (state === "DISMISSED") return "dismissed";
  return "commented";
}

/** A GitHub timeline event, reduced to the fields that minddy reads. */
export interface RawGithubTimelineEvent {
  id?: number;
  event?: string;
  node_id?: string;
  created_at?: string | null;
  submitted_at?: string | null;
  actor?: { login?: string; avatar_url?: string | null } | null;
  user?: { login?: string; avatar_url?: string | null } | null;
  /** `committed`: the author is IN the commit, not in a forge account. */
  author?: { name?: string; date?: string } | null;
  committer?: { name?: string; date?: string } | null;
  sha?: string;
  message?: string;
  html_url?: string;
  url?: string;
  commit_id?: string | null;
  commit_url?: string | null;
  state?: string;
  body?: string | null;
  label?: { name?: string; color?: string | null } | null;
  assignee?: { login?: string } | null;
  requested_reviewer?: { login?: string } | null;
  requested_team?: { name?: string } | null;
  review_requester?: { login?: string; avatar_url?: string | null } | null;
  dismissed_review?: { review_id?: number; state?: string; dismissal_message?: string | null } | null;
  milestone?: { title?: string } | null;
  rename?: { from?: string; to?: string } | null;
  source?: { issue?: { number?: number; html_url?: string; title?: string } | null } | null;
}

/**
 * GitHub Timeline → minddy activity. Unknown AND not ignored events
 * disappear silently: GitHub adds them regularly (projects, transfers), and
 * an invented `kind` would not go anywhere.
 *
 * `committed` is the twisted case: it is not an outcome event but an object
 * COMMIT injected into stream — no `id`, no `actor`, a date in
 * `author.date` and an author which is just a git name. We make it as is: the
 * nom du commit vaut mieux qu'un « quelqu'un ».
 */
export function fromGithubTimeline(raw: RawGithubTimelineEvent[]): PrTimelineEvent[] {
  const events: PrTimelineEvent[] = [];
  for (const e of raw) {
    const type = e.event ?? "";
    if (IGNORED_GITHUB_EVENTS.has(type)) continue;
    const kind = GITHUB_EVENT_KIND[type];
    if (!kind) continue;

    if (kind === "committed") {
      const sha = e.sha ?? "";
      if (!sha) continue;
      events.push({
        id: `commit:${sha}`,
        kind,
        // The forge account is not used here: only the name written in the
        // commit is. `avatar_url: null` → the avatar falls on the seed.
        actor: e.author?.name ? { login: e.author.name, avatar_url: null } : null,
        createdAt: e.author?.date ?? e.committer?.date ?? null,
        sha,
        commitCount: 1,
        body: (e.message ?? "").split("\n")[0] || undefined,
        url: e.html_url ?? null,
      });
      continue;
    }

    if (kind === "reviewed") {
      // A review is not an outcome event: its author is `user`, its
      // date `submitted_at`, and its `id` IS the id of the review — the key by
      // which her line comments find her.
      events.push({
        id: `review:${e.id ?? e.node_id ?? e.submitted_at ?? ""}`,
        kind,
        actor: e.user?.login
          ? { login: e.user.login, avatar_url: e.user.avatar_url ?? null }
          : null,
        createdAt: e.submitted_at ?? e.created_at ?? null,
        reviewState: toReviewState(e.state),
        reviewId: e.id,
        body: (e.body ?? "").trim() || undefined,
        url: e.html_url ?? null,
      });
      continue;
    }

    const actor = e.actor?.login
      ? { login: e.actor.login, avatar_url: e.actor.avatar_url ?? null }
      : null;
    const base: PrTimelineEvent = {
      id: `event:${e.id ?? e.node_id ?? `${type}:${e.created_at ?? ""}`}`,
      kind,
      actor,
      createdAt: e.created_at ?? null,
    };

    if (kind === "labeled" || kind === "unlabeled") {
      base.label = { name: e.label?.name ?? "", color: e.label?.color ?? null };
    } else if (kind === "assigned" || kind === "unassigned") {
      base.subject = e.assignee?.login ?? null;
    } else if (kind === "review_requested" || kind === "review_request_removed") {
      base.subject = e.requested_reviewer?.login ?? e.requested_team?.name ?? null;
    } else if (kind === "review_dismissed") {
      base.subject = e.dismissed_review?.state?.toLowerCase() ?? null;
      base.body = e.dismissed_review?.dismissal_message ?? undefined;
    } else if (kind === "renamed") {
      base.from = e.rename?.from ?? null;
      base.to = e.rename?.to ?? null;
    } else if (kind === "milestoned" || kind === "demilestoned") {
      base.name = e.milestone?.title ?? null;
    } else if (kind === "cross_referenced" || kind === "referenced") {
      const issue = e.source?.issue;
      base.reference = issue?.number ? `#${issue.number}` : null;
      base.name = issue?.title ?? null;
      base.url = issue?.html_url ?? null;
    } else if (
      kind === "merged" ||
      kind === "closed" ||
      kind === "deployed" ||
      kind === "deployment_environment_changed"
    ) {
      base.sha = e.sha ?? e.commit_id ?? null;
      base.url = e.html_url ?? null;
    }
    events.push(base);
  }
  return events;
}

/**
 * GitLab system notes → minddy activity.
 *
 * GitLab does not type its events: it writes a PHRASE in English in a
 * note marked `system` (“approved this merge request”, “added 3 commits”).
 * These sentences are stable and never localized — recognizing them gives the same
 * vocabulary as GitHub, therefore the same icon and the same translated text.
 *
 * What no pattern recognizes remains under `system`, with the sentence from GitLab:
 * a fact said in English is better than a lost fact. It is also the net which
 * collects the sentences that GitLab will add after us.
 */
const GITLAB_SYSTEM_PATTERNS: Array<{
  re: RegExp;
  kind: PrTimelineKind;
  /** What captured groups fill out, in order. */
  fill?: (event: PrTimelineEvent, m: RegExpMatchArray) => void;
}> = [
  { re: /^approved this merge request/i, kind: "reviewed", fill: (e) => (e.reviewState = "approved") },
  {
    re: /^unapproved this merge request/i,
    kind: "review_dismissed",
  },
  {
    re: /^requested review from @?([\w.-]+)/i,
    kind: "review_requested",
    fill: (e, m) => (e.subject = m[1]),
  },
  {
    re: /^removed review request for @?([\w.-]+)/i,
    kind: "review_request_removed",
    fill: (e, m) => (e.subject = m[1]),
  },
  {
    re: /^added (\d+) commits?/i,
    kind: "committed",
    fill: (e, m) => (e.commitCount = Number(m[1])),
  },
  { re: /^force[- ]pushed/i, kind: "force_pushed" },
  {
    re: /^(?:added|assigned) to @?([\w.-]+)|^assigned to @?([\w.-]+)/i,
    kind: "assigned",
    fill: (e, m) => (e.subject = m[1] ?? m[2] ?? null),
  },
  {
    re: /^unassigned @?([\w.-]+)/i,
    kind: "unassigned",
    fill: (e, m) => (e.subject = m[1]),
  },
  {
    re: /^added ~\d+ label/i,
    kind: "labeled",
  },
  {
    re: /^removed ~\d+ label/i,
    kind: "unlabeled",
  },
  {
    // “changed title from **{-old-}** to **{+new+}**”: GitLab frames the
    // part removed from `{- -}` and added from `{+ +}`, in bold markdown.
    re: /^changed title from \*\*(.+?)\*\* to \*\*(.+?)\*\*\s*$/i,
    kind: "renamed",
    fill: (e, m) => {
      e.from = stripGitlabDiffMarkers(m[1]);
      e.to = stripGitlabDiffMarkers(m[2]);
    },
  },
  { re: /^marked this merge request as \*\*ready\*\*/i, kind: "ready_for_review" },
  { re: /^marked this merge request as \*\*draft\*\*/i, kind: "converted_to_draft" },
  { re: /^merged$/i, kind: "merged" },
  { re: /^closed$/i, kind: "closed" },
  { re: /^reopened$/i, kind: "reopened" },
  { re: /^changed milestone to %(.+)$/i, kind: "milestoned", fill: (e, m) => (e.name = m[1]) },
  { re: /^removed milestone/i, kind: "demilestoned" },
  {
    re: /^mentioned in (?:merge request|issue|commit) (\S+)/i,
    kind: "cross_referenced",
    fill: (e, m) => (e.reference = m[1]),
  },
  { re: /^locked this merge request/i, kind: "locked" },
  { re: /^unlocked this merge request/i, kind: "unlocked" },
  {
    re: /^enabled an automatic merge|^enabled automatic (?:add to merge train|merge)/i,
    kind: "auto_merge_enabled",
  },
  { re: /^(?:aborted|canceled|cancelled) the automatic merge/i, kind: "auto_merge_disabled" },
];

/** `{-removed-}` / `{+added+}`: the diff markers that GitLab slips into its sentences. */
function stripGitlabDiffMarkers(text: string): string {
  return text.replace(/\{[-+](.*?)[-+]\}/g, "$1").trim();
}

/**
 * A system sentence from GitLab, ready to read in plain text. She arrives in
 * markdown (`**gras**`, diff markers, links) as it goes to a
 * line of text: without this cleaning, the activity would display its asterisks.
 */
function plainSystemText(body: string): string {
  return stripGitlabDiffMarkers(body)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[(.*?)\]\((?:.*?)\)/g, "$1")
    .trim();
}

/** A GitLab note, reduced to the fields that the timeline reads. */
export interface RawGitlabSystemNote {
  id: number;
  body?: string;
  system?: boolean;
  author?: { username?: string; avatar_url?: string | null } | null;
  created_at: string;
}

export function fromGitlabSystemNotes(
  notes: RawGitlabSystemNote[],
  noteUrl: (noteId: number) => string,
): PrTimelineEvent[] {
  const events: PrTimelineEvent[] = [];
  for (const note of notes) {
    if (!note.system) continue;
    const body = (note.body ?? "").trim();
    if (!body) continue;
    const actor = note.author?.username
      ? { login: note.author.username, avatar_url: note.author.avatar_url ?? null }
      : null;
    const event: PrTimelineEvent = {
      id: `note:${note.id}`,
      kind: "system",
      actor,
      createdAt: note.created_at,
      url: noteUrl(note.id),
    };
    const match = GITLAB_SYSTEM_PATTERNS.find((p) => p.re.test(body));
    if (match) {
      event.kind = match.kind;
      match.fill?.(event, body.match(match.re) as RegExpMatchArray);
    } else {
      // The fallback keeps the GitLab sentence — it is this which will carry the meaning.
      event.body = plainSystemText(body);
    }
    events.push(event);
  }
  return events;
}

/**
 * Order of the thread: from the OLDEST to the most recent, like the two forges and like
 * dial it at the bottom of the view. The undated facts are placed at the END — they
 * are rare (a commit without an author date) and putting them at the beginning would open
 * the conversation about an orphan.
 */
export function sortTimelineOlderFirst<T extends { createdAt: string | null; id: string }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id);
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
