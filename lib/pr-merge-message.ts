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

function gitlabReference(pr: PullRequestRef): { local: string; full: string } {
  const local = `!${pr.number}`;
  try {
    const path = new URL(pr.url).pathname.replace(/^\/+|\/+$/g, "");
    const project = path.split("/-/")[0] ?? "";
    return { local, full: project ? `${project}${local}` : local };
  } catch {
    return { local, full: local };
  }
}

function expandGitlabTemplate(
  template: string,
  pr: PullRequestRef,
  commits: PullRequestCommit[],
): string {
  const reference = gitlabReference(pr);
  const first = commits[0]?.message.trim() ?? pr.title ?? "";
  const firstMultiline = commits.find((commit) => commit.message.includes("\n"));
  const firstMultilineParts = splitCommitMessage(firstMultiline?.message ?? "");
  const replacements: Record<string, string> = {
    source_branch: pr.head ?? "",
    target_branch: pr.base ?? "",
    title: pr.title ?? "",
    description: pr.body ?? "",
    issues: "",
    reference: reference.full,
    local_reference: reference.local,
    first_commit: first,
    first_multiline_commit: firstMultiline?.message.trim() ?? pr.title ?? "",
    first_multiline_commit_description: firstMultilineParts.message,
    url: pr.url,
    all_commits: commits.map((commit) => `* ${commit.message.trim()}`).join("\n"),
  };
  return template
    .split("\n")
    .filter((line) => {
      const onlyVariable = /^\s*%\{([a-z_]+)\}\s*$/.exec(line);
      return !onlyVariable || !!replacements[onlyVariable[1] ?? ""];
    })
    .join("\n")
    .replace(/%\{([a-z_]+)\}/g, (match, key: string) => replacements[key] ?? match)
    .trim();
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
    const template =
      method === "squash"
        ? configured?.squashTemplate ?? "%{title}"
        : configured?.mergeTemplate ??
          "Merge branch '%{source_branch}' into '%{target_branch}'\n\n%{title}\n\n%{issues}\n\nSee merge request %{reference}";
    return splitCommitMessage(expandGitlabTemplate(template, pr, commits));
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
