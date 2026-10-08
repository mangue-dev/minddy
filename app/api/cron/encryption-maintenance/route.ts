import { MaintenanceRunner } from "@/lib/server/encryption/maintenance-runner";
import { maintenanceDiagnostics } from "@/lib/server/encryption/maintenance-diagnostics";
import { backfillCommentsBatch } from "@/lib/server/encryption/comment-backfill";
import { backfillObjectivesBatch } from "@/lib/server/encryption/objective-backfill";
import { backfillCategoriesBatch } from "@/lib/server/encryption/category-backfill";
import { backfillProjectDraftsBatch } from "@/lib/server/encryption/project-draft-backfill";
import { backfillFeedbackPostsBatch } from "@/lib/server/encryption/feedback-post-backfill";
import { backfillIssuesBatch } from "@/lib/server/encryption/issue-backfill";
import { backfillAgentJournalBatch } from "@/lib/server/encryption/agent-journal-backfill";
import { backfillAgentEventsBatch } from "@/lib/server/encryption/agent-event-backfill";
import { backfillAgentLaunchBatch } from "@/lib/server/encryption/agent-launch-backfill";
import { backfillAgentTitleBatch } from "@/lib/server/encryption/agent-title-backfill";
import { backfillAgentCheckpointBatch } from "@/lib/server/encryption/agent-checkpoint-backfill";
import { backfillAgentDelegationBatch } from "@/lib/server/encryption/agent-delegation-backfill";
import { backfillAgentStandaloneMessages } from "@/lib/server/encryption/agent-standalone-message-backfill";
import { backfillAgentQueueBatch } from "@/lib/server/encryption/agent-queue-backfill";
import { backfillAgentContextsBatch } from "@/lib/server/encryption/agent-context-backfill";
import { backfillGithubIssueMetadataBatch } from "@/lib/server/encryption/github-issue-metadata-backfill";
import { backfillGithubCommentUrlsBatch } from "@/lib/server/encryption/github-comment-url-backfill";
import { backfillAgentVerdictsBatch } from "@/lib/server/encryption/agent-verdict-backfill";
import { backfillAgentDeploymentUrlsBatch } from "@/lib/server/encryption/agent-deployment-backfill";
import { backfillAgentRunBaseBranchesBatch,
  backfillOrphanRuntimeBaseBranchesBatch } from "@/lib/server/encryption/agent-base-branch-backfill";
import { backfillAgentArtifactBranchesBatch,
  backfillAgentRunWorkBranchesBatch,
  backfillOrphanRuntimeWorkBranchesBatch } from "@/lib/server/encryption/agent-work-branch-backfill";
import { backfillAgentDelegationResultsBatch } from
  "@/lib/server/encryption/agent-delegation-result-backfill";
import { backfillNumoWorkerEventsBatch,
  backfillNumoWorkerCheckpointsBatch } from
  "@/lib/server/encryption/agent-numo-worker-backfill";
import { backfillAgentRunSummariesBatch,
  backfillAgentTurnSummariesBatch } from
  "@/lib/server/encryption/agent-run-summary-backfill";
import { backfillAgentArtifactUrlsBatch,
  backfillAgentRunPrUrlsBatch } from
  "@/lib/server/encryption/agent-pr-url-backfill";
import { backfillPullRequestUrlsBatch } from
  "@/lib/server/encryption/pull-request-url-backfill";
import { backfillPullRequestContentBatch } from
  "@/lib/server/encryption/pull-request-content-backfill";
import { backfillPrCommentEditsBatch } from
  "@/lib/server/encryption/pr-comment-edit-backfill";
import { backfillForgeRelayDeliveriesBatch } from
  "@/lib/server/encryption/forge-relay-delivery-backfill";
import { scrubForgeRelayAuditBatch } from
  "@/lib/server/encryption/forge-relay-audit-backfill";
import { backfillAttachmentObjectsBatch } from
  "@/lib/server/encryption/attachment-object-backfill";
import { backfillForgeAttachmentsBatch } from
  "@/lib/server/encryption/forge-attachment-backfill";
import { rotateForgeAttachmentsBatch } from
  "@/lib/server/encryption/forge-attachment-rotation";
import { backfillAttachmentMetadataBatch } from
  "@/lib/server/encryption/attachment-metadata-backfill";
import { backfillFeedbackIdentityBatch } from
  "@/lib/server/encryption/feedback-identity-backfill";
