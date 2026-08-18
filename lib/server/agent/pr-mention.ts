import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { mentionsNumo } from "@/lib/server/assistant/comment-agent";
import type { RepoProviderId } from "@/lib/repo-providers";
import { findPullRequestByNumber, type PullRequestRow } from "./pull-requests";
// Type seulement : l'import de valeur reste paresseux plus bas (`pr-actions`
// pull the entire module from PR routes, and `next/server` with it).
import type { PrScope } from "./pr-actions";
import {
  claimDenialNotice,
  claimMemberMention,
  isForgeAuthorMember,
  MENTION_LIMIT_PER_AUTHOR,
} from "./forge-mention-guard";

/**
 * `@numo` written FROM the forge (MIN-162).
 *
 * From minddy, the comment route sees the message and triggers the
 * pass itself. From github.com, the only signal is the event
 * `issue_comment` — which the receiver was already processing, but only to trace
 * "commented the PR".
 *
 * Two things are missing from the hook that the route has on hand, and they decide to
 * all:
 *
 * 1. **Who pays.** A model ride is counted on a minddy
 * account (`ai_usage.user_id`), and the author of the comment does not necessarily have one.
 * It is therefore the OWNER of a project who bears the expense — the same rule that
 * everywhere else for background work, and the only account whose existence
 * is guaranteed. It is also what is used to resolve the
 * forge token, as for any reading.
 *
 * This project was found by the linked TICKET, and a PR without a ticket therefore saw
 * its mention ignored. This was a shortcut, corrected by MIN-168: a pull
 * request does not belong to a ticket, it belongs to a REPOSITORY, which
 * projects link to (`project_git_links`) — exactly the resolution that serves the
 * "have Numo check" button. The ticket remains the best path
 * when it exists (it is HIS project which is concerned); without it, we take a
 * project which links the repository. Without either of these, there's really no one:
 * we don't do anything.
 *
 * 2. **Who has the right to charge for it.** The body of the comment comes from the
 * forge, where a public repository lets anyone write. The author must therefore
 * be linked to a member of a project which links this repository, and its
 * triggering remains limited in time — the two guards live in
 * `forge-mention-guard.ts`, which also carries the reason for refusal by default.
 *
 * 3. **If this message comes from us.** A comment posted from minddy comes back
 * by webhook a few seconds later: without guarding, the pass would leave
 * twice. Three nets, from the safest to the widest — the author is the bot of
 * the App (dismissed by the caller), the echo recognized on the event that the route
 * has just written (`isPrActionEcho`, also at the caller), and the session
 * already opened on this PR, verified at the time of start.
 *
 * What DOES NOT change depending on the source: what `@numo` triggers. A
 * reread, never a code run — cf. `startNumoPrReview`.
 */

/** The projects that have a say in this PR, in the order of the payer. */
interface MentionScope {
  /** The minddy account which will carry the proofreading. */
  userId: string;
  /** All projects concerned: we look for the author among THEIR members. */
  projectIds: string[];
}

/**
 * The minddy account which will carry out the proofreading, and the projects where to look for the author
 * of the comment. Two paths for the payer, in this order: the owner of the
 * project of the linked TICKET when there is one (it is his project which is concerned),
 * otherwise the owner of a project which LINKS THE DEPOSIT. Null only when no longer
 * no one knows this repository.
 *
 * Membership is judged on ALL these projects and not just that of the
 * payer: two projects can link the same repository, and a member of one like
 * of the other is at home on this pull request.
 */
async function scopeForPr(pr: PullRequestRow): Promise<MentionScope | null> {
  const service = getServiceClient();
  const ordered: Array<{ id: string; owner: string | null }> = [];

  if (pr.issue_id) {
    const { data } = await service
      .from("issues")
      .select("project_id, projects(owner_id)")
      .eq("id", pr.issue_id)
      .maybeSingle();
    const row = data as {
      project_id?: string | null;
      projects?: { owner_id?: string } | null;
    } | null;
    if (row?.project_id) {
      ordered.push({ id: row.project_id, owner: row.projects?.owner_id ?? null });
    }
  }

  // PR without ticket: the repository remains attached to projects, and one of them has a
  // owner. Ordered by date of connection so that the choice is STABLE of one
  // mention to the other — two projects which link the same repository must not be
  // resend the invoice randomly.
  const { data } = await service
    .from("project_git_links")
    .select("project_id, created_at, projects(owner_id)")
    .eq("provider", pr.provider)
    .eq("repo_full_name", pr.repo_full_name)
    .order("created_at", { ascending: true });
  for (const row of (data ?? []) as Array<{
    project_id?: string | null;
    projects?: { owner_id?: string } | null;
  }>) {
    if (!row.project_id || ordered.some((p) => p.id === row.project_id)) continue;
    ordered.push({ id: row.project_id, owner: row.projects?.owner_id ?? null });
  }

  const userId = ordered.find((p) => p.owner)?.owner;
  if (!userId) return null;
  return { userId, projectIds: ordered.map((p) => p.id) };
}

