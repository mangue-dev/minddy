import { describe, expect, it } from "vitest";

import type { PullRequestCheck } from "./agent-api";
import type { ReadinessBlocker } from "./pr-readiness";
import {
  PULL_REQUEST_POLL_MS,
  conversationResolutionTab,
  findRerunnableChecks,
  pullRequestRefetchInterval,
} from "./pr-readiness-actions";

function check(
  name: string,
  required: boolean | null,
  id: number,
): PullRequestCheck {
  return {
    name,
    state: "failure",
    url: null,
    appName: null,
    appAvatarUrl: null,
    description: null,
    durationMs: null,
    startedAt: null,
    completedAt: null,
    required,
    rerunRef: { kind: "github_check_suite", id },
  };
}

const checksBlocker: ReadinessBlocker = {
  id: "checks-failed",
  kind: "checks",
  required: true,
  status: "blocked",
  source: "checks",
  action: "rerun_checks",
  checkNames: ["required-tests"],
};

describe("pull request readiness interactions", () => {
  it("keeps polling while provider mergeability is unavailable", () => {
    expect(
      pullRequestRefetchInterval({
        pr: null,
        files: [],
        readiness: {
          state: "status_unavailable",
          blockers: [
            {
              id: "mergeability-unavailable",
              kind: "mergeability",
              required: true,
              status: "pending",
              source: "pull_request",
              action: "open_forge",
            },
          ],
          passed: [],
          mergeAllowed: false,
          methods: ["squash"],
          preferredMethod: "squash",
        },
      }),
    ).toBe(PULL_REQUEST_POLL_MS);
  });

  it("stops polling after checks and mergeability settle", () => {
    expect(
      pullRequestRefetchInterval({
        pr: null,
        files: [],
        checks: {
          checks: [],
          state: "success",
          passing: 1,
          total: 1,
          startedAt: null,
          completedAt: null,
        },
        readiness: {
          state: "ready",
          blockers: [],
          passed: [],
          mergeAllowed: true,
          methods: ["squash"],
          preferredMethod: "squash",
        },
      }),
    ).toBe(false);
  });

  it("routes GitLab conversations to the files tab", () => {
    expect(conversationResolutionTab("gitlab")).toBe("files");
    expect(conversationResolutionTab("github")).toBe("activity");
  });

  it("reruns the required failing check named by the blocker", () => {
    const optional = check("optional-lint", false, 1);
    const required = check("required-tests", true, 2);

    expect(findRerunnableChecks([optional, required], checksBlocker)).toEqual([
      required,
    ]);
  });

  it("never falls back to an explicitly optional failure", () => {
    expect(
      findRerunnableChecks(
        [check("optional-lint", false, 1)],
        { ...checksBlocker, checkNames: [] },
      ),
    ).toEqual([]);
  });

  it("reruns each failing required suite once", () => {
    const tests = check("required-tests", true, 2);
    const duplicateSuite = check("required-integration", true, 2);
    const build = check("required-build", true, 3);
    expect(
      findRerunnableChecks(
        [tests, duplicateSuite, build],
        {
          ...checksBlocker,
          checkNames: [
            "required-tests",
            "required-integration",
            "required-build",
          ],
        },
      ),
    ).toEqual([tests, build]);
  });
});
