import type { ChecksSummary } from "./agent-api";
import type { PullRequestFeedbackContext } from "./pr-unresolved-conversations";

/**
 * A portable coding-agent prompt asking the agent to find what is wrong on a
 * failing pull request and to fix it. Prompts stay in English across UI
 * locales, like issue, notebook, and page prompts.
 *
 * The failing checks, when the forge named them, are spelled out so the agent
 * does not have to rediscover what is red; the rest of the failure is left to
 * its investigation on purpose — the prompt must stay truthful when the card
 * only knows "something is red".
 */
export function buildPullRequestFixPrompt(
  context: PullRequestFeedbackContext,
  checks: ChecksSummary | null,
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
  lines.push(
    "",
    "Investigate why the pull request is failing, correct the code, and push the fix. Preserve unrelated work, and run the smallest relevant checks until they pass.",
  );
  return lines.join("\n");
}