/**
 * The two refusals, as written under the comment. In English like
 * the rest of what Numo says at the forge (his prompt, his tool errors): this
 * thread is read by forge accounts, not by a minddy session whose language on
 * would know.
 */
const DENIAL_BODIES = {
  notMember: (login: string | null) =>
    `${login ? `@${login} — ` : ""}I only take requests from members of the minddy ` +
    `project this repository is linked to, with their git account connected in ` +
    `minddy. Nothing was started.\n\n` +
    `If you are on the team, connect your git account in minddy (Settings → ` +
    `Git accounts) and mention me again.`,
  throttled: `That's a lot of \`@numo\` on this repository in the last hour, so I ` +
    `stopped there (${MENTION_LIMIT_PER_AUTHOR} reviews per person per hour). ` +
    `Mention me again later, or start the review from minddy.`,
} as const;

/** Post the refusal under the pull request. Best-effort: never lifts. */
async function replyOnPr(scope: PrScope, body: string): Promise<void> {
  try {
    await scope.forge.createPullRequestComment({ ...scope.call, body });
  } catch (err) {
    // The refusal itself does not have to cause the webhook to fail: the mention is already
    // rejected, this comment is just politeness explaining it.
    console.warn("[pr-mention] refus non commenté :", (err as Error).message);
  }
}

/**
 * Triggers replay if this forge comment mentions Numo. Never raise
 *: the webhook must never fail for this — the forge would re-deliver, and
 * the mention would loop again.
 */
export async function handleForgeNumoMention(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  prNumber: number;
  body: string | null | undefined;
  authorLogin: string | null;
}): Promise<void> {
  const body = opts.body ?? "";
  if (!mentionsNumo(body)) return;

  try {
    const pr = await findPullRequestByNumber({
      provider: opts.provider,
      repoFullName: opts.repoFullName,
      number: opts.prNumber,
    });
    if (!pr) return;

    const target = await scopeForPr(pr);
    if (!target) {
      // NO more projects link this repository (link since removed): no one to
      // which to charge the expense, and no right to read. We say it, rather than
      // deviner un compte.
      console.warn(
        `[pr-mention] @numo ignoré sur ${opts.repoFullName}#${opts.prNumber} : aucun projet ne lie ce dépôt`,
      );
      return;
    }
    const { userId, projectIds } = target;

    // MIN-330 — authorization BEFORE debit: a stranger must not consume
    // the counter of a deposit (this would be a denial of service to members), it
    // has his own, which only serves to answer him once.
    const member = await isForgeAuthorMember({
      provider: opts.provider,
      projectIds,
      authorLogin: opts.authorLogin,
    });
    const throttle = member
      ? await claimMemberMention({
          provider: opts.provider,
          repoFullName: opts.repoFullName,
          authorLogin: opts.authorLogin,
        })
      : { allowed: false, notify: false };

    if (!member || !throttle.allowed) {
      const notify = member
        ? throttle.notify
        : await claimDenialNotice({
            provider: opts.provider,
            repoFullName: opts.repoFullName,
            authorLogin: opts.authorLogin,
          });
      console.warn(
        `[pr-mention] @numo refusé sur ${opts.repoFullName}#${opts.prNumber} ` +
          `(${opts.authorLogin ?? "auteur inconnu"}) : ${member ? "débit" : "non-membre"}`,
      );
      if (!notify) return;
      // Resolving the range COSTS a forge token: we only do it for the
      // only refusal that we comment on, not for each of them.
      const { resolvePrScope } = await import("./pr-actions");
      const scope = await resolvePrScope(userId, pr);
      if (scope) {
        await replyOnPr(
          scope,
          member ? DENIAL_BODIES.throttled : DENIAL_BODIES.notMember(opts.authorLogin),
        );
      }
      return;
    }

    // Lazy import: `pr-actions` pulls the entire module from PR routes (and
    // `next/server`), where this file is loaded by the webhook receiver.
    const { resolvePrScope, startNumoPrReview } = await import("./pr-actions");
    const scope = await resolvePrScope(userId, pr);
    if (!scope) return;

    await startNumoPrReview({
      scope,
      userId,
      question: { author: opts.authorLogin, body },
    });
  } catch (err) {
    console.error("[pr-mention] @numo depuis la forge a échoué :", (err as Error).message);
  }
}
