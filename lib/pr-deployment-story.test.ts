import { describe, expect, it } from "vitest";

import {
  mergeDeploymentStory,
  type PrDeploymentReport,
  type PrDeploymentStory,
} from "./pr-deployment-story";

const NOW = Date.parse("2026-09-03T10:05:00Z");

function report(
  patch: Partial<PrDeploymentReport> = {},
): PrDeploymentReport {
  return {
    status: "in_progress",
    url: null,
    startedAt: null,
    durationMs: null,
    ...patch,
  };
}

describe("mergeDeploymentStory", () => {
  it("keeps the previous story when the forge went silent this fetch", () => {
    const prev: PrDeploymentStory = {
      status: "in_progress",
      url: "https://serving.example.com",
      startedAt: "2026-09-03T10:00:00Z",
      durationMs: null,
    };
    expect(mergeDeploymentStory(prev, null, NOW)).toBe(prev);
  });

  it("keeps pointing the running card at the environment that serves", () => {
    const prev: PrDeploymentStory = {
      status: "in_progress",
      url: "https://serving.example.com",
      startedAt: "2026-09-03T10:00:00Z",
      durationMs: null,
    };
    expect(
      mergeDeploymentStory(
        prev,
        report({ startedAt: "2026-09-03T10:02:00Z" }),
        NOW,
      ),
    ).toEqual({
      status: "in_progress",
      url: "https://serving.example.com",
      startedAt: "2026-09-03T10:02:00Z",
      durationMs: null,
    });
  });

  it("settles a running card with the duration the forge dated", () => {
    const prev: PrDeploymentStory = {
      status: "in_progress",
      url: "https://serving.example.com",
      startedAt: "2026-09-03T10:00:00Z",
      durationMs: null,
    };
    expect(
      mergeDeploymentStory(
        prev,
        report({
          status: "success",
          url: "https://ready.example.com",
          durationMs: 120_000,
        }),
        NOW,
      ),
    ).toEqual({
      status: "success",
      url: "https://ready.example.com",
      startedAt: null,
      durationMs: 120_000,
    });
  });

  it("freezes the running clock when the forge never dated the settle", () => {
    const prev: PrDeploymentStory = {
      status: "in_progress",
      url: "https://serving.example.com",
      startedAt: "2026-09-03T10:00:00Z",
      durationMs: null,
    };
    expect(
      mergeDeploymentStory(prev, report({ status: "success" }), NOW),
    ).toEqual({
      status: "success",
      url: "https://serving.example.com",
      startedAt: null,
      durationMs: 300_000,
    });
  });

  it("keeps the frozen duration when a settled card is re-read", () => {
    const prev: PrDeploymentStory = {
      status: "success",
      url: "https://ready.example.com",
      startedAt: null,
      durationMs: 120_000,
    };
    expect(
      mergeDeploymentStory(prev, report({ status: "success" }), NOW),
    ).toEqual({
      status: "success",
      url: "https://ready.example.com",
      startedAt: null,
      durationMs: 120_000,
    });
  });

  it("starts a story from nothing", () => {
    expect(
      mergeDeploymentStory(
        null,
        report({
          status: "success",
          url: "https://ready.example.com",
          durationMs: 45_000,
        }),
        NOW,
      ),
    ).toEqual({
      status: "success",
      url: "https://ready.example.com",
      startedAt: null,
      durationMs: 45_000,
    });
  });
});
