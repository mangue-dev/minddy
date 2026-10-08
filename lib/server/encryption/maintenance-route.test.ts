import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workers: Array<[string, string[]]> = [
  ["@/lib/server/encryption/comment-backfill", ["backfillCommentsBatch"]],
  ["@/lib/server/encryption/objective-backfill", ["backfillObjectivesBatch"]],
  ["@/lib/server/encryption/category-backfill", ["backfillCategoriesBatch"]],
  ["@/lib/server/encryption/project-draft-backfill", ["backfillProjectDraftsBatch"]],
  ["@/lib/server/encryption/feedback-post-backfill", ["backfillFeedbackPostsBatch"]],
  ["@/lib/server/encryption/issue-backfill", ["backfillIssuesBatch"]],
  ["@/lib/server/encryption/agent-journal-backfill", ["backfillAgentJournalBatch"]],
  ["@/lib/server/encryption/agent-event-backfill", ["backfillAgentEventsBatch"]],
  ["@/lib/server/encryption/agent-launch-backfill", ["backfillAgentLaunchBatch"]],
  ["@/lib/server/encryption/agent-title-backfill", ["backfillAgentTitleBatch"]],
  ["@/lib/server/encryption/agent-checkpoint-backfill", ["backfillAgentCheckpointBatch"]],
  ["@/lib/server/encryption/agent-delegation-backfill", ["backfillAgentDelegationBatch"]],
  ["@/lib/server/encryption/agent-standalone-message-backfill", ["backfillAgentStandaloneMessages"]],
  ["@/lib/server/encryption/agent-queue-backfill", ["backfillAgentQueueBatch"]],
  ["@/lib/server/encryption/agent-context-backfill", ["backfillAgentContextsBatch"]],
  ["@/lib/server/encryption/github-issue-metadata-backfill", ["backfillGithubIssueMetadataBatch"]],
  ["@/lib/server/encryption/github-comment-url-backfill", ["backfillGithubCommentUrlsBatch"]],
  ["@/lib/server/encryption/agent-verdict-backfill", ["backfillAgentVerdictsBatch"]],
  ["@/lib/server/encryption/agent-deployment-backfill", ["backfillAgentDeploymentUrlsBatch"]],
  ["@/lib/server/encryption/agent-base-branch-backfill", ["backfillAgentRunBaseBranchesBatch", "backfillOrphanRuntimeBaseBranchesBatch"]],
  ["@/lib/server/encryption/agent-work-branch-backfill", ["backfillAgentArtifactBranchesBatch", "backfillAgentRunWorkBranchesBatch", "backfillOrphanRuntimeWorkBranchesBatch"]],
  ["@/lib/server/encryption/agent-delegation-result-backfill", ["backfillAgentDelegationResultsBatch"]],
  ["@/lib/server/encryption/agent-numo-worker-backfill", ["backfillNumoWorkerEventsBatch", "backfillNumoWorkerCheckpointsBatch"]],
  ["@/lib/server/encryption/agent-run-summary-backfill", ["backfillAgentRunSummariesBatch", "backfillAgentTurnSummariesBatch"]],
  ["@/lib/server/encryption/agent-pr-url-backfill", ["backfillAgentArtifactUrlsBatch", "backfillAgentRunPrUrlsBatch"]],
  ["@/lib/server/encryption/pull-request-url-backfill", ["backfillPullRequestUrlsBatch"]],
  ["@/lib/server/encryption/pull-request-content-backfill", ["backfillPullRequestContentBatch"]],
  ["@/lib/server/encryption/pr-comment-edit-backfill", ["backfillPrCommentEditsBatch"]],
  ["@/lib/server/encryption/forge-relay-delivery-backfill", ["backfillForgeRelayDeliveriesBatch"]],
  ["@/lib/server/encryption/forge-relay-audit-backfill", ["scrubForgeRelayAuditBatch"]],
  ["@/lib/server/encryption/attachment-object-backfill", ["backfillAttachmentObjectsBatch"]],
  ["@/lib/server/encryption/forge-attachment-backfill", ["backfillForgeAttachmentsBatch"]],
  ["@/lib/server/encryption/forge-attachment-rotation", ["rotateForgeAttachmentsBatch"]],
  ["@/lib/server/encryption/attachment-metadata-backfill", ["backfillAttachmentMetadataBatch"]],
  ["@/lib/server/encryption/feedback-identity-backfill", ["backfillFeedbackIdentityBatch"]],
  ["@/lib/server/encryption/share-token-backfill", ["backfillShareTokensBatch"]],
  ["@/lib/server/encryption/numo-surface-destination-backfill", ["backfillNumoSurfaceDestinationsBatch"]],
  ["@/lib/server/encryption/feedback-sso-backfill", ["backfillFeedbackSsoBatch"]],
  ["@/lib/server/encryption/forge-mention-backfill", ["backfillForgeMentionKeysBatch"]],
  ["@/lib/server/encryption/numo-activity-backfill", ["backfillNumoActivityBatch"]],
  ["@/lib/server/encryption/provider-resource-backfill", ["backfillProviderResourcesBatch"]],
  ["@/lib/server/encryption/app-config-backfill", ["backfillAppConfigBatch"]],
  ["@/lib/server/encryption/feedback-merge-backfill", ["backfillFeedbackMergeBatch"]],
  ["@/lib/server/encryption/agent-chain-code-backfill", ["backfillAgentChainCodesBatch"]],
  ["@/lib/server/encryption/numo-turn-intent-backfill", ["backfillNumoTurnIntentsBatch"]],
  ["@/lib/server/encryption/numo-automation-content-backfill", ["backfillNumoAutomationContentBatch"]],
  ["@/lib/server/encryption/numo-conversation-title-backfill", ["backfillNumoConversationTitlesBatch"]],
  ["@/lib/server/encryption/numo-user-message-backfill", ["backfillNumoUserMessagesBatch"]],
  ["@/lib/server/encryption/numo-final-content-backfill", ["backfillNumoFinalContentBatch"]],
  ["@/lib/server/encryption/numo-error-backfill", ["backfillNumoErrorsBatch"]],
  ["@/lib/server/encryption/numo-tool-content-backfill", ["backfillNumoToolContentBatch"]],
  ["@/lib/server/encryption/forge-repository-name-backfill", ["backfillForgeRepositoryNamesBatch"]],
  ["@/lib/server/encryption/forge-default-branch-backfill", ["backfillForgeDefaultBranchesBatch"]],
  ["@/lib/server/encryption/project-icon-backfill", ["backfillProjectIconsBatch"]],
  ["@/lib/server/encryption/view-content-backfill", ["backfillViewContentBatch"]],
  ["@/lib/server/encryption/saved-view-bookmark-backfill", ["backfillSavedViewBookmarksBatch"]],
  ["@/lib/server/encryption/agent-routine-content-backfill", ["backfillAgentRoutineContentBatch"]],
  ["@/lib/server/encryption/project-content-backfill", ["backfillProjectContentBatch"]],
  ["@/lib/server/encryption/page-content-backfill", ["backfillPageContentBatch"]],
  ["@/lib/server/encryption/user-ai-key-backfill", ["backfillUserAiKeysBatch"]],
  ["@/lib/server/encryption/forge-relay-instance-backfill", ["backfillRelayInstancesBatch"]],
  ["@/lib/server/encryption/project-webhook-secret-backfill", ["backfillProjectWebhookSecretsBatch"]],
  ["@/lib/server/encryption/forge-relay-provisioning-backfill", ["backfillRelayProvisioningBatch"]],
  ["@/lib/server/encryption/forge-relay-user-delivery-backfill", ["backfillRelayUserDeliveriesBatch"]],
  ["@/lib/server/encryption/forge-oauth-token-backfill", ["backfillForgeOAuthConnectionsBatch", "backfillForgeOAuthIdentitiesBatch"]],
  ["@/lib/server/encryption/personal-mcp-backfill", ["backfillMcpConnectionsBatch", "backfillMcpAttemptsBatch"]],
  ["@/lib/server/encryption/agent-branch-prefix-backfill", ["backfillAgentBranchPrefixesBatch"]],
  ["@/lib/server/encryption/app-tab-backfill", ["backfillAppTabsBatch"]],
  ["@/lib/server/encryption/ai-decision-evaluation-backfill", ["backfillAiDecisionEvaluationsBatch"]],
  ["@/lib/server/encryption/stripe-webhook-payload-scrub", ["scrubStripeWebhookPayloadsBatch"]],
  ["@/lib/server/encryption/billing-identity-backfill", ["backfillBillingIdentityBatch"]],
  ["@/lib/server/encryption/oauth-client-backfill", ["backfillOAuthClientsBatch"]],
  ["@/lib/server/encryption/oauth-code-backfill", ["backfillOAuthCodesBatch"]],
  ["@/lib/server/encryption/api-key-backfill", ["backfillApiKeysBatch"]],
  ["@/lib/server/encryption/integration-backfill", ["backfillIntegrationsBatch"]],
  ["@/lib/server/encryption/push-backfill", ["backfillPushBatch"]],
  ["@/lib/server/encryption/history-backfill", ["backfillHistoryBatch"]],
  ["@/lib/server/encryption/invitation-backfill", ["backfillInvitationEmailsBatch"]],
  ["@/lib/server/encryption/rotation", ["rotateDueContentKeys"]],
  ["@/lib/server/encryption/scratchpad-backfill", ["backfillScratchpadsBatch"]],
  ["@/lib/server/encryption/stat-events-backfill", ["backfillStatEventsBatch"]],
];
const callbacks = new Map<string, ReturnType<typeof vi.fn>>();
for (const [module, names] of workers) {
  const exports = Object.fromEntries(names.map((name) => {
    const callback = vi.fn();
    callbacks.set(name, callback);
    return [name, callback];
  }));
  vi.doMock(module, () => exports);
}
const { GET } = await import("@/app/api/cron/encryption-maintenance/route");
const secret = "x".repeat(32);
const emptyBatch = { scanned: 0, migrated: 0, encrypted: 0, purged: 0,
  advanced: 0, rotated: 0, failed: 0, interrupted: false };
