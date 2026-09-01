import { describe, expect, it } from "vitest";
import {
  summarizeGithubChecks,
  summarizeGitlabPipelines,
  type RawCheckRun,
  type RawCommitStatus,
} from "./checks-core";

// The PURE part of CI checks (MIN-138) — network calls live in pr.ts /
// mr.ts and are not testable in node (server-only).

const run = (over: Partial<RawCheckRun> & { name: string }): RawCheckRun => ({
  status: "completed",
  conclusion: "success",
  ...over,
});

describe("summarizeGithubChecks", () => {
  it("aggregates to success when every check passes", () => {
    const s = summarizeGithubChecks([run({ name: "build" }), run({ name: "test" })], []);
    expect(s.state).toBe("success");
    expect(s.passing).toBe(2);
    expect(s.total).toBe(2);
  });

  it("aggregates to failure when no work is pending and one check failed", () => {
    const s = summarizeGithubChecks(
      [run({ name: "build" }), run({ name: "lint", conclusion: "failure" })],
      [],
    );
    expect(s.state).toBe("failure");
    expect(s.passing).toBe(1);
    // What requires action goes to the top of the list.
    expect(s.checks[0].name).toBe("lint");
  });

  it("keeps the aggregate pending while any check is still running", () => {
    expect(
      summarizeGithubChecks([run({ name: "a" }), run({ name: "b", status: "in_progress" })], [])
        .state,
    ).toBe("pending");
    expect(
      summarizeGithubChecks(
        [run({ name: "a", conclusion: "failure" }), run({ name: "b", status: "queued" })],
        [],
      ).state,
    ).toBe("pending");
  });

  it("treats an incomplete run as pending regardless of its conclusion", () => {
    const s = summarizeGithubChecks([run({ name: "a", status: "queued", conclusion: null })], []);
    expect(s.checks[0].state).toBe("pending");
  });

  it("counts neutral and skipped checks as non-blocking", () => {
    const s = summarizeGithubChecks(
      [
        run({ name: "a" }),
        run({ name: "b" }),
        run({ name: "c" }),
        run({ name: "d", conclusion: "neutral" }),
        run({ name: "e", conclusion: "skipped" }),
      ],
      [],
    );
    expect(s.state).toBe("success");
    expect(s.passing).toBe(5);
    expect(s.total).toBe(5);
  });

  it("treats cancelled and unknown conclusions as failures", () => {
    expect(summarizeGithubChecks([run({ name: "a", conclusion: "cancelled" })], []).state).toBe(
      "failure",
    );
    expect(
      summarizeGithubChecks([run({ name: "a", conclusion: "something_new" })], []).state,
    ).toBe("failure");
  });

  it("combines check runs and commit statuses with check runs winning by name", () => {
    const statuses: RawCommitStatus[] = [
      { context: "ci/vercel", state: "failure", target_url: "https://vercel" },
      { context: "build", state: "pending" },
    ];
    const s = summarizeGithubChecks([run({ name: "build" })], statuses);
    expect(s.total).toBe(2);
    expect(s.checks.find((c) => c.name === "build")?.state).toBe("success");
    expect(s.checks.find((c) => c.name === "ci/vercel")?.state).toBe("failure");
  });

  it("keeps the app logo, name, result, and duration", () => {
    const s = summarizeGithubChecks(
      [
        run({
          name: "build",
          app: { id: 15368, slug: "github-actions", name: "GitHub Actions" },
          output: { title: "  3 warnings  " },
          started_at: "2026-08-01T15:25:57Z",
          completed_at: "2026-08-01T15:27:09Z",
        }),
      ],
      [],
    );
    const c = s.checks[0];
    expect(c.appName).toBe("GitHub Actions");
    expect(c.appAvatarUrl).toBe("https://avatars.githubusercontent.com/in/15368?s=48");
    expect(c.description).toBe("3 warnings");
    expect(c.durationMs).toBe(72_000);
  });

  it("uses the app logo instead of its owner's avatar", () => {
    const owned = { owner: { avatar_url: "https://avatars/u/9919" } };
    // With an id, it’s the App logo that wins…
    expect(
      summarizeGithubChecks([run({ name: "a", app: { id: 15368, ...owned } })], [])
        .checks[0].appAvatarUrl,
    ).toBe("https://avatars.githubusercontent.com/in/15368?s=48");
    // …and without an id, the owner's avatar is better than nothing.
    expect(
      summarizeGithubChecks([run({ name: "a", app: owned })], [])
        .checks[0].appAvatarUrl,
    ).toBe("https://avatars/u/9919");
  });

  it("omits missing, zero, and negative durations", () => {
    const noEnd = run({ name: "a", started_at: "2026-08-01T15:25:57Z" });
    expect(summarizeGithubChecks([noEnd], []).checks[0].durationMs).toBeNull();
    // GitHub dates a skipped job with an end BEFORE its (measured) start.
    const skipped = run({
      name: "b",
      started_at: "2026-08-01T12:19:20Z",
      completed_at: "2026-08-01T12:19:19Z",
    });
    expect(summarizeGithubChecks([skipped], []).checks[0].durationMs).toBeNull();
  });

  it("keeps a commit status logo and description without an app name", () => {
    const s = summarizeGithubChecks(
      [],
      [
        {
          context: "Vercel – ui",
          state: "success",
          description: "Deployment has completed",
          avatar_url: "https://avatars.githubusercontent.com/in/8329?v=4",
        },
      ],
    );
    const c = s.checks[0];
    expect(c.appAvatarUrl).toBe("https://avatars.githubusercontent.com/in/8329?v=4");
    expect(c.description).toBe("Deployment has completed");
    // The context already names the integration: no more “vercel[bot]”.
    expect(c.appName).toBeNull();
    expect(c.durationMs).toBeNull();
  });

  it("prefers html_url over details_url for the check link", () => {
    const s = summarizeGithubChecks(
      [run({ name: "a", html_url: "https://gh", details_url: "https://ext" })],
      [],
    );
    expect(s.checks[0].url).toBe("https://gh");
  });

  it("keeps no checks distinct from a successful suite", () => {
    const s = summarizeGithubChecks([], []);
    expect(s.state).toBeNull();
    expect(s.total).toBe(0);
  });

  it("ignores entries without a usable name", () => {
    const s = summarizeGithubChecks([run({ name: "  " })], [{ context: "", state: "success" }]);
    expect(s.total).toBe(0);
  });
});

