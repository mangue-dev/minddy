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
import { backfillCustomDomainVerificationBatch } from
  "@/lib/server/encryption/custom-domain-verification-backfill";
import { backfillBillingIdentityBatch } from
  "@/lib/server/encryption/billing-identity-backfill";
import { backfillOAuthClientsBatch } from
  "@/lib/server/encryption/oauth-client-backfill";
import { backfillOAuthCodesBatch } from
  "@/lib/server/encryption/oauth-code-backfill";
import { backfillApiKeysBatch } from
  "@/lib/server/encryption/api-key-backfill";
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
  isInvitationEncryptionEnabled,
} from "@/lib/server/encryption/invitation-email";

export const maxDuration = 60;

/** A bounded pass; the next hourly run resumes any remaining legacy rows. */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const invitationsEnabled = isInvitationEncryptionEnabled();
  const contentEnabled = isContentEncryptionEnabled();
  const issuesEnabled = contentEnabled && process.env.MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED === "true";
  const agentJournalEnabled = contentEnabled && process.env.MINDDY_AGENT_JOURNAL_ENCRYPTION_ENABLED === "true";
  const agentEventsEnabled = contentEnabled && process.env.MINDDY_AGENT_EVENT_ENCRYPTION_ENABLED === "true";
  const agentLaunchEnabled = contentEnabled && process.env.MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED === "true";
  const agentTitleEnabled = contentEnabled && process.env.MINDDY_AGENT_TITLE_ENCRYPTION_ENABLED === "true";
  const agentCheckpointEnabled = contentEnabled && process.env.MINDDY_AGENT_CHECKPOINT_ENCRYPTION_ENABLED === "true";
  const agentDelegationEnabled = contentEnabled && process.env.MINDDY_AGENT_DELEGATION_ENCRYPTION_ENABLED === "true";
  const agentContextEnabled = contentEnabled && process.env.MINDDY_AGENT_CONTEXT_ENCRYPTION_ENABLED === "true";
  const issueSidecarEnabled = contentEnabled && process.env.MINDDY_ISSUE_SIDECAR_ENCRYPTION_ENABLED === "true";
  const agentVerdictEnabled = contentEnabled && process.env.MINDDY_AGENT_VERDICT_ENCRYPTION_ENABLED === "true";
  const agentDeploymentEnabled = contentEnabled && process.env.MINDDY_AGENT_DEPLOYMENT_ENCRYPTION_ENABLED === "true";
  const agentBaseBranchEnabled = contentEnabled && process.env.MINDDY_AGENT_BASE_BRANCH_ENCRYPTION_ENABLED === "true";
  const agentWorkBranchEnabled = contentEnabled && process.env.MINDDY_AGENT_WORK_BRANCH_ENCRYPTION_ENABLED === "true";
  const agentResultEnabled = contentEnabled &&
    (process.env.MINDDY_AGENT_RESULT_ENCRYPTION_ENABLED === "true" || agentWorkBranchEnabled);
  const agentSummaryEnabled = contentEnabled &&
    process.env.MINDDY_AGENT_SUMMARY_ENCRYPTION_ENABLED === "true";
  const agentPrUrlEnabled = contentEnabled &&
    process.env.MINDDY_AGENT_PR_URL_ENCRYPTION_ENABLED === "true";
  const pullRequestUrlEnabled = contentEnabled &&
    process.env.MINDDY_PULL_REQUEST_URL_ENCRYPTION_ENABLED === "true";
  const pullRequestContentEnabled = contentEnabled &&
    process.env.MINDDY_PULL_REQUEST_CONTENT_ENCRYPTION_ENABLED === "true";
  const prCommentEditEnabled = contentEnabled &&
    process.env.MINDDY_PR_COMMENT_EDIT_ENCRYPTION_ENABLED === "true";
  const forgeRelayDeliveryEnabled = contentEnabled &&
    process.env.MINDDY_FORGE_RELAY_DELIVERY_ENCRYPTION_ENABLED === "true";
  const attachmentObjectEnabled = contentEnabled &&
    process.env.MINDDY_ATTACHMENT_OBJECT_ENCRYPTION_ENABLED === "true";
  const attachmentMetadataEnabled = contentEnabled &&
    process.env.MINDDY_ATTACHMENT_METADATA_ENCRYPTION_ENABLED === "true";
  const feedbackIdentityEnabled = contentEnabled &&
    process.env.MINDDY_FEEDBACK_IDENTITY_ENCRYPTION_ENABLED === "true";
  const shareTokenEnabled = contentEnabled &&
    process.env.MINDDY_SHARE_TOKEN_ENCRYPTION_ENABLED === "true";
  const numoSurfaceEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_SURFACE_DESTINATION_ENCRYPTION_ENABLED === "true";
  const feedbackSsoEnabled = contentEnabled &&
    process.env.MINDDY_FEEDBACK_SSO_ENCRYPTION_ENABLED === "true";
  const forgeMentionEnabled = contentEnabled &&
    process.env.MINDDY_FORGE_THROTTLE_ENCRYPTION_ENABLED === "true";
  const numoActivityEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_EVENT_ENCRYPTION_ENABLED === "true";
  const providerResourceEnabled = contentEnabled &&
    process.env.MINDDY_PROVIDER_RESOURCE_ENCRYPTION_ENABLED === "true";
  const appConfigEnabled = contentEnabled &&
    process.env.MINDDY_APP_CONFIG_ENCRYPTION_ENABLED === "true";
  const feedbackMergeEnabled = contentEnabled &&
    process.env.MINDDY_FEEDBACK_MERGE_PAYLOAD_CLEANUP_ENABLED === "true";
  const agentChainCodesEnabled = contentEnabled &&
    process.env.MINDDY_AGENT_CHAIN_CODE_CLEANUP_ENABLED === "true";
  const numoTurnIntentsEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_TURN_INTENT_ENCRYPTION_ENABLED === "true";
  const numoAutomationEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_AUTOMATION_ENCRYPTION_ENABLED === "true";
  const numoConversationTitleEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_CONVERSATION_TITLE_ENCRYPTION_ENABLED === "true";
  const numoUserMessageEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_USER_MESSAGE_ENCRYPTION_ENABLED === "true";
  const numoFinalContentEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_FINAL_CONTENT_ENCRYPTION_ENABLED === "true";
  const numoErrorsEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_ERROR_ENCRYPTION_ENABLED === "true";
  const numoToolContentEnabled = contentEnabled &&
    process.env.MINDDY_NUMO_TOOL_CONTENT_ENCRYPTION_ENABLED === "true";
  const forgeRepositoryNamesEnabled = contentEnabled &&
    process.env.MINDDY_FORGE_REPOSITORY_NAME_ENCRYPTION_ENABLED === "true";
  const forgeDefaultBranchesEnabled = contentEnabled &&
    process.env.MINDDY_FORGE_DEFAULT_BRANCH_ENCRYPTION_ENABLED === "true";
  const projectIconsEnabled = contentEnabled &&
    process.env.MINDDY_PROJECT_ICON_ENCRYPTION_ENABLED === "true";
  const viewContentEnabled = contentEnabled &&
    process.env.MINDDY_VIEW_CONTENT_ENCRYPTION_ENABLED === "true";
  const savedViewBookmarksEnabled = contentEnabled &&
    process.env.MINDDY_SAVED_VIEW_ENCRYPTION_ENABLED === "true";
  const agentRoutinesEnabled = contentEnabled &&
    process.env.MINDDY_AGENT_ROUTINE_ENCRYPTION_ENABLED === "true";
  const projectContentEnabled = contentEnabled &&
    process.env.MINDDY_PROJECT_CONTENT_ENCRYPTION_ENABLED === "true";
  const pageContentEnabled = contentEnabled &&
    process.env.MINDDY_PAGE_CONTENT_ENCRYPTION_ENABLED === "true";
  const userAiKeysEnabled = contentEnabled &&
    process.env.MINDDY_USER_AI_KEY_ENCRYPTION_ENABLED === "true";
  const relayInstancesEnabled = contentEnabled &&
    process.env.MINDDY_RELAY_INSTANCE_ENCRYPTION_ENABLED === "true";
  const projectWebhookSecretsEnabled = contentEnabled &&
    process.env.MINDDY_REPO_WEBHOOK_SECRET_ENCRYPTION_ENABLED === "true";
  const relayProvisioningEnabled = contentEnabled &&
    process.env.MINDDY_RELAY_PROVISIONING_ENCRYPTION_ENABLED === "true";
  const relayUserDeliveriesEnabled = contentEnabled &&
    process.env.MINDDY_RELAY_USER_DELIVERY_ENCRYPTION_ENABLED === "true";
  const forgeOAuthTokensEnabled = contentEnabled &&
    process.env.MINDDY_FORGE_OAUTH_TOKEN_ENCRYPTION_ENABLED === "true";
  const mcpContentEnabled = contentEnabled &&
    process.env.MINDDY_MCP_CONTENT_ENCRYPTION_ENABLED === "true";
  const agentBranchPrefixesEnabled = contentEnabled &&
    process.env.MINDDY_AGENT_BRANCH_PREFIX_ENCRYPTION_ENABLED === "true";
  const appTabsEnabled = contentEnabled &&
    process.env.MINDDY_APP_TABS_ENCRYPTION_ENABLED === "true";
  const aiDecisionEvaluationsEnabled = contentEnabled &&
    process.env.MINDDY_AI_DECISION_EVALUATION_ENCRYPTION_ENABLED === "true";
  const stripeWebhookScrubEnabled = contentEnabled &&
    process.env.MINDDY_STRIPE_WEBHOOK_PAYLOAD_SCRUB_ENABLED === "true";
  const customDomainVerificationEnabled = contentEnabled &&
    process.env.MINDDY_CUSTOM_DOMAIN_VERIFICATION_ENCRYPTION_ENABLED === "true";
  const billingIdentityEnabled = contentEnabled &&
    process.env.MINDDY_BILLING_IDENTITY_ENCRYPTION_ENABLED === "true";
  const oauthClientsEnabled = contentEnabled &&
    process.env.MINDDY_OAUTH_CLIENT_ENCRYPTION_ENABLED === "true";
  const oauthCodesEnabled = contentEnabled &&
    process.env.MINDDY_OAUTH_CODE_ENCRYPTION_ENABLED === "true";
  const apiKeysEnabled = contentEnabled &&
    process.env.MINDDY_API_KEY_CONTENT_ENCRYPTION_ENABLED === "true";
  if (!invitationsEnabled && !contentEnabled) {
    return NextResponse.json({ skipped: true });
  }
  if (!isInvitationEncryptionConfigured()) {
    return NextResponse.json({ error: "encryption_not_configured" }, { status: 503 });
  }
  try {
    const rotation = await rotateDueContentKeys();
    const outcomes = await Promise.allSettled([
      invitationsEnabled ? backfillInvitationEmailsBatch(100) : Promise.resolve(null),
      contentEnabled ? backfillScratchpadsBatch(50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillStatEventsBatch(50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillHistoryBatch("issue_events", 50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillHistoryBatch("page_versions", 50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillCommentsBatch("comments", 50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillCommentsBatch("page_comments", 50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillObjectivesBatch(50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillCategoriesBatch(50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillProjectDraftsBatch(50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillFeedbackPostsBatch(50, request.signal) : Promise.resolve(null),
      issuesEnabled ? backfillIssuesBatch(50, request.signal) : Promise.resolve(null),
      agentJournalEnabled ? backfillAgentJournalBatch(5, request.signal) : Promise.resolve(null),
      agentEventsEnabled ? backfillAgentEventsBatch(20, request.signal) : Promise.resolve(null),
      agentLaunchEnabled ? backfillAgentLaunchBatch(20, request.signal) : Promise.resolve(null),
      agentTitleEnabled ? backfillAgentTitleBatch(20, request.signal) : Promise.resolve(null),
      agentCheckpointEnabled ? backfillAgentCheckpointBatch(5, request.signal) : Promise.resolve(null),
      agentDelegationEnabled ? backfillAgentDelegationBatch(20, request.signal) : Promise.resolve(null),
      agentLaunchEnabled ? backfillAgentStandaloneMessages(20, request.signal) : Promise.resolve(null),
      agentLaunchEnabled ? backfillAgentQueueBatch(20, request.signal) : Promise.resolve(null),
      agentContextEnabled ? backfillAgentContextsBatch(20, request.signal) : Promise.resolve(null),
      issueSidecarEnabled ? backfillGithubIssueMetadataBatch(20, request.signal) : Promise.resolve(null),
      issueSidecarEnabled ? backfillGithubCommentUrlsBatch(20, request.signal) : Promise.resolve(null),
      agentVerdictEnabled ? backfillAgentVerdictsBatch(20, request.signal) : Promise.resolve(null),
      agentDeploymentEnabled ? backfillAgentDeploymentUrlsBatch(20, request.signal) : Promise.resolve(null),
      agentBaseBranchEnabled ? backfillAgentRunBaseBranchesBatch(20, request.signal) : Promise.resolve(null),
      agentBaseBranchEnabled ? backfillOrphanRuntimeBaseBranchesBatch(20, request.signal) : Promise.resolve(null),
      agentWorkBranchEnabled ? backfillAgentArtifactBranchesBatch(20, request.signal) : Promise.resolve(null),
      agentWorkBranchEnabled ? backfillAgentRunWorkBranchesBatch(20, request.signal) : Promise.resolve(null),
      agentWorkBranchEnabled ? backfillOrphanRuntimeWorkBranchesBatch(20, request.signal) : Promise.resolve(null),
      agentResultEnabled ? backfillAgentDelegationResultsBatch(20, request.signal) : Promise.resolve(null),
      agentResultEnabled ? backfillNumoWorkerEventsBatch(20, request.signal) : Promise.resolve(null),
      agentResultEnabled ? backfillNumoWorkerCheckpointsBatch(20, request.signal) : Promise.resolve(null),
      agentSummaryEnabled ? backfillAgentRunSummariesBatch(20, request.signal) : Promise.resolve(null),
      agentSummaryEnabled ? backfillAgentTurnSummariesBatch(20, request.signal) : Promise.resolve(null),
      agentPrUrlEnabled ? backfillAgentArtifactUrlsBatch(20, request.signal) : Promise.resolve(null),
      agentPrUrlEnabled ? backfillAgentRunPrUrlsBatch(20, request.signal) : Promise.resolve(null),
      pullRequestUrlEnabled ? backfillPullRequestUrlsBatch(20, request.signal) : Promise.resolve(null),
      pullRequestContentEnabled ? backfillPullRequestContentBatch(20, request.signal) : Promise.resolve(null),
      prCommentEditEnabled ? backfillPrCommentEditsBatch(20, request.signal) : Promise.resolve(null),
      forgeRelayDeliveryEnabled ? backfillForgeRelayDeliveriesBatch(20, request.signal) : Promise.resolve(null),
      contentEnabled ? scrubForgeRelayAuditBatch(100, request.signal) : Promise.resolve(null),
      attachmentObjectEnabled ? backfillAttachmentObjectsBatch(10, request.signal) : Promise.resolve(null),
      attachmentMetadataEnabled ? backfillAttachmentMetadataBatch("attachments", 30, request.signal) : Promise.resolve(null),
      attachmentMetadataEnabled ? backfillAttachmentMetadataBatch("page_files", 30, request.signal) : Promise.resolve(null),
      feedbackIdentityEnabled ? backfillFeedbackIdentityBatch("feedback_users", 30, request.signal) : Promise.resolve(null),
      feedbackIdentityEnabled ? backfillFeedbackIdentityBatch("feedback_otp_codes", 30, request.signal) : Promise.resolve(null),
      shareTokenEnabled ? backfillShareTokensBatch(30, request.signal) : Promise.resolve(null),
      numoSurfaceEnabled ? backfillNumoSurfaceDestinationsBatch(30, request.signal) : Promise.resolve(null),
      feedbackSsoEnabled ? backfillFeedbackSsoBatch(30, request.signal) : Promise.resolve(null),
      forgeMentionEnabled ? backfillForgeMentionKeysBatch(50, request.signal) : Promise.resolve(null),
      numoActivityEnabled ? backfillNumoActivityBatch(30, request.signal) : Promise.resolve(null),
      providerResourceEnabled ? backfillProviderResourcesBatch(50, request.signal) : Promise.resolve(null),
      appConfigEnabled ? backfillAppConfigBatch(30, request.signal) : Promise.resolve(null),
      feedbackMergeEnabled ? backfillFeedbackMergeBatch(50, request.signal) : Promise.resolve(null),
      agentChainCodesEnabled ? backfillAgentChainCodesBatch(50, request.signal) : Promise.resolve(null),
      numoTurnIntentsEnabled ? backfillNumoTurnIntentsBatch(30, request.signal) : Promise.resolve(null),
      numoAutomationEnabled ? backfillNumoAutomationContentBatch(30, request.signal) : Promise.resolve(null),
      numoConversationTitleEnabled ? backfillNumoConversationTitlesBatch(30, request.signal) : Promise.resolve(null),
      numoUserMessageEnabled ? backfillNumoUserMessagesBatch(30, request.signal) : Promise.resolve(null),
      numoFinalContentEnabled ? backfillNumoFinalContentBatch(30, request.signal) : Promise.resolve(null),
      numoErrorsEnabled ? backfillNumoErrorsBatch(30, request.signal) : Promise.resolve(null),
      numoToolContentEnabled ? backfillNumoToolContentBatch(30, request.signal) : Promise.resolve(null),
      forgeRepositoryNamesEnabled ? backfillForgeRepositoryNamesBatch(30, request.signal) : Promise.resolve(null),
      forgeDefaultBranchesEnabled ? backfillForgeDefaultBranchesBatch(30, request.signal) : Promise.resolve(null),
      projectIconsEnabled ? backfillProjectIconsBatch(10, request.signal) : Promise.resolve(null),
      viewContentEnabled ? backfillViewContentBatch(30, request.signal) : Promise.resolve(null),
      savedViewBookmarksEnabled ? backfillSavedViewBookmarksBatch(30, request.signal) : Promise.resolve(null),
      agentRoutinesEnabled ? backfillAgentRoutineContentBatch(30, request.signal) : Promise.resolve(null),
      projectContentEnabled ? backfillProjectContentBatch(30, request.signal) : Promise.resolve(null),
      pageContentEnabled ? backfillPageContentBatch(30, request.signal) : Promise.resolve(null),
      userAiKeysEnabled ? backfillUserAiKeysBatch(30, request.signal) : Promise.resolve(null),
      relayInstancesEnabled ? backfillRelayInstancesBatch(20, request.signal) : Promise.resolve(null),
      projectWebhookSecretsEnabled ? backfillProjectWebhookSecretsBatch(30, request.signal) : Promise.resolve(null),
      relayProvisioningEnabled ? backfillRelayProvisioningBatch(request.signal) : Promise.resolve(null),
      relayUserDeliveriesEnabled ? backfillRelayUserDeliveriesBatch(30, request.signal) : Promise.resolve(null),
      forgeOAuthTokensEnabled ? backfillForgeOAuthConnectionsBatch(25, request.signal) : Promise.resolve(null),
      forgeOAuthTokensEnabled ? backfillForgeOAuthIdentitiesBatch(25, request.signal) : Promise.resolve(null),
      mcpContentEnabled ? backfillMcpConnectionsBatch(25, request.signal) : Promise.resolve(null),
      mcpContentEnabled ? backfillMcpAttemptsBatch(25, request.signal) : Promise.resolve(null),
      agentBranchPrefixesEnabled ? backfillAgentBranchPrefixesBatch(25, request.signal) : Promise.resolve(null),
      appTabsEnabled ? backfillAppTabsBatch(25, request.signal) : Promise.resolve(null),
      aiDecisionEvaluationsEnabled ? backfillAiDecisionEvaluationsBatch(25, request.signal) : Promise.resolve(null),
      stripeWebhookScrubEnabled ? scrubStripeWebhookPayloadsBatch(100, request.signal) : Promise.resolve(null),
      customDomainVerificationEnabled ? backfillCustomDomainVerificationBatch(25, request.signal) : Promise.resolve(null),
      billingIdentityEnabled ? backfillBillingIdentityBatch(25, request.signal) : Promise.resolve(null),
      oauthClientsEnabled ? backfillOAuthClientsBatch(25, request.signal) : Promise.resolve(null),
      oauthCodesEnabled ? backfillOAuthCodesBatch(25, request.signal) : Promise.resolve(null),
      apiKeysEnabled ? backfillApiKeysBatch(25, request.signal) : Promise.resolve(null),
    ]);
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
    const customDomainVerification = outcomes[84];
    const billingIdentity = outcomes[85];
    const oauthClients = outcomes[86];
    const oauthCodes = outcomes[87];
    const apiKeys = outcomes[88];
    const failed = outcomes.some((outcome) => outcome.status === "rejected") || rotation.failed > 0 ||
      (scratchpad.status === "fulfilled" && scratchpad.value !== null &&
        (scratchpad.value.failed > 0 || scratchpad.value.interrupted)) ||
      (statistics.status === "fulfilled" && statistics.value !== null &&
        (statistics.value.failed > 0 || statistics.value.interrupted)) ||
      [activity, pageVersions, comments, pageComments, objectives, categories, projectDrafts, feedbackPosts, issues, agentJournal, agentEvents, agentLaunch, agentTitle, agentCheckpoint, agentDelegation, agentStandaloneMessages, agentQueueMessages, agentContexts, issueSidecar, githubCommentUrls, agentVerdicts, agentDeployments, agentBaseBranches, orphanRuntimeBaseBranches, agentBranchArtifacts, agentWorkBranches, orphanRuntimeWorkBranches, agentDelegationResults, numoWorkerEvents, numoWorkerCheckpoints, agentRunSummaries, agentTurnSummaries, agentArtifactUrls, agentRunPrUrls, pullRequestUrls, pullRequestContent, prCommentEdits, forgeRelayDeliveries, forgeRelayAudit, attachmentObjects, attachmentMetadata, pageFileMetadata, feedbackUsers, feedbackOtp, shareTokens, numoSurfaces, feedbackSso, forgeMention, numoActivity, providerResources, appConfig, feedbackMerge, agentChainCodes, numoTurnIntents, numoAutomation, numoConversationTitles, numoUserMessages, numoFinalContent, numoErrors, numoToolContent, forgeRepositoryNames, forgeDefaultBranches, projectIcons, viewContent, savedViewBookmarks, agentRoutines, projectContent, pageContent, userAiKeys, relayInstances, projectWebhookSecrets, relayProvisioning, relayUserDeliveries, forgeOAuthConnections, forgeOAuthIdentities, mcpConnections, mcpAttempts, agentBranchPrefixes, appTabs, aiDecisionEvaluations, stripeWebhookPayloads, customDomainVerification, billingIdentity, oauthClients, oauthCodes, apiKeys].some((outcome) => outcome.status === "fulfilled" && outcome.value !== null &&
        (outcome.value.failed > 0 || outcome.value.interrupted));
    if (failed) console.error("[encryption-maintenance] incomplete batch");
    return NextResponse.json({
      ...(invitation.status === "fulfilled" ? invitation.value : { invitation_failed: true }),
      rotation,
      ...(contentEnabled ? {
        comments: comments.status === "fulfilled" ? comments.value : { failed: true },
        page_comments: pageComments.status === "fulfilled" ? pageComments.value : { failed: true },
        activity: activity.status === "fulfilled" ? activity.value : { failed: true },
        page_versions: pageVersions.status === "fulfilled" ? pageVersions.value : { failed: true },
        objectives: objectives.status === "fulfilled" ? objectives.value : { failed: true },
        categories: categories.status === "fulfilled" ? categories.value : { failed: true },
        project_drafts: projectDrafts.status === "fulfilled" ? projectDrafts.value : { failed: true },
        feedback_posts: feedbackPosts.status === "fulfilled" ? feedbackPosts.value : { failed: true },
        ...(issuesEnabled ? { issues: issues.status === "fulfilled" ? issues.value : { failed: true } } : {}),
        ...(agentJournalEnabled ? { agent_journal: agentJournal.status === "fulfilled" ? agentJournal.value : { failed: true } } : {}),
        ...(agentEventsEnabled ? { agent_events: agentEvents.status === "fulfilled" ? agentEvents.value : { failed: true } } : {}),
        ...(agentLaunchEnabled ? { agent_launch: agentLaunch.status === "fulfilled" ? agentLaunch.value : { failed: true } } : {}),
        ...(agentTitleEnabled ? { agent_titles: agentTitle.status === "fulfilled" ? agentTitle.value : { failed: true } } : {}),
        ...(agentCheckpointEnabled ? { agent_checkpoints: agentCheckpoint.status === "fulfilled" ? agentCheckpoint.value : { failed: true } } : {}),
        ...(agentDelegationEnabled ? { agent_delegation: agentDelegation.status === "fulfilled" ? agentDelegation.value : { failed: true } } : {}),
        ...(agentLaunchEnabled ? { agent_standalone_messages: agentStandaloneMessages.status === "fulfilled" ? agentStandaloneMessages.value : { failed: true } } : {}),
        ...(agentLaunchEnabled ? { agent_queue_messages: agentQueueMessages.status === "fulfilled" ? agentQueueMessages.value : { failed: true } } : {}),
        ...(agentContextEnabled ? { agent_contexts: agentContexts.status === "fulfilled" ? agentContexts.value : { failed: true } } : {}),
        ...(issueSidecarEnabled ? { github_issue_metadata: issueSidecar.status === "fulfilled" ? issueSidecar.value : { failed: true } } : {}),
        ...(issueSidecarEnabled ? { github_comment_urls: githubCommentUrls.status === "fulfilled" ? githubCommentUrls.value : { failed: true } } : {}),
        ...(agentVerdictEnabled ? { agent_verdicts: agentVerdicts.status === "fulfilled" ? agentVerdicts.value : { failed: true } } : {}),
        ...(agentDeploymentEnabled ? { agent_deployments: agentDeployments.status === "fulfilled" ? agentDeployments.value : { failed: true } } : {}),
        ...(agentBaseBranchEnabled ? { agent_base_branches: agentBaseBranches.status === "fulfilled" ? agentBaseBranches.value : { failed: true },
          orphan_runtime_base_branches: orphanRuntimeBaseBranches.status === "fulfilled" ? orphanRuntimeBaseBranches.value : { failed: true } } : {}),
        ...(agentWorkBranchEnabled ? { agent_branch_artifacts: agentBranchArtifacts.status === "fulfilled" ? agentBranchArtifacts.value : { failed: true },
          agent_work_branches: agentWorkBranches.status === "fulfilled" ? agentWorkBranches.value : { failed: true },
          orphan_runtime_work_branches: orphanRuntimeWorkBranches.status === "fulfilled" ? orphanRuntimeWorkBranches.value : { failed: true } } : {}),
        ...(agentResultEnabled ? { agent_delegation_results: agentDelegationResults.status === "fulfilled" ? agentDelegationResults.value : { failed: true } } : {}),
        ...(agentResultEnabled ? { numo_worker_events: numoWorkerEvents.status === "fulfilled" ? numoWorkerEvents.value : { failed: true },
          numo_worker_checkpoints: numoWorkerCheckpoints.status === "fulfilled" ? numoWorkerCheckpoints.value : { failed: true } } : {}),
        ...(agentSummaryEnabled ? { agent_run_summaries: agentRunSummaries.status === "fulfilled" ? agentRunSummaries.value : { failed: true },
          agent_turn_summaries: agentTurnSummaries.status === "fulfilled" ? agentTurnSummaries.value : { failed: true } } : {}),
        ...(agentPrUrlEnabled ? { agent_artifact_urls: agentArtifactUrls.status === "fulfilled" ? agentArtifactUrls.value : { failed: true },
          agent_run_pr_urls: agentRunPrUrls.status === "fulfilled" ? agentRunPrUrls.value : { failed: true } } : {}),
        ...(pullRequestUrlEnabled ? { pull_request_urls: pullRequestUrls.status === "fulfilled" ? pullRequestUrls.value : { failed: true } } : {}),
        ...(pullRequestContentEnabled ? { pull_request_content: pullRequestContent.status === "fulfilled" ? pullRequestContent.value : { failed: true } } : {}),
        ...(prCommentEditEnabled ? { pr_comment_edits: prCommentEdits.status === "fulfilled" ? prCommentEdits.value : { failed: true } } : {}),
        ...(forgeRelayDeliveryEnabled ? { forge_relay_deliveries: forgeRelayDeliveries.status === "fulfilled" ? forgeRelayDeliveries.value : { failed: true } } : {}),
        ...(contentEnabled ? { forge_relay_audit: forgeRelayAudit.status === "fulfilled" ? forgeRelayAudit.value : { failed: true } } : {}),
        ...(attachmentObjectEnabled ? { attachment_objects: attachmentObjects.status === "fulfilled" ? attachmentObjects.value : { failed: true } } : {}),
        ...(attachmentMetadataEnabled ? {
          attachment_metadata: attachmentMetadata.status === "fulfilled" ? attachmentMetadata.value : { failed: true },
          page_file_metadata: pageFileMetadata.status === "fulfilled" ? pageFileMetadata.value : { failed: true },
        } : {}),
        ...(feedbackIdentityEnabled ? {
          feedback_users: feedbackUsers.status === "fulfilled" ? feedbackUsers.value : { failed: true },
          feedback_otp: feedbackOtp.status === "fulfilled" ? feedbackOtp.value : { failed: true },
        } : {}),
        ...(shareTokenEnabled ? {
          share_tokens: shareTokens.status === "fulfilled" ? shareTokens.value : { failed: true },
        } : {}),
        ...(numoSurfaceEnabled ? {
          numo_surface_destinations: numoSurfaces.status === "fulfilled" ? numoSurfaces.value : { failed: true },
        } : {}),
        ...(feedbackSsoEnabled ? {
          feedback_sso: feedbackSso.status === "fulfilled" ? feedbackSso.value : { failed: true },
        } : {}),
        ...(forgeMentionEnabled ? {
          forge_mention_keys: forgeMention.status === "fulfilled" ? forgeMention.value : { failed: true },
        } : {}),
        ...(numoActivityEnabled ? {
          numo_activity: numoActivity.status === "fulfilled" ? numoActivity.value : { failed: true },
        } : {}),
        ...(providerResourceEnabled ? {
          provider_resources: providerResources.status === "fulfilled" ? providerResources.value : { failed: true },
        } : {}),
        ...(appConfigEnabled ? {
          app_config: appConfig.status === "fulfilled" ? appConfig.value : { failed: true },
        } : {}),
        ...(feedbackMergeEnabled ? {
          feedback_merge: feedbackMerge.status === "fulfilled" ? feedbackMerge.value : { failed: true },
        } : {}),
        ...(agentChainCodesEnabled ? {
          agent_chain_codes: agentChainCodes.status === "fulfilled" ? agentChainCodes.value : { failed: true },
        } : {}),
        ...(numoTurnIntentsEnabled ? {
          numo_turn_intents: numoTurnIntents.status === "fulfilled" ? numoTurnIntents.value : { failed: true },
        } : {}),
        ...(numoAutomationEnabled ? {
          numo_automation_content: numoAutomation.status === "fulfilled"
            ? numoAutomation.value : { failed: true },
        } : {}),
        ...(numoConversationTitleEnabled ? {
          numo_conversation_titles: numoConversationTitles.status === "fulfilled"
            ? numoConversationTitles.value : { failed: true },
        } : {}),
        ...(numoUserMessageEnabled ? {
          numo_user_messages: numoUserMessages.status === "fulfilled"
            ? numoUserMessages.value : { failed: true },
        } : {}),
        ...(numoFinalContentEnabled ? {
          numo_final_content: numoFinalContent.status === "fulfilled"
            ? numoFinalContent.value : { failed: true },
        } : {}),
        ...(numoErrorsEnabled ? {
          numo_errors: numoErrors.status === "fulfilled"
            ? numoErrors.value : { failed: true },
        } : {}),
        ...(numoToolContentEnabled ? {
          numo_tool_content: numoToolContent.status === "fulfilled"
            ? numoToolContent.value : { failed: true },
        } : {}),
        ...(forgeRepositoryNamesEnabled ? {
          forge_repository_names: forgeRepositoryNames.status === "fulfilled"
            ? forgeRepositoryNames.value : { failed: true },
        } : {}),
        ...(forgeDefaultBranchesEnabled ? {
          forge_default_branches: forgeDefaultBranches.status === "fulfilled"
            ? forgeDefaultBranches.value : { failed: true },
        } : {}),
        ...(projectIconsEnabled ? {
          project_icons: projectIcons.status === "fulfilled"
            ? projectIcons.value : { failed: true },
        } : {}),
        ...(viewContentEnabled ? {
          view_content: viewContent.status === "fulfilled"
            ? viewContent.value : { failed: true },
        } : {}),
        ...(savedViewBookmarksEnabled ? {
          saved_view_bookmarks: savedViewBookmarks.status === "fulfilled"
            ? savedViewBookmarks.value : { failed: true },
        } : {}),
        ...(agentRoutinesEnabled ? {
          agent_routines: agentRoutines.status === "fulfilled"
            ? agentRoutines.value : { failed: true },
        } : {}),
        ...(projectContentEnabled ? {
          project_content: projectContent.status === "fulfilled"
            ? projectContent.value : { failed: true },
        } : {}),
        ...(pageContentEnabled ? {
          page_content: pageContent.status === "fulfilled"
            ? pageContent.value : { failed: true },
        } : {}),
        ...(userAiKeysEnabled ? {
          user_ai_keys: userAiKeys.status === "fulfilled"
            ? userAiKeys.value : { failed: true },
        } : {}),
        ...(relayInstancesEnabled ? {
          relay_instances: relayInstances.status === "fulfilled"
            ? relayInstances.value : { failed: true },
        } : {}),
        ...(projectWebhookSecretsEnabled ? {
          project_webhook_secrets: projectWebhookSecrets.status === "fulfilled"
            ? projectWebhookSecrets.value : { failed: true },
        } : {}),
        ...(relayProvisioningEnabled ? {
          relay_provisioning: relayProvisioning.status === "fulfilled"
            ? relayProvisioning.value : { failed: true },
        } : {}),
        ...(relayUserDeliveriesEnabled ? {
          relay_user_deliveries: relayUserDeliveries.status === "fulfilled"
            ? relayUserDeliveries.value : { failed: true },
        } : {}),
        ...(forgeOAuthTokensEnabled ? {
          forge_oauth_connections: forgeOAuthConnections.status === "fulfilled"
            ? forgeOAuthConnections.value : { failed: true },
          forge_oauth_identities: forgeOAuthIdentities.status === "fulfilled"
            ? forgeOAuthIdentities.value : { failed: true },
        } : {}),
        ...(mcpContentEnabled ? {
          mcp_connections: mcpConnections.status === "fulfilled"
            ? mcpConnections.value : { failed: true },
          mcp_attempts: mcpAttempts.status === "fulfilled"
            ? mcpAttempts.value : { failed: true },
        } : {}),
        ...(agentBranchPrefixesEnabled ? {
          agent_branch_prefixes: agentBranchPrefixes.status === "fulfilled"
            ? agentBranchPrefixes.value : { failed: true },
        } : {}),
        ...(appTabsEnabled ? {
          app_tabs: appTabs.status === "fulfilled" ? appTabs.value : { failed: true },
        } : {}),
        ...(aiDecisionEvaluationsEnabled ? {
          ai_decision_evaluations: aiDecisionEvaluations.status === "fulfilled"
            ? aiDecisionEvaluations.value : { failed: true },
        } : {}),
        ...(stripeWebhookScrubEnabled ? {
          stripe_webhook_payloads: stripeWebhookPayloads.status === "fulfilled"
            ? stripeWebhookPayloads.value : { failed: true },
        } : {}),
        ...(customDomainVerificationEnabled ? {
          custom_domain_verification:
            customDomainVerification.status === "fulfilled"
              ? customDomainVerification.value : { failed: true },
        } : {}),
        ...(billingIdentityEnabled ? {
          billing_identity: billingIdentity.status === "fulfilled"
            ? billingIdentity.value : { failed: true },
        } : {}),
        ...(oauthClientsEnabled ? {
          oauth_clients: oauthClients.status === "fulfilled"
            ? oauthClients.value : { failed: true },
        } : {}),
        ...(oauthCodesEnabled ? {
          oauth_codes: oauthCodes.status === "fulfilled"
            ? oauthCodes.value : { failed: true },
        } : {}),
        ...(apiKeysEnabled ? {
          api_keys: apiKeys.status === "fulfilled"
            ? apiKeys.value : { failed: true },
        } : {}),
      } : {}),
      ...(contentEnabled ? { scratchpads: scratchpad.status === "fulfilled" ? scratchpad.value : { failed: true } } : {}),
      ...(contentEnabled ? { statistics: statistics.status === "fulfilled" ? statistics.value : { failed: true } } : {}),
    }, { status: failed ? 503 : 200 });
  } catch {
    console.error("[encryption-maintenance] batch failed");
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
