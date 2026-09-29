import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  relayRequest: vi.fn(),
  configured: vi.fn(() => true),
  pushRegistration: vi.fn(),
  loadConfig: vi.fn(async () => true),
  createIssue: vi.fn(),
}));
vi.mock("@/lib/server/capabilities", () => ({
  capability: () => ({ configured: true, diagnostic: "ready" }),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => ({ project: { id: "project", name: "private", key: "MIN" } }),
}));
vi.mock("@/lib/server/create-issue", () => ({ createIssueForProject: mocks.createIssue }));
vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: mocks.configured,
  relayRequest: mocks.relayRequest,
}));
vi.mock("@/lib/server/forge-relay/provisioning", () => ({
  loadProvisionedRelayConfig: mocks.loadConfig,
  pushProvisionedWebhookRegistration: mocks.pushRegistration,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => {
    const query = {
      select: () => query, eq: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { external_repo_id: "42", repo_full_name: "private/repo" } }),
    };
    return { from: () => query };
  },
}));
vi.mock("@/lib/server/git/repository-name-content", () => ({
  decodeRepositoryName: async (_provider: string, value: string) => value,
}));

import { sendOtpEmail } from "./feedback/otp-email";
import { executeTool } from "./assistant/execute-tool";
import { anchorPullRequestBase, commitAndPush, type RepoHost } from "./agent/repo-host";
import { ensureRelayWebhookRegistration } from "./forge-relay/webhook-registration";
import { pushGitlabHookSecret } from "./forge-relay/gitlab-hook-sync";

const SENTINEL = "MIN591_PRIVATE_PROVIDER_SENTINEL";
const logs = () => vi.mocked(console.error).mock.calls.flat().map(String).join("\n");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  vi.stubEnv("FEEDBACK_EMAIL_FROM", "synthetic@example.test");
  vi.stubEnv("MINDDY_FORGE_RELAY_WEBHOOK_SECRET", "synthetic-secret-of-at-least-32-characters");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.configured.mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("private provider failure logs in production", () => {
  it.each(["response", "exception"])("does not copy Resend %s data", async (kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (kind === "exception") throw new Error(SENTINEL);
      return new Response(SENTINEL, { status: 422 });
    }));
    expect(await sendOtpEmail({ to: `${SENTINEL}@example.test`, code: "123456", locale: "en" })).toBe(false);
    expect(logs()).not.toContain(SENTINEL);
    expect(logs()).not.toContain("123456");
  });

  it("does not copy assistant tool exceptions", async () => {
    mocks.createIssue.mockRejectedValue(new Error(SENTINEL));
    const result = await executeTool("create_issue", { title: SENTINEL }, {
      projectId: "project", userId: "user", supabase: {} as never,
      service: {} as never, locale: "en",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(logs()).not.toContain(SENTINEL);
  });

  it("refuses the development console email provider in production without logging OTP data", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "console");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendOtpEmail({ to: `${SENTINEL}@example.test`, code: "123456", locale: "en" })).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(logs()).not.toContain(SENTINEL);
    expect(logs()).not.toContain("123456");
  });

  it.each(["response", "exception", "provisioned-exception"])("does not copy webhook registration %s", async (kind) => {
    if (kind === "response") mocks.relayRequest.mockResolvedValue({ ok: false, status: 422, error: SENTINEL });
    else if (kind === "exception") mocks.relayRequest.mockRejectedValue(new Error(SENTINEL));
    else {
      mocks.configured.mockReturnValue(false);
      mocks.pushRegistration.mockRejectedValue(new Error(SENTINEL));
    }
    await ensureRelayWebhookRegistration();
    expect(logs()).not.toContain(SENTINEL);
  });

  it.each(["response", "exception"])("does not copy hook secret push %s", async (kind) => {
    if (kind === "response") mocks.relayRequest.mockResolvedValue({ ok: false, status: 422, error: SENTINEL });
    else mocks.relayRequest.mockRejectedValue(new Error(SENTINEL));
    await pushGitlabHookSecret("42", SENTINEL);
    expect(logs()).not.toContain(SENTINEL);
  });

  it("does not copy PR anchor command output", async () => {
    const host = { exec: vi.fn(async () => ({ exitCode: 1, stdout: SENTINEL, stderr: SENTINEL })) } as unknown as RepoHost;
    await anchorPullRequestBase(host, { authUrl: "https://synthetic@example.test/repo", baseSha: "a".repeat(40) });
    expect(logs()).not.toContain(SENTINEL);
  });

  it("does not expose push output to callers that may log failures", async () => {
    const host = { exec: vi.fn(async (command: string) => {
      if (command.startsWith("git push")) return { exitCode: 1, stdout: SENTINEL, stderr: SENTINEL };
      return { exitCode: 0, stdout: command === "git rev-parse HEAD" ? "a".repeat(40) : "", stderr: "" };
    }) } as unknown as RepoHost;
    const failure = await commitAndPush(host, {
      authUrl: "https://synthetic@example.test/repo", workBranch: "work", baseBranch: "main", message: "test",
      committer: { name: "Synthetic", email: "synthetic@example.test" },
    }).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(SENTINEL);
  });
});