describe("summarizeGitlabPipelines", () => {
  it("keeps only the latest pipeline", () => {
    const s = summarizeGitlabPipelines([
      { id: 20, status: "success", web_url: "https://gl/20" },
      { id: 19, status: "failed", web_url: "https://gl/19" },
    ]);
    expect(s.total).toBe(1);
    expect(s.state).toBe("success");
    expect(s.checks[0].name).toBe("#20");
    expect(s.checks[0].url).toBe("https://gl/20");
  });

  it("describes the pipeline with its name or branch", () => {
    const named = summarizeGitlabPipelines([
      { id: 20, status: "success", name: "Ruby 3.3", ref: "main" },
    ]).checks[0];
    expect(named.appName).toBe("GitLab CI/CD");
    expect(named.description).toBe("Ruby 3.3");
    // No logo by integration at GitLab: the UI falls back on the forge icon.
    expect(named.appAvatarUrl).toBeNull();
    expect(
      summarizeGitlabPipelines([{ id: 20, status: "success", ref: "main" }]).checks[0]
        .description,
    ).toBe("main");
  });

  it("maps GitLab states to the common vocabulary", () => {
    expect(summarizeGitlabPipelines([{ id: 1, status: "running" }]).state).toBe("pending");
    expect(summarizeGitlabPipelines([{ id: 1, status: "failed" }]).state).toBe("failure");
    expect(summarizeGitlabPipelines([{ id: 1, status: "canceled" }]).state).toBe("failure");
    // An untriggered manual job awaits a human decision: not a failure.
    expect(summarizeGitlabPipelines([{ id: 1, status: "manual" }]).state).toBe("success");
    expect(summarizeGitlabPipelines([{ id: 1, status: "skipped" }]).checks[0].state).toBe(
      "neutral",
    );
  });

  it("keeps no pipeline distinct from success", () => {
    expect(summarizeGitlabPipelines([]).state).toBeNull();
  });
});