import { backfillShareTokensBatch } from
  "@/lib/server/encryption/share-token-backfill";
import { backfillNumoSurfaceDestinationsBatch } from
  "@/lib/server/encryption/numo-surface-destination-backfill";
import { backfillFeedbackSsoBatch } from
  "@/lib/server/encryption/feedback-sso-backfill";
import { backfillForgeMentionKeysBatch } from
  "@/lib/server/encryption/forge-mention-backfill";
import { backfillNumoActivityBatch } from
  "@/lib/server/encryption/numo-activity-backfill";
import { backfillProviderResourcesBatch } from
  "@/lib/server/encryption/provider-resource-backfill";
import { backfillAppConfigBatch } from
  "@/lib/server/encryption/app-config-backfill";
import { backfillFeedbackMergeBatch } from
  "@/lib/server/encryption/feedback-merge-backfill";
import { backfillAgentChainCodesBatch } from
  "@/lib/server/encryption/agent-chain-code-backfill";
import { backfillNumoTurnIntentsBatch } from
  "@/lib/server/encryption/numo-turn-intent-backfill";
import { backfillNumoAutomationContentBatch } from
  "@/lib/server/encryption/numo-automation-content-backfill";
import { backfillNumoConversationTitlesBatch } from
  "@/lib/server/encryption/numo-conversation-title-backfill";
import { backfillNumoUserMessagesBatch } from
  "@/lib/server/encryption/numo-user-message-backfill";
import { backfillNumoFinalContentBatch } from
  "@/lib/server/encryption/numo-final-content-backfill";
import { backfillNumoErrorsBatch } from
  "@/lib/server/encryption/numo-error-backfill";
import { backfillNumoToolContentBatch } from
  "@/lib/server/encryption/numo-tool-content-backfill";
import { backfillForgeRepositoryNamesBatch } from
  "@/lib/server/encryption/forge-repository-name-backfill";
import { backfillForgeDefaultBranchesBatch } from
  "@/lib/server/encryption/forge-default-branch-backfill";
import { backfillProjectIconsBatch } from
  "@/lib/server/encryption/project-icon-backfill";
import { backfillViewContentBatch } from
  "@/lib/server/encryption/view-content-backfill";
import { backfillSavedViewBookmarksBatch } from
  "@/lib/server/encryption/saved-view-bookmark-backfill";
import { backfillAgentRoutineContentBatch } from
  "@/lib/server/encryption/agent-routine-content-backfill";
import { backfillProjectContentBatch } from
  "@/lib/server/encryption/project-content-backfill";
import { backfillPageContentBatch } from
  "@/lib/server/encryption/page-content-backfill";
import { backfillUserAiKeysBatch } from
  "@/lib/server/encryption/user-ai-key-backfill";
import { backfillRelayInstancesBatch } from
  "@/lib/server/encryption/forge-relay-instance-backfill";
import { backfillProjectWebhookSecretsBatch } from
  "@/lib/server/encryption/project-webhook-secret-backfill";
import { backfillRelayProvisioningBatch } from
  "@/lib/server/encryption/forge-relay-provisioning-backfill";
import { backfillRelayUserDeliveriesBatch } from
  "@/lib/server/encryption/forge-relay-user-delivery-backfill";
import { backfillForgeOAuthConnectionsBatch,
  backfillForgeOAuthIdentitiesBatch } from
  "@/lib/server/encryption/forge-oauth-token-backfill";
import { backfillMcpConnectionsBatch, backfillMcpAttemptsBatch } from
  "@/lib/server/encryption/personal-mcp-backfill";
import { backfillAgentBranchPrefixesBatch } from
  "@/lib/server/encryption/agent-branch-prefix-backfill";
import { backfillAppTabsBatch } from
  "@/lib/server/encryption/app-tab-backfill";
import { backfillAiDecisionEvaluationsBatch } from
  "@/lib/server/encryption/ai-decision-evaluation-backfill";
import { scrubStripeWebhookPayloadsBatch } from
  "@/lib/server/encryption/stripe-webhook-payload-scrub";
import { backfillBillingIdentityBatch } from
  "@/lib/server/encryption/billing-identity-backfill";
import { backfillOAuthClientsBatch } from
  "@/lib/server/encryption/oauth-client-backfill";