function request(authorized = true): NextRequest {
  return new NextRequest("http://localhost/api/cron/encryption-maintenance", {
    headers: authorized ? { authorization: `Bearer ${secret}` } : {},
  });
}
function enable() {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "1".repeat(64));
}
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", secret);
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "");
  for (const callback of callbacks.values()) callback.mockReset().mockResolvedValue(emptyBatch);
});
afterEach(() => vi.unstubAllEnvs());

describe("application-wide encryption maintenance", () => {
  it("requires cron authorization before running any repository", async () => {
    enable();
    expect((await GET(request(false))).status).toBe(401);
    for (const callback of callbacks.values()) expect(callback).not.toHaveBeenCalled();
  });
  it("does not touch any domain while the global switch is disabled", async () => {
    vi.stubEnv("MINDDY_INVITATION_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED", "true");
    expect(await (await GET(request())).json()).toEqual({ skipped: true });
    for (const callback of callbacks.values()) expect(callback).not.toHaveBeenCalled();
  });
  it("fails closed without the root key before running maintenance", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    expect((await GET(request())).status).toBe(503);
    for (const callback of callbacks.values()) expect(callback).not.toHaveBeenCalled();
  });
  it("runs every domain and cleanup with only the global switch configured", async () => {
    enable();
    vi.stubEnv("MINDDY_INVITATION_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_FEEDBACK_MERGE_PAYLOAD_CLEANUP_ENABLED", "false");
    const response = await GET(request());
    expect(response.status).toBe(200);
    for (const callback of callbacks.values()) expect(callback).toHaveBeenCalled();
    expect(callbacks.get("backfillInvitationEmailsBatch")).toHaveBeenCalledWith(100, expect.any(AbortSignal));
    expect(callbacks.get("backfillIssuesBatch")).toHaveBeenCalledWith(50, expect.any(AbortSignal));
    expect(callbacks.get("backfillHistoryBatch")).toHaveBeenCalledTimes(2);
    expect(callbacks.get("backfillCommentsBatch")).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({
      issues: emptyBatch, feedback_users: emptyBatch, attachment_objects: emptyBatch,
      page_content: emptyBatch, numo_tool_content: emptyBatch,
    });
  });
  it("reports rotation failures while continuing all repository batches", async () => {
    enable();
    callbacks.get("rotateDueContentKeys")!.mockResolvedValue({ ...emptyBatch, failed: 1 });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await GET(request())).status).toBe(503);
      expect(callbacks.get("backfillInvitationEmailsBatch")).toHaveBeenCalled();
      expect(callbacks.get("backfillPageContentBatch")).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it("serializes shared agent and Numo bundles and resumes later passes after a failure", async () => {
    enable();
    let active = 0;
    let maximum = 0;
    let completed = 0;
    const bundles = [...callbacks].filter(([name]) => /^backfill(Agent|Numo|OrphanRuntime)/.test(name));
    for (const [name, callback] of bundles) {
      callback.mockImplementation(async () => {
        active++;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active--;
        completed++;
        if (name === "backfillNumoWorkerEventsBatch") throw Error("Private source failure");
        return emptyBatch;
      });
    }
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await GET(request())).status).toBe(503);
      expect(maximum).toBe(1);
      expect(completed).toBe(bundles.length);
      expect(callbacks.get("backfillIssuesBatch")).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("Private source failure");
    } finally { log.mockRestore(); }
  });
  it("reports provider failures without blocking other domains or leaking content", async () => {
    enable();
    callbacks.get("backfillInvitationEmailsBatch")!.mockRejectedValue(new Error("Private provider content"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(callbacks.get("backfillIssuesBatch")).toHaveBeenCalled();
      expect(await response.json()).toMatchObject({ invitation_failed: true });
      expect(log).toHaveBeenCalledWith("[encryption-maintenance] incomplete batch", {
        aborted: false, failed_domains: ["invitations"], interrupted_domains: [],
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("Private provider content");
    } finally { log.mockRestore(); }
  });
  it("returns an incomplete response and stops queued repositories when the request is aborted", async () => {
    enable();
    const controller = new AbortController();
    const started: string[] = [];
    const release: Array<() => void> = [];
    for (const [name, callback] of callbacks) {
      if (name === "rotateDueContentKeys") continue;
      callback.mockImplementation(() => {
        started.push(name);
        return new Promise((resolve) => release.push(() => resolve(emptyBatch)));
      });
    }
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pending = GET(new NextRequest("http://localhost/api/cron/encryption-maintenance", {
        headers: { authorization: `Bearer ${secret}` }, signal: controller.signal,
      }));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(started).toHaveLength(3);
      controller.abort();
      const response = await pending;
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ issues: { failed: true } });
      expect(log).toHaveBeenCalledWith("[encryption-maintenance] incomplete batch", expect.objectContaining({
        aborted: true, failed_domains: expect.arrayContaining(["issues"]),
      }));
      release.forEach((finish) => finish());
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(started).toHaveLength(3);
    } finally { log.mockRestore(); }
  });
  it("reports interrupted content batches as incomplete", async () => {
    enable();
    callbacks.get("backfillStatEventsBatch")!.mockResolvedValue({ ...emptyBatch, interrupted: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await GET(request())).status).toBe(503);
      expect(log).toHaveBeenCalledWith("[encryption-maintenance] incomplete batch", {
        aborted: false, failed_domains: [], interrupted_domains: ["statistics"],
      });
    }
    finally { log.mockRestore(); }
  });
});
