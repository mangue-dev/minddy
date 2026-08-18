import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { buildForgeAssigneeIndex } from "@/lib/server/git/forge-members";

/**
 * Who has the right to make a project owner spend, and how many
 * times (MIN-330).
 *
 * `@numo` in a pull request comment initiates a replay, and this
 * replay is carried by a minddy account — that of the OWNER of the project
 * (`pr-mention.ts`). The comment is written at the forge: on a deposit
 * PUBLIC, by anyone. Without guard, an unknown person empties the quota, the budget and
 * the owner's BYOK key at zero cost, and pushes the passage of the text in the
 * context of the agent.
 *
 * Two guards, and they answer two different questions:
 *
 * 1. **Is this someone from the house?** The author of the comment must be
 * linked to a MEMBER of a project which links this repository, by his account of
 * connected forge (`git_user_identities` on the GitHub side, the OAuth connection on the
 side * GitLab) — exactly the bridge that issue sync already uses to
 * assign a ticket, reused here to authorize a spend.
 *
 * **The default on a public repository is refusal**, with no exception in v1: an
 * external contributor who writes `@numo` gets nothing, and the owner
 * keeps triggering by the "have Numo verify" button. A
 * allowlist per repository remains possible later — it would have to be placed in
 * `project_git_links`, and above all a surface to edit it. As long as this
 * surface does not exist, opening it would mean opening it for everyone.
 *
 * 2. **How many times?** A legitimate member remains narrow-minded: a compromised identity
 *, or an automation that comments in a loop, would spend
 * that much than a stranger. The terminal is PERSISTENT (`claim_forge_mention`) because
 * the webhook receiver is distributed — a counter in memory only limits
 * the instance that hosts it.
 *
 * Nothing here raises: an exploding guard would cause the webhook to fail, forge
 * would re-deliver, and the mention would loop again. A basic failure is therefore worth
 * REFUSAL (fail-closed): this is the only response that does not transform an incident
 * into a budget drain.
 */

/** Window common to the three counters. */
export const MENTION_WINDOW_SECONDS = 60 * 60;

/** Triggers per member and per repository in the window. */
export const MENTION_LIMIT_PER_AUTHOR = 10;

/** Triggers for the entire repository, all members combined. */
export const MENTION_LIMIT_PER_REPO = 30;

/**
 * Rejections addressed to an unrelated author: the first is commented, the following
 * are silent. Without this counter, the refusal response would itself be
 * even the amplifier — a comment from the bot per mention of the attacker.
 */
const DENIAL_LIMIT_PER_AUTHOR = 1;

/**
 * Counts this trigger and returns its rank in the current window, or `null`
 * if the base has not responded. `null` constitutes refusal by the caller.
 */
async function claim(key: string): Promise<number | null> {
  try {
    const { data, error } = await getServiceClient().rpc("claim_forge_mention", {
      p_key: key,
      p_window_seconds: MENTION_WINDOW_SECONDS,
    });
    if (error) {
      console.error("[forge-mention-guard] throttle unavailable:", error.message);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (err) {
    console.error("[forge-mention-guard] throttle failed:", (err as Error).message);
    return null;
  }
}

/**
 * Is the author of this comment a member of one of the projects that knows
 * this repository? `false` on an absent login (a payload without an author doesn't look like anyone) as well as on a forge account that no one has logged in.
 */
export async function isForgeAuthorMember(params: {
  provider: RepoProviderId;
  projectIds: string[];
  authorLogin: string | null;
}): Promise<boolean> {
  const login = params.authorLogin?.trim().toLowerCase();
  if (!login) return false;
  for (const projectId of params.projectIds) {
    const index = await buildForgeAssigneeIndex({
      projectId,
      provider: params.provider,
    });
    if (index.has(login)) return true;
  }
  return false;
}

/** What the flow guard responds to, and what the caller does with it. */
export interface ThrottleVerdict {
  allowed: boolean;
  /** True ONCE per window: crossing, the only refusal that we comment on. */
  notify: boolean;
}

/** Meter key — the repository qualified by its forge, never an internal id. */
function repoKey(provider: RepoProviderId, repoFullName: string): string {
  return `${provider}:${repoFullName.toLowerCase()}`;
}

/**
 * Triggering a MEMBER: limited by author AND by deposit. The two
 * counters advance with each pass — this is intentional, a burst must weigh on
 * the deposit even if it comes from several accounts.
 */
export async function claimMemberMention(params: {
  provider: RepoProviderId;
  repoFullName: string;
  authorLogin: string | null;
}): Promise<ThrottleVerdict> {
  const repo = repoKey(params.provider, params.repoFullName);
  const login = params.authorLogin?.trim().toLowerCase() || "unknown";
  const [authorCount, repoCount] = await Promise.all([
    claim(`mention:${repo}:${login}`),
    claim(`mention:${repo}`),
  ]);
  if (authorCount == null || repoCount == null) return { allowed: false, notify: false };

  const allowed =
    authorCount <= MENTION_LIMIT_PER_AUTHOR && repoCount <= MENTION_LIMIT_PER_REPO;
  const notify =
    authorCount === MENTION_LIMIT_PER_AUTHOR + 1 ||
    repoCount === MENTION_LIMIT_PER_REPO + 1;
  return { allowed, notify };
}

/**
 * The refusal of a NON-MEMBER: nothing happens, and we only tell the first person. The
 * return value therefore only carries `notify` — `allowed` is always false.
 */
export async function claimDenialNotice(params: {
  provider: RepoProviderId;
  repoFullName: string;
  authorLogin: string | null;
}): Promise<boolean> {
  const repo = repoKey(params.provider, params.repoFullName);
  const login = params.authorLogin?.trim().toLowerCase() || "unknown";
  const count = await claim(`denied:${repo}:${login}`);
  return count != null && count <= DENIAL_LIMIT_PER_AUTHOR;
}