import { backfillOAuthCodesBatch } from
  "@/lib/server/encryption/oauth-code-backfill";
import { backfillApiKeysBatch } from
  "@/lib/server/encryption/api-key-backfill";
import { backfillIntegrationsBatch } from
  "@/lib/server/encryption/integration-backfill";
import { backfillPushBatch } from "@/lib/server/encryption/push-backfill";
import { backfillHistoryBatch } from "@/lib/server/encryption/history-backfill";
import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { backfillInvitationEmailsBatch } from "@/lib/server/encryption/invitation-backfill";
import { rotateDueContentKeys } from "@/lib/server/encryption/rotation";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { backfillScratchpadsBatch } from "@/lib/server/encryption/scratchpad-backfill";
import { backfillStatEventsBatch } from "@/lib/server/encryption/stat-events-backfill";
import {
  isInvitationEncryptionConfigured,
} from "@/lib/server/encryption/invitation-email";

export const maxDuration = 60;

/** A bounded pass; the next hourly run resumes any remaining legacy rows. */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const contentEnabled = isContentEncryptionEnabled();
  if (!contentEnabled) {
    return NextResponse.json({ skipped: true });
  }
  if (!isInvitationEncryptionConfigured()) {
    return NextResponse.json({ error: "encryption_not_configured" }, { status: 503 });
  }
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
    const rotationRunner = new MaintenanceRunner(signal, 1);
    const rotationPass = rotationRunner.schedule(() => rotateDueContentKeys(20, Date.now(), signal));
    await rotationRunner.run();
    const rotation = await rotationPass;
    const runner = new MaintenanceRunner(signal);
    const maintenancePass = <T,>(work: () => Promise<T>) => runner.schedule(work);
    const bundlePass = <T,>(work: () => Promise<T>) => runner.schedule(work, true);
    const passes = [
      contentEnabled ? maintenancePass(() => backfillInvitationEmailsBatch(100, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillScratchpadsBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillStatEventsBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillHistoryBatch("issue_events", 50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillHistoryBatch("page_versions", 50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillCommentsBatch("comments", 50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillCommentsBatch("page_comments", 50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillObjectivesBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillCategoriesBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillProjectDraftsBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillFeedbackPostsBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillIssuesBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentJournalBatch(5, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentEventsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentLaunchBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentTitleBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentCheckpointBatch(5, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentDelegationBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentStandaloneMessages(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentQueueBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentContextsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillGithubIssueMetadataBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillGithubCommentUrlsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentVerdictsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentDeploymentUrlsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentRunBaseBranchesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillOrphanRuntimeBaseBranchesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentArtifactBranchesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentRunWorkBranchesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillOrphanRuntimeWorkBranchesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentDelegationResultsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoWorkerEventsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoWorkerCheckpointsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentRunSummariesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentTurnSummariesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentArtifactUrlsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentRunPrUrlsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillPullRequestUrlsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillPullRequestContentBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillPrCommentEditsBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillForgeRelayDeliveriesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => scrubForgeRelayAuditBatch(100, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillAttachmentObjectsBatch(10, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillAttachmentMetadataBatch("attachments", 30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillAttachmentMetadataBatch("page_files", 30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillFeedbackIdentityBatch("feedback_users", 30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillFeedbackIdentityBatch("feedback_otp_codes", 30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillShareTokensBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoSurfaceDestinationsBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillFeedbackSsoBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillForgeMentionKeysBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoActivityBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillProviderResourcesBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillAppConfigBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillFeedbackMergeBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentChainCodesBatch(50, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoTurnIntentsBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoAutomationContentBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoConversationTitlesBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoUserMessagesBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoFinalContentBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoErrorsBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillNumoToolContentBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillForgeRepositoryNamesBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillForgeDefaultBranchesBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillProjectIconsBatch(10, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillViewContentBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillSavedViewBookmarksBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentRoutineContentBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillProjectContentBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillPageContentBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillUserAiKeysBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillRelayInstancesBatch(20, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillProjectWebhookSecretsBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillRelayProvisioningBatch(signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillRelayUserDeliveriesBatch(30, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillForgeOAuthConnectionsBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillForgeOAuthIdentitiesBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillMcpConnectionsBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillMcpAttemptsBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? bundlePass(() => backfillAgentBranchPrefixesBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillAppTabsBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillAiDecisionEvaluationsBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => scrubStripeWebhookPayloadsBatch(100, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillBillingIdentityBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillOAuthClientsBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillOAuthCodesBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillApiKeysBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillIntegrationsBatch(25, signal)) : Promise.resolve(null),
      contentEnabled ? maintenancePass(() => backfillPushBatch(25, signal)) : Promise.resolve(null),
      maintenancePass(() => backfillForgeAttachmentsBatch(10, signal)),
      maintenancePass(() => rotateForgeAttachmentsBatch(10, signal)),
    ] as const;
    await runner.run();
    const outcomes = await Promise.allSettled(passes);
    const invitation = outcomes[0];
    const scratchpad = outcomes[1];
    const statistics = outcomes[2];
    const activity = outcomes[3];
    const pageVersions = outcomes[4];
    const comments = outcomes[5];
    const pageComments = outcomes[6];
    const objectives = outcomes[7];
    const categories = outcomes[8];
    const projectDrafts = outcomes[9];
    const feedbackPosts = outcomes[10];
    const issues = outcomes[11];
    const agentJournal = outcomes[12];
    const agentEvents = outcomes[13];
    const agentLaunch = outcomes[14];
    const agentTitle = outcomes[15];
    const agentCheckpoint = outcomes[16];
    const agentDelegation = outcomes[17];
    const agentStandaloneMessages = outcomes[18];
    const agentQueueMessages = outcomes[19];
    const agentContexts = outcomes[20];
    const issueSidecar = outcomes[21];
    const githubCommentUrls = outcomes[22];
    const agentVerdicts = outcomes[23];
    const agentDeployments = outcomes[24];
    const agentBaseBranches = outcomes[25];
    const orphanRuntimeBaseBranches = outcomes[26];
    const agentBranchArtifacts = outcomes[27];
    const agentWorkBranches = outcomes[28];
    const orphanRuntimeWorkBranches = outcomes[29];
    const agentDelegationResults = outcomes[30];
    const numoWorkerEvents = outcomes[31];
    const numoWorkerCheckpoints = outcomes[32];
    const agentRunSummaries = outcomes[33];
    const agentTurnSummaries = outcomes[34];
    const agentArtifactUrls = outcomes[35];
    const agentRunPrUrls = outcomes[36];
    const pullRequestUrls = outcomes[37];
    const pullRequestContent = outcomes[38];
    const prCommentEdits = outcomes[39];
    const forgeRelayDeliveries = outcomes[40];
    const forgeRelayAudit = outcomes[41];
    const attachmentObjects = outcomes[42];
    const attachmentMetadata = outcomes[43];
    const pageFileMetadata = outcomes[44];
    const feedbackUsers = outcomes[45];
    const feedbackOtp = outcomes[46];
    const shareTokens = outcomes[47];
    const numoSurfaces = outcomes[48];
    const feedbackSso = outcomes[49];
    const forgeMention = outcomes[50];
    const numoActivity = outcomes[51];
    const providerResources = outcomes[52];
    const appConfig = outcomes[53];
    const feedbackMerge = outcomes[54];
    const agentChainCodes = outcomes[55];
    const numoTurnIntents = outcomes[56];
    const numoAutomation = outcomes[57];
    const numoConversationTitles = outcomes[58];
    const numoUserMessages = outcomes[59];
    const numoFinalContent = outcomes[60];
    const numoErrors = outcomes[61];
    const numoToolContent = outcomes[62];
    const forgeRepositoryNames = outcomes[63];
    const forgeDefaultBranches = outcomes[64];
    const projectIcons = outcomes[65];
    const viewContent = outcomes[66];
    const savedViewBookmarks = outcomes[67];
    const agentRoutines = outcomes[68];
    const projectContent = outcomes[69];
    const pageContent = outcomes[70];
    const userAiKeys = outcomes[71];
    const relayInstances = outcomes[72];
    const projectWebhookSecrets = outcomes[73];
    const relayProvisioning = outcomes[74];
    const relayUserDeliveries = outcomes[75];
    const forgeOAuthConnections = outcomes[76];
    const forgeOAuthIdentities = outcomes[77];
    const mcpConnections = outcomes[78];
    const mcpAttempts = outcomes[79];
    const agentBranchPrefixes = outcomes[80];
    const appTabs = outcomes[81];
    const aiDecisionEvaluations = outcomes[82];
    const stripeWebhookPayloads = outcomes[83];
    const billingIdentity = outcomes[84];
    const oauthClients = outcomes[85];
    const oauthCodes = outcomes[86];
    const apiKeys = outcomes[87];
    const integrations = outcomes[88];
    const push = outcomes[89];
    const forgeAttachments = outcomes[90].status === "fulfilled"
      ? outcomes[90].value : { scanned: 0, migrated: 0, failed: 1 };
    const forgeAttachmentRotation = outcomes[91].status === "fulfilled"
      ? outcomes[91].value : { scanned: 0, rotated: 0, failed: 1 };
    const failed = outcomes.some((outcome) => outcome.status === "rejected") || rotation.failed > 0 ||
      (forgeAttachments?.failed ?? 0) > 0 ||
      (forgeAttachmentRotation?.failed ?? 0) > 0 ||
      (scratchpad.status === "fulfilled" && scratchpad.value !== null &&
        (scratchpad.value.failed > 0 || scratchpad.value.interrupted)) ||
      (statistics.status === "fulfilled" && statistics.value !== null &&
        (statistics.value.failed > 0 || statistics.value.interrupted)) ||
      [activity, pageVersions, comments, pageComments, objectives, categories, projectDrafts, feedbackPosts, issues, agentJournal, agentEvents, agentLaunch, agentTitle, agentCheckpoint, agentDelegation, agentStandaloneMessages, agentQueueMessages, agentContexts, issueSidecar, githubCommentUrls, agentVerdicts, agentDeployments, agentBaseBranches, orphanRuntimeBaseBranches, agentBranchArtifacts, agentWorkBranches, orphanRuntimeWorkBranches, agentDelegationResults, numoWorkerEvents, numoWorkerCheckpoints, agentRunSummaries, agentTurnSummaries, agentArtifactUrls, agentRunPrUrls, pullRequestUrls, pullRequestContent, prCommentEdits, forgeRelayDeliveries, forgeRelayAudit, attachmentObjects, attachmentMetadata, pageFileMetadata, feedbackUsers, feedbackOtp, shareTokens, numoSurfaces, feedbackSso, forgeMention, numoActivity, providerResources, appConfig, feedbackMerge, agentChainCodes, numoTurnIntents, numoAutomation, numoConversationTitles, numoUserMessages, numoFinalContent, numoErrors, numoToolContent, forgeRepositoryNames, forgeDefaultBranches, projectIcons, viewContent, savedViewBookmarks, agentRoutines, projectContent, pageContent, userAiKeys, relayInstances, projectWebhookSecrets, relayProvisioning, relayUserDeliveries, forgeOAuthConnections, forgeOAuthIdentities, mcpConnections, mcpAttempts, agentBranchPrefixes, appTabs, aiDecisionEvaluations, stripeWebhookPayloads, billingIdentity, oauthClients, oauthCodes, apiKeys, integrations, push].some((outcome) => outcome.status === "fulfilled" && outcome.value !== null &&
        (outcome.value.failed > 0 || outcome.value.interrupted));
    const result = {
      ...(invitation.status === "fulfilled" ? invitation.value : { invitation_failed: true }),
      rotation,
      ...(forgeAttachments ? { forge_attachments: forgeAttachments } : {}),
      ...(forgeAttachmentRotation ? { forge_attachment_rotation: forgeAttachmentRotation } : {}),
      ...(contentEnabled ? {
        comments: comments.status === "fulfilled" ? comments.value : { failed: true },
        page_comments: pageComments.status === "fulfilled" ? pageComments.value : { failed: true },
        activity: activity.status === "fulfilled" ? activity.value : { failed: true },
        page_versions: pageVersions.status === "fulfilled" ? pageVersions.value : { failed: true },
        objectives: objectives.status === "fulfilled" ? objectives.value : { failed: true },
        categories: categories.status === "fulfilled" ? categories.value : { failed: true },
        project_drafts: projectDrafts.status === "fulfilled" ? projectDrafts.value : { failed: true },
        feedback_posts: feedbackPosts.status === "fulfilled" ? feedbackPosts.value : { failed: true },
        ...(contentEnabled ? { issues: issues.status === "fulfilled" ? issues.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_journal: agentJournal.status === "fulfilled" ? agentJournal.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_events: agentEvents.status === "fulfilled" ? agentEvents.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_launch: agentLaunch.status === "fulfilled" ? agentLaunch.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_titles: agentTitle.status === "fulfilled" ? agentTitle.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_checkpoints: agentCheckpoint.status === "fulfilled" ? agentCheckpoint.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_delegation: agentDelegation.status === "fulfilled" ? agentDelegation.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_standalone_messages: agentStandaloneMessages.status === "fulfilled" ? agentStandaloneMessages.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_queue_messages: agentQueueMessages.status === "fulfilled" ? agentQueueMessages.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_contexts: agentContexts.status === "fulfilled" ? agentContexts.value : { failed: true } } : {}),
        ...(contentEnabled ? { github_issue_metadata: issueSidecar.status === "fulfilled" ? issueSidecar.value : { failed: true } } : {}),
        ...(contentEnabled ? { github_comment_urls: githubCommentUrls.status === "fulfilled" ? githubCommentUrls.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_verdicts: agentVerdicts.status === "fulfilled" ? agentVerdicts.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_deployments: agentDeployments.status === "fulfilled" ? agentDeployments.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_base_branches: agentBaseBranches.status === "fulfilled" ? agentBaseBranches.value : { failed: true },
          orphan_runtime_base_branches: orphanRuntimeBaseBranches.status === "fulfilled" ? orphanRuntimeBaseBranches.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_branch_artifacts: agentBranchArtifacts.status === "fulfilled" ? agentBranchArtifacts.value : { failed: true },
          agent_work_branches: agentWorkBranches.status === "fulfilled" ? agentWorkBranches.value : { failed: true },
          orphan_runtime_work_branches: orphanRuntimeWorkBranches.status === "fulfilled" ? orphanRuntimeWorkBranches.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_delegation_results: agentDelegationResults.status === "fulfilled" ? agentDelegationResults.value : { failed: true } } : {}),
        ...(contentEnabled ? { numo_worker_events: numoWorkerEvents.status === "fulfilled" ? numoWorkerEvents.value : { failed: true },
          numo_worker_checkpoints: numoWorkerCheckpoints.status === "fulfilled" ? numoWorkerCheckpoints.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_run_summaries: agentRunSummaries.status === "fulfilled" ? agentRunSummaries.value : { failed: true },
          agent_turn_summaries: agentTurnSummaries.status === "fulfilled" ? agentTurnSummaries.value : { failed: true } } : {}),
        ...(contentEnabled ? { agent_artifact_urls: agentArtifactUrls.status === "fulfilled" ? agentArtifactUrls.value : { failed: true },
          agent_run_pr_urls: agentRunPrUrls.status === "fulfilled" ? agentRunPrUrls.value : { failed: true } } : {}),
        ...(contentEnabled ? { pull_request_urls: pullRequestUrls.status === "fulfilled" ? pullRequestUrls.value : { failed: true } } : {}),
        ...(contentEnabled ? { pull_request_content: pullRequestContent.status === "fulfilled" ? pullRequestContent.value : { failed: true } } : {}),
        ...(contentEnabled ? { pr_comment_edits: prCommentEdits.status === "fulfilled" ? prCommentEdits.value : { failed: true } } : {}),
        ...(contentEnabled ? { forge_relay_deliveries: forgeRelayDeliveries.status === "fulfilled" ? forgeRelayDeliveries.value : { failed: true } } : {}),
        ...(contentEnabled ? { forge_relay_audit: forgeRelayAudit.status === "fulfilled" ? forgeRelayAudit.value : { failed: true } } : {}),
        ...(contentEnabled ? { attachment_objects: attachmentObjects.status === "fulfilled" ? attachmentObjects.value : { failed: true } } : {}),
        ...(contentEnabled ? {
          attachment_metadata: attachmentMetadata.status === "fulfilled" ? attachmentMetadata.value : { failed: true },
          page_file_metadata: pageFileMetadata.status === "fulfilled" ? pageFileMetadata.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          feedback_users: feedbackUsers.status === "fulfilled" ? feedbackUsers.value : { failed: true },
          feedback_otp: feedbackOtp.status === "fulfilled" ? feedbackOtp.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          share_tokens: shareTokens.status === "fulfilled" ? shareTokens.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_surface_destinations: numoSurfaces.status === "fulfilled" ? numoSurfaces.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          feedback_sso: feedbackSso.status === "fulfilled" ? feedbackSso.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          forge_mention_keys: forgeMention.status === "fulfilled" ? forgeMention.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_activity: numoActivity.status === "fulfilled" ? numoActivity.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          provider_resources: providerResources.status === "fulfilled" ? providerResources.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          app_config: appConfig.status === "fulfilled" ? appConfig.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          feedback_merge: feedbackMerge.status === "fulfilled" ? feedbackMerge.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          agent_chain_codes: agentChainCodes.status === "fulfilled" ? agentChainCodes.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_turn_intents: numoTurnIntents.status === "fulfilled" ? numoTurnIntents.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_automation_content: numoAutomation.status === "fulfilled"
            ? numoAutomation.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_conversation_titles: numoConversationTitles.status === "fulfilled"
            ? numoConversationTitles.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_user_messages: numoUserMessages.status === "fulfilled"
            ? numoUserMessages.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_final_content: numoFinalContent.status === "fulfilled"
            ? numoFinalContent.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_errors: numoErrors.status === "fulfilled"
            ? numoErrors.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          numo_tool_content: numoToolContent.status === "fulfilled"
            ? numoToolContent.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          forge_repository_names: forgeRepositoryNames.status === "fulfilled"
            ? forgeRepositoryNames.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          forge_default_branches: forgeDefaultBranches.status === "fulfilled"
            ? forgeDefaultBranches.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          project_icons: projectIcons.status === "fulfilled"
            ? projectIcons.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          view_content: viewContent.status === "fulfilled"
            ? viewContent.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          saved_view_bookmarks: savedViewBookmarks.status === "fulfilled"
            ? savedViewBookmarks.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          agent_routines: agentRoutines.status === "fulfilled"
            ? agentRoutines.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          project_content: projectContent.status === "fulfilled"
            ? projectContent.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          page_content: pageContent.status === "fulfilled"
            ? pageContent.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          user_ai_keys: userAiKeys.status === "fulfilled"
            ? userAiKeys.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          relay_instances: relayInstances.status === "fulfilled"
            ? relayInstances.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          project_webhook_secrets: projectWebhookSecrets.status === "fulfilled"
            ? projectWebhookSecrets.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          relay_provisioning: relayProvisioning.status === "fulfilled"
            ? relayProvisioning.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          relay_user_deliveries: relayUserDeliveries.status === "fulfilled"
            ? relayUserDeliveries.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          forge_oauth_connections: forgeOAuthConnections.status === "fulfilled"
            ? forgeOAuthConnections.value : { failed: true },
          forge_oauth_identities: forgeOAuthIdentities.status === "fulfilled"
            ? forgeOAuthIdentities.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          mcp_connections: mcpConnections.status === "fulfilled"
            ? mcpConnections.value : { failed: true },
          mcp_attempts: mcpAttempts.status === "fulfilled"
            ? mcpAttempts.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          agent_branch_prefixes: agentBranchPrefixes.status === "fulfilled"
            ? agentBranchPrefixes.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          app_tabs: appTabs.status === "fulfilled" ? appTabs.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          ai_decision_evaluations: aiDecisionEvaluations.status === "fulfilled"
            ? aiDecisionEvaluations.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          stripe_webhook_payloads: stripeWebhookPayloads.status === "fulfilled"
            ? stripeWebhookPayloads.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
        } : {}),
        ...(contentEnabled ? {
          billing_identity: billingIdentity.status === "fulfilled"
            ? billingIdentity.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          oauth_clients: oauthClients.status === "fulfilled"
            ? oauthClients.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          oauth_codes: oauthCodes.status === "fulfilled"
            ? oauthCodes.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          api_keys: apiKeys.status === "fulfilled"
            ? apiKeys.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          integrations: integrations.status === "fulfilled"
            ? integrations.value : { failed: true },
        } : {}),
        ...(contentEnabled ? {
          push_subscriptions: push.status === "fulfilled"
            ? push.value : { failed: true },
        } : {}),
      } : {}),
      ...(contentEnabled ? { scratchpads: scratchpad.status === "fulfilled" ? scratchpad.value : { failed: true } } : {}),
      ...(contentEnabled ? { statistics: statistics.status === "fulfilled" ? statistics.value : { failed: true } } : {}),
    };
    if (failed) console.error("[encryption-maintenance] incomplete batch", maintenanceDiagnostics(result, signal));
    return NextResponse.json(result, { status: failed ? 503 : 200 });
  } catch {
    console.error("[encryption-maintenance] batch failed");
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
