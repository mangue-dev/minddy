import { describe, expect, it } from "vitest";

import type { PullRequestCommit, PullRequestRef } from "./agent-api";
import { defaultMergeCommitMessage } from "./pr-merge-message";
import { mapGithubMergePolicy, mapGitlabMergePolicy } from "./pr-readiness";

const pr: PullRequestRef = {
  number: 106,
  url: "https://github.com/mangue-dev/minddy/pull/106",
  state: "open",
  title: "Make the pull request view autonomous",
  body: "Explains the change.",
  head: "work/min-490",
  base: "main",
};

function commit(message: string): PullRequestCommit {
  return {
    sha: "a".repeat(40),
    message,
    author: null,
    authorName: null,
    authorEmail: null,
    authoredAt: null,
    url: null,
    verified: null,
    parentSha: null,
    additions: null,
    deletions: null,
  };
}

describe("defaultMergeCommitMessage", () => {
  it("matches GitHub's one-commit squash default", () => {
    const result = defaultMergeCommitMessage({
      provider: "github",
      method: "squash",
      pullRequest: pr,
      commits: [commit("Implement merge workspace\n\nKeep the details editable.")],
      policy: mapGithubMergePolicy({ allow_squash_merge: true }, null),
    });

    expect(result).toEqual({
      title: "Implement merge workspace (#106)",
      message: "Keep the details editable.",
    });
  });

  it("honors GitHub repository defaults for a multi-commit squash", () => {
    const result = defaultMergeCommitMessage({
      provider: "github",
      method: "squash",
      pullRequest: pr,
      commits: [commit("First change"), commit("Second change\n\nDetails")],
      policy: mapGithubMergePolicy(
        {
          allow_squash_merge: true,
          squash_merge_commit_title: "PR_TITLE",
          squash_merge_commit_message: "PR_BODY",
        },
        null,
      ),
    });

    expect(result).toEqual({
      title: "Make the pull request view autonomous (#106)",
      message: "Explains the change.",
    });
  });

  it("builds editable merge-commit defaults", () => {
    const result = defaultMergeCommitMessage({
      provider: "github",
      method: "merge",
      pullRequest: pr,
      commits: [],
      policy: mapGithubMergePolicy(
        {
          allow_merge_commit: true,
          merge_commit_title: "PR_TITLE",
          merge_commit_message: "BLANK",
        },
        null,
      ),
    });

    expect(result).toEqual({
      title: "Make the pull request view autonomous (#106)",
      message: "",
    });
  });

  it("expands GitLab's configured squash template", () => {
    const result = defaultMergeCommitMessage({
      provider: "gitlab",
      method: "squash",
      pullRequest: {
        ...pr,
        url: "https://gitlab.com/mangue-dev/minddy/-/merge_requests/106",
      },
      commits: [commit("First change")],
      policy: mapGitlabMergePolicy({
        squash_commit_template: "%{title}\n\nSee %{local_reference}",
      }),
    });

    expect(result).toEqual({
      title: "Make the pull request view autonomous",
      message: "See !106",
    });
  });

  it("does not show a merge commit editor for GitLab fast-forward merges", () => {
    expect(
      defaultMergeCommitMessage({
        provider: "gitlab",
        method: "merge",
        pullRequest: pr,
        commits: [],
        policy: mapGitlabMergePolicy({ merge_method: "ff" }),
      }),
    ).toBeNull();
  });

  it("does not offer one commit message for rebase", () => {
    expect(
      defaultMergeCommitMessage({
        provider: "github",
        method: "rebase",
        pullRequest: pr,
        commits: [],
        policy: null,
      }),
    ).toBeNull();
  });
});
