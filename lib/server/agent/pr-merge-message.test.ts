import { afterEach, describe, expect, it, vi } from "vitest";

import { mergeMergeRequest } from "./mr";
import { mergePullRequest } from "./pr";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("editable merge commit messages", () => {
  it("passes GitHub commit title and message independently", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ merged: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await mergePullRequest({
      token: "token",
      repoFullName: "mangue-dev/minddy",
      number: 106,
      method: "squash",
      commitTitle: "Autonomous pull request view (#106)",
      commitMessage: "Preserve the repository defaults, then let the maintainer edit them.",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      merge_method: "squash",
      commit_title: "Autonomous pull request view (#106)",
      commit_message: "Preserve the repository defaults, then let the maintainer edit them.",
    });
  });

  it("sends the composed custom message to GitLab's squash field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ state: "merged" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await mergeMergeRequest({
      token: "token",
      repoFullName: "mangue-dev/minddy",
      number: 106,
      method: "squash",
      commitTitle: "Autonomous pull request view",
      commitMessage: "Keep the details editable.",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      squash: true,
      squash_commit_message: "Autonomous pull request view\n\nKeep the details editable.",
    });
  });
});
