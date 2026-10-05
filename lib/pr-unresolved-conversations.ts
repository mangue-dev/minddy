import type { PullRequestReviewComment } from "./agent-api";
import {
  displayLineOf,
  groupReviewThreads,
  type ReviewThread,
  type ReviewThreadState,
} from "./pr-review-threads";

export type PullRequestFeedbackThread = ReviewThread<PullRequestReviewComment>;

export interface PullRequestFeedbackContext {
  number: number;
  title: string;
  url: string | null;
  base: string | null;
  head: string | null;
}

/** Review threads that still require action, in the order they were opened. */
export function unresolvedReviewThreads(
  comments: PullRequestReviewComment[],
  states: ReviewThreadState[],
): PullRequestFeedbackThread[] {
  return groupReviewThreads(comments, states).filter(
    (thread) => thread.resolution?.resolved === false,
  );
}

/** Keep resolved conversations last, grouping each section by its root reviewer. */
export function conversationReviewerGroups(threads: PullRequestFeedbackThread[]) {
  const groups: Array<{
    key: string;
    resolved: boolean;
    reviewer: PullRequestReviewComment["user"];
    threads: PullRequestFeedbackThread[];
  }> = [];
  for (const resolved of [false, true]) {
    const byReviewer = new Map<string, (typeof groups)[number]>();
    for (const thread of threads) {
      if (!!thread.resolution?.resolved !== resolved) continue;
      const login = thread.root.user?.login.toLowerCase() ?? "";
      let group = byReviewer.get(login);
      if (!group) {
        group = { key: `${resolved}:${login}`, resolved, reviewer: thread.root.user, threads: [] };
        byReviewer.set(login, group);
        groups.push(group);
      }
      group.threads.push(thread);
    }
  }
  return groups;
}

/** "path" or "path:line" where a review conversation sits — shared by the
    feedback prompt and the fix prompt, which both spell the threads out. */
export function threadLocation(thread: PullRequestFeedbackThread): string {
  const line = displayLineOf(thread.root);
  return line == null ? thread.root.path : `${thread.root.path}:${line}`;
}

function renderThread(thread: PullRequestFeedbackThread, index: number): string {
  const outdated = thread.resolution?.outdated ? " (outdated code context)" : "";
  const messages = thread.comments
    .map((comment) => {
      const author = comment.user?.login ? `@${comment.user.login}` : "Unknown reviewer";
      return `${author}:\n${comment.body.trim()}`;
    })
    .join("\n\n");

  return `### Conversation ${index + 1} — ${threadLocation(thread)}${outdated}\n\n${messages}`;
}

/**
 * A portable coding-agent prompt containing the pull request and every selected
 * unresolved review conversation. Prompts stay in English across UI locales,
 * like issue, notebook, and page prompts.
 */
export function buildPullRequestFeedbackPrompt(
  context: PullRequestFeedbackContext,
  threads: PullRequestFeedbackThread[],
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
  const scope =
    threads.length === 1
      ? "the unresolved review conversation below"
      : `the ${threads.length} unresolved review conversations below`;

  return `Address ${scope} on this pull request.\n\n${metadata}\n\nInspect the current code before changing it because the branch may have moved since the comments were posted. Preserve unrelated work, implement each requested change, and run the smallest relevant checks. Once a conversation's request is fully addressed, say so in the thread and mark that conversation resolved; never resolve one whose request is still open.\n\n${threads
    .map(renderThread)
    .join("\n\n")}`;
}
