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
  extras: PullRequestFixExtras = { unresolvedThreads: [], branchOutOfDate: false },
): string {
  const target = context.title.trim() || `Pull request #${context.number}`;
  const metadata = [
    `Pull request: #${context.number} — ${target}`,
    context.url ? `URL: ${context.url}` : null,
    context.base ? `Base branch: ${context.base}` : null,
    context.head ? `Head branch: ${context.head}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const failing = (checks?.checks ?? []).filter(
    (check) => check.state === "failure",
  );

  const lines = [
    "Identify what is going wrong on this pull request and fix it.",
    "",
    metadata,
  ];
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
      "The following review conversations are still unresolved and must be addressed:",
      ...extras.unresolvedThreads.map(
        (thread, index) =>
          `- Conversation ${index + 1} on ${threadLocation(thread)}${
            thread.resolution?.outdated ? " (outdated code context)" : ""
          } — address the reviewer's remarks, or reply and resolve it once handled.`,
      ),
    );
  }
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
