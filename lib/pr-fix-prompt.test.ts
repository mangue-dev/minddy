import { describe, expect, it } from "vitest";

import type { ChecksSummary } from "./agent-api";
import { buildPullRequestFixPrompt } from "./pr-fix-prompt";

function checksOf(
  entries: { name: string; state: string; description?: string | null }[],
): ChecksSummary {
  return {
    checks: entries.map((entry) => ({
      name: entry.name,
      state: entry.state as ChecksSummary["checks"][number]["state"],
      url: null,
      appName: null,
      appAvatarUrl: null,
      description: entry.description ?? null,
      durationMs: null,
      startedAt: null,
      completedAt: null,
      required: null,
      rerunRef: null,
    })),
    deploymentUrl: null,
    state: "failure",
    passing: 0,
    total: entries.length,
    startedAt: null,
    completedAt: null,
  };
}

describe("buildPullRequestFixPrompt", () => {
  it("asks the agent to find and fix what is wrong, with the PR metadata", () => {
    const prompt = buildPullRequestFixPrompt(
      {
        number: 42,
        title: "Add the fix card",
        url: "https://github.com/acme/app/pull/42",
        base: "main",
        head: "fix-card",
      },
      null,
    );
    expect(prompt).toContain(
      "Identify what is going wrong on this pull request and fix it.",
    );
    expect(prompt).toContain("Pull request: #42 — Add the fix card");
    expect(prompt).toContain("URL: https://github.com/acme/app/pull/42");
    expect(prompt).toContain("Base branch: main");
    expect(prompt).toContain("Head branch: fix-card");
    expect(prompt).not.toContain("checks are failing");
  });

  it("names the failing checks when the forge reported them", () => {
    const prompt = buildPullRequestFixPrompt(
      { number: 7, title: "", url: null, base: "main", head: "pr" },
      checksOf([
        { name: "build", state: "failure", description: "tsc failed" },
        { name: "lint", state: "success" },
        { name: "e2e", state: "failure" },
      ]),
    );
    expect(prompt).toContain("The following checks are failing:");
    expect(prompt).toContain("- build — tsc failed");
    expect(prompt).toContain("- e2e");
    expect(prompt).not.toContain("lint");
    expect(prompt).toContain("run the smallest relevant checks until they pass");
  });

  it("falls back to the number when the PR has no title", () => {
    const prompt = buildPullRequestFixPrompt(
      { number: 7, title: "   ", url: null, base: null, head: null },
      null,
    );
    expect(prompt).toContain("Pull request: #7 — Pull request #7");
    expect(prompt).not.toContain("URL:");
  });
});
