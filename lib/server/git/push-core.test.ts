import { describe, expect, it } from "vitest";

import {
  commitTitle,
  GITHUB_PUSH_COMMIT_LIMIT,
  normalizeGithubPush,
  normalizeGitlabPush,
} from "./push-core";

const ZERO = "0000000000000000000000000000000000000000";

describe("normalizeGithubPush", () => {
  const payload = {
    ref: "refs/heads/main",
    before: "a".repeat(40),
    after: "b".repeat(40),
    created: false,
    deleted: false,
    forced: true,
    repository: { default_branch: "main" },
    sender: { id: 7, login: "camille", avatar_url: "https://avatars.test/7" },
    commits: [
      {
        id: "b".repeat(40),
        message: "Fixes MIN-42\n\nDetails.",
        timestamp: "2026-11-28T10:00:00+01:00",
        author: { name: "Camille Roy", email: "Camille@Example.test", username: "camille" },
      },
      { id: "c".repeat(40), message: "MIN-7", author: { name: "Someone", username: "other" } },
    ],
  };

  it("reads the branch, the range and the commits", () => {
    const push = normalizeGithubPush(payload);
    expect(push).toMatchObject({
      branch: "main",
      before: "a".repeat(40),
      after: "b".repeat(40),
      forced: true,
      created: false,
      deleted: false,
      defaultBranch: "main",
      onDefaultBranch: true,
      truncated: false,
      pusher: { accountId: "7", login: "camille" },
    });
    expect(push?.commits).toEqual([
      {
        sha: "b".repeat(40),
        message: "Fixes MIN-42\n\nDetails.",
        authorLogin: "camille",
        authorAvatarUrl: "https://avatars.test/7",
        authorName: "Camille Roy",
        authorEmail: "camille@example.test",
        committedAt: "2026-11-28T10:00:00+01:00",
      },
      {
        sha: "c".repeat(40),
        message: "MIN-7",
        authorLogin: "other",
        authorAvatarUrl: null,
        authorName: "Someone",
        authorEmail: null,
        committedAt: null,
      },
    ]);
  });

  it("tells a branch creation and a deletion from the zero SHA", () => {
    const created = normalizeGithubPush({
      ...payload, ref: "refs/heads/min-42-fix", before: ZERO, commits: [],
    });
    expect(created).toMatchObject({
      branch: "min-42-fix", before: null, created: true, onDefaultBranch: false,
    });
    const deleted = normalizeGithubPush({ ...payload, after: ZERO, deleted: true, commits: [] });
    expect(deleted).toMatchObject({ after: null, deleted: true });
  });

  it("has no branch for a tag, and nothing without a ref", () => {
    expect(normalizeGithubPush({ ...payload, ref: "refs/tags/v1" })?.branch).toBeNull();
    expect(normalizeGithubPush({})).toBeNull();
    expect(normalizeGithubPush(null)).toBeNull();
  });

  it("flags a payload at the forge's commit limit as truncated", () => {
    const commits = Array.from({ length: GITHUB_PUSH_COMMIT_LIMIT }, (_, index) => ({
      id: index.toString(16).padStart(40, "f"), message: "x",
    }));
    expect(normalizeGithubPush({ ...payload, commits })?.truncated).toBe(true);
  });
});

describe("normalizeGitlabPush", () => {
  const payload = {
    object_kind: "push",
    ref: "refs/heads/min-42-fix",
    before: "a".repeat(40),
    after: "b".repeat(40),
    user_id: 12,
    user_username: "camille",
    user_email: "Camille@Example.test",
    user_avatar: "https://gitlab.test/camille.png",
    total_commits_count: 2,
    project: { default_branch: "main" },
    commits: [
      {
        id: "b".repeat(40),
        title: "MIN-42 rename",
        message: "MIN-42 rename\n",
        timestamp: "2026-11-28T09:00:00Z",
        author: { name: "Camille Roy", email: "camille@example.test" },
      },
      { id: "c".repeat(40), title: "Only a title", author: { name: "Alex", email: "alex@example.test" } },
    ],
  };

  it("attaches the pusher's account to the commits written under their email", () => {
    const push = normalizeGitlabPush(payload);
    expect(push).toMatchObject({
      branch: "min-42-fix",
      onDefaultBranch: false,
      forced: false,
      truncated: false,
      pusher: { accountId: "12", login: "camille" },
    });
    expect(push?.commits[0]).toMatchObject({
      authorLogin: "camille", authorAvatarUrl: "https://gitlab.test/camille.png",
    });
    expect(push?.commits[1]).toMatchObject({
      message: "Only a title", authorLogin: null, authorAvatarUrl: null, authorName: "Alex",
      authorEmail: "alex@example.test",
    });
  });

  it("is truncated when the hook counts more commits than it carries", () => {
    expect(normalizeGitlabPush({ ...payload, total_commits_count: 25 })?.truncated).toBe(true);
  });

  it("reads a creation, a deletion and a default-branch push", () => {
    expect(normalizeGitlabPush({ ...payload, before: ZERO })).toMatchObject({
      created: true, before: null,
    });
    expect(normalizeGitlabPush({ ...payload, after: ZERO })).toMatchObject({
      deleted: true, after: null,
    });
    expect(normalizeGitlabPush({ ...payload, ref: "refs/heads/main" })?.onDefaultBranch).toBe(true);
    expect(normalizeGitlabPush({ object_kind: "push" })).toBeNull();
  });
});

describe("commitTitle", () => {
  it("keeps the first line", () => {
    expect(commitTitle("Fix the board\r\n\r\nBody")).toBe("Fix the board");
    expect(commitTitle("")).toBe("");
  });
});
