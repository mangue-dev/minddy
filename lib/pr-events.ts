import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Activity events traced for the life of a pull request / merge request:
 * open it, reopen it, push commits to it, comment on it (thread or code), and
 * review gestures — approve, request changes, accept (merge),
 * refuse (close). Shared between broadcast (agent + in-app routes + webhooks
 * GitHub/GitLab) and rendering of the activity log (timeline).
 *
 * `pr_reopened` missed until MIN-164: this was the only transition in the cycle
 * life without line. The ticket said “refused” then went through again without
 * that nothing explains why - and the reopening made by Numo could not be told
 * not at all (`registerPr` only issued `pr_opened` on a real opening).
 */
export const PR_ACTION_EVENT_TYPES = [
  "pr_approved",
  "pr_accepted",
  "pr_rejected",
  "pr_changes_requested",
  "pr_opened",
  "pr_reopened",
  "pr_committed",
  "pr_commented",
  "pr_code_commented",
] as const;

export type PrActionEventType = (typeof PR_ACTION_EVENT_TYPES)[number];

/**
 * Window for grouping REPEATABLE gestures (see `collapsesInBurst`): at
 * within this window, the same actor who repeats the same gesture on the same PR
 * only produces one line. Locked onto that of the anti-echo — the hook that returns
 * after an in-app action falls in the same second.
 */
export const PR_EVENT_BURST_MS = 2 * 60_000;

/**
 * Does this type of event cluster together in a burst?
 *
 * True for COMMENTS only: a GitHub review of eight comments from
 * line, that's eight `pull_request_review_comment` in a few milliseconds for
 * A SINGLE gesture — eight times “commented the code of PR #12” would make the
 * illegible newspaper. The other gestures are distinct facts, including the
 * pushs successifs : chacun garde sa ligne.
 */
export function collapsesInBurst(type: string): boolean {
  return type === "pr_commented" || type === "pr_code_commented";
}

/** Original provider of a PR action coming from a webhook (registry id). */
export type ForgeProvider = RepoProviderId;

/**
 * Provider marker encoded in `from_value` (MIN-69): GitHub events
 * logs carry the bare login — GitHub therefore remains the unprefixed form, and
 * GitLab is distinguished by the prefix `gitlab:`. No dedicated column, so EVERYTHING
 * reader of `from_value` of an event `pr_*` must decode via `forgePrActor`
 * (timeline AND MCP recentActivity output) — never display the raw value.
 */
const GITLAB_ACTOR_PREFIX = "gitlab:";

/**
 * Encode l'acteur (login + provider) vers `from_value`.
 *
 * Called with a null login by IN-APP gestures, which have no actor
 * forge to name — the actor there is the member minddy (`actor_id`). What they
 * encode anyway, it is the PROVIDER: without it, `describeEvent` falls back to
 * “pull request” and a GitLab user reads from GitHub on their own ticket.
 */
export function forgeActorValue(
  provider: ForgeProvider,
  login: string | null,
): string | null {
  if (provider === "gitlab") return `${GITLAB_ACTOR_PREFIX}${login ?? ""}`;
  return login;
}

/** Decodes `from_value` from a PR webhook → provider + displayable login event. */
export function forgePrActor(fromValue: string | null): {
  provider: ForgeProvider;
  login: string | null;
} {
  if (fromValue?.startsWith(GITLAB_ACTOR_PREFIX)) {
    return {
      provider: "gitlab",
      login: fromValue.slice(GITLAB_ACTOR_PREFIX.length) || null,
    };
  }
  return { provider: "github", login: fromValue || null };
}

/**
 * True if the event is a PR action coming DIRECTLY from the provider (webhook
 * GitHub/GitLab) rather than an in-app click: no minddy actor (`actor_id`
 * null), the login provider is carried by `from_value`. In-app actions carry
 * always a `actor_id` (the member) → this test excludes them.
 */
export function isForgePrEvent(e: { type: string; actor_id: string | null }): boolean {
  return !e.actor_id && (PR_ACTION_EVENT_TYPES as readonly string[]).includes(e.type);
}
