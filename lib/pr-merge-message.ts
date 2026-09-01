import type { PullRequestCommit, PullRequestRef } from "@/lib/agent-api";
import type { MergeMethod, RepositoryMergePolicy } from "@/lib/pr-readiness";

export interface MergeCommitMessageDraft {
  title: string;
  message: string;
}

interface MergeCommitMessageInput {
  provider: "github" | "gitlab";
  method: MergeMethod;
  pullRequest: PullRequestRef;
  commits: PullRequestCommit[];
  policy: RepositoryMergePolicy | null | undefined;
}

function splitCommitMessage(message: string): MergeCommitMessageDraft {
  const [title = "", ...body] = message.replace(/\r\n/g, "\n").split("\n");
  return { title: title.trim(), message: body.join("\n").trim() };
}

function githubTitle(title: string, number: number): string {
  return `${title} (#${number})`;
}

function commitMessages(commits: PullRequestCommit[]): string {
  if (commits.length === 1) return splitCommitMessage(commits[0]?.message ?? "").message;
  return commits.map((commit) => commit.message.trim()).filter(Boolean).join("\n\n");
}

export function shouldSubmitCustomMergeMessage(
  _provider: "github" | "gitlab",
  edited: boolean,
): boolean {
  return edited;
}

/** Build the same editable defaults the forge derives before creating one commit. */
export function defaultMergeCommitMessage({
  provider,
  method,
  pullRequest: pr,
  commits,
  policy,
}: MergeCommitMessageInput): MergeCommitMessageDraft | null {
  if (method === "rebase") return null;

  if (provider === "gitlab") {
    const configured = policy?.commitMessages?.gitlab;
    if (method === "merge" && configured?.mergeCreatesCommit === false) return null;
    const rendered =
      method === "squash"
        ? pr.defaultSquashCommitMessage
        : pr.defaultMergeCommitMessage;
    return rendered == null ? null : splitCommitMessage(rendered);
  }

  const configured = policy?.commitMessages?.github ?? {
    squashTitle: "COMMIT_OR_PR_TITLE" as const,
    squashMessage: "COMMIT_MESSAGES" as const,
    mergeTitle: "MERGE_MESSAGE" as const,
    mergeMessage: "PR_TITLE" as const,
  };
  const prTitle = pr.title?.trim() ?? "";
  if (method === "squash") {
    const singleCommitTitle = splitCommitMessage(commits[0]?.message ?? "").title;
    const title =
      configured.squashTitle === "COMMIT_OR_PR_TITLE" && commits.length === 1
        ? singleCommitTitle || prTitle
        : prTitle;
    const message =
      configured.squashMessage === "PR_BODY"
        ? pr.body?.trim() ?? ""
        : configured.squashMessage === "COMMIT_MESSAGES"
          ? commitMessages(commits)
          : "";
    return { title: githubTitle(title, pr.number), message };
  }

  const title =
    configured.mergeTitle === "PR_TITLE"
      ? githubTitle(prTitle, pr.number)
      : `Merge pull request #${pr.number} from ${(pr.headLabel ?? pr.head ?? "branch").replace(":", "/")}`;
  const message =
    configured.mergeMessage === "PR_BODY"
      ? pr.body?.trim() ?? ""
      : configured.mergeMessage === "PR_TITLE"
        ? prTitle
        : "";
  return { title, message };
}
