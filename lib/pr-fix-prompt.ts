import type { ChecksSummary } from "./agent-api";
import type {
  PullRequestFeedbackContext,
  PullRequestFeedbackThread,
} from "./pr-unresolved-conversations";
import { threadLocation } from "./pr-unresolved-conversations";

/** What the fix prompt carries BEYOND the failing checks: the unresolved
    review conversations and the branch state the PR view already knows. */
export interface PullRequestFixExtras {
  unresolvedThreads: PullRequestFeedbackThread[];
  branchOutOfDate: boolean;
}

const NO_EXTRAS: PullRequestFixExtras = { unresolvedThreads: [], branchOutOfDate: false };

/**
 * The facts both fix prompts share: the pull request metadata, the failing
 * checks the forge named, and the unresolved review conversations. Each
 * audience words what to do with a conversation (`threads`).
 */
function fixFacts(
  context: PullRequestFeedbackContext,
  checks: ChecksSummary | null,
  extras: PullRequestFixExtras,
  threads: { header: string; suffix: string },
): string[] {
  const target = context.title.trim() || `Pull request #${context.number}`;
  const lines = [
    `Pull request: #${context.number} — ${target}`,
    context.url ? `URL: ${context.url}` : null,
    context.base ? `Base branch: ${context.base}` : null,
    context.head ? `Head branch: ${context.head}` : null,
  ].filter((line): line is string => line !== null);
  const failing = (checks?.checks ?? []).filter(
    (check) => check.state === "failure",
  );
  if (failing.length > 0) {
    lines.push(
      "",
      "The following checks are failing:",
      ...failing.map((check) =>
        check.description
          ? `- ${check.name} — ${check.description}`
          : `- ${check.name}`,
      ),
    );
  }
  if (extras.unresolvedThreads.length > 0) {
    lines.push(
      "",
      threads.header,
      ...extras.unresolvedThreads.map(
        (thread, index) =>
          `- Conversation ${index + 1} on ${threadLocation(thread)}${
            thread.resolution?.outdated ? " (outdated code context)" : ""
          }${threads.suffix}`,
      ),
    );
  }
  return lines;
}

/**
 * A portable coding-agent prompt asking the agent to find what is wrong on a
 * failing pull request and to fix it. Prompts stay in English across UI
 * locales, like issue, notebook, and page prompts.
 *
 * The failing checks, when the forge named them, are spelled out so the agent
 * does not have to rediscover what is red; unresolved review conversations
 * and an out-of-date branch are spelled out too, when the card knows them —
 * everything the "fix" card stands for, not only the checks.
 */
export function buildPullRequestFixPrompt(
  context: PullRequestFeedbackContext,
  checks: ChecksSummary | null,
  extras: PullRequestFixExtras = NO_EXTRAS,
): string {
  const lines = [
    "Identify what is going wrong on this pull request and fix it.",
    "",
    ...fixFacts(context, checks, extras, {
      header: "The following review conversations are still unresolved and must be addressed:",
      suffix: " — address the reviewer's remarks, or reply and resolve it once handled.",
    }),
  ];
  if (extras.branchOutOfDate) {
    lines.push(
      "",
      "The head branch is behind its base branch: update it (rebase or merge the base) before finishing.",
    );
  }
  lines.push(
    "",
    "Investigate why the pull request is failing, correct the code, and push the fix. Preserve unrelated work, and run the smallest relevant checks until they pass.",
  );
  return lines.join("\n");
}

/**
 * The prompt behind **Fix with Numo**. Numo is a tracking assistant (MIN-721):
 * it reads the pull request and can reply to and resolve its review
 * conversations, but it never writes code or pushes commits. The prompt asks
 * for exactly that, and has Numo name the changes that still need code so
 * the user hands them to their own coding agent with **Copy fix prompt**.
 */
export function buildPullRequestNumoFixPrompt(
  context: PullRequestFeedbackContext,
  checks: ChecksSummary | null,
  extras: PullRequestFixExtras = NO_EXTRAS,
): string {
  const lines = [
    "Help me get this pull request ready to merge, without changing its code: you cannot write code or push commits.",
    "",
    ...fixFacts(context, checks, extras, {
      header: "The following review conversations are still unresolved:",
      suffix: "",
    }),
  ];
  if (extras.branchOutOfDate) {
    lines.push("", "The head branch is behind its base branch.");
  }
  lines.push(
    "",
    "Read the pull request, its checks and its review conversations. Reply to the conversations that need no code change, and resolve the ones the current branch already addresses. Then tell me which changes still need code, including failing checks and an out-of-date branch, so I can give them to my coding agent with the \"Copy fix prompt\" action.",
  );
  return lines.join("\n");
}
