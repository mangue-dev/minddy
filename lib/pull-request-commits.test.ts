import { describe, expect, it } from "vitest";
import type { PullRequestCommit } from "./agent-api";
import { newestFirstPullRequestCommits } from "./pull-request-commits";

const commit = (sha: string): PullRequestCommit => ({
  sha,
  message: sha,
  author: null,
  authorName: null,
  authorEmail: null,
  authoredAt: null,
  url: null,
  verified: null,
  parentSha: null,
  additions: null,
  deletions: null,
});

describe("newestFirstPullRequestCommits", () => {
  it("places the newest commit at the top without mutating the API result", () => {
    const commits = [commit("old"), commit("middle"), commit("new")];

    expect(newestFirstPullRequestCommits(commits).map(({ sha }) => sha)).toEqual([
      "new",
      "middle",
      "old",
    ]);
    expect(commits.map(({ sha }) => sha)).toEqual(["old", "middle", "new"]);
  });
});
