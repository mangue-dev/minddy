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
    const failed = outcomes.some((outcome) => outcome.status === "rejected") || rotation.failed > 0 ||
      (scratchpad.status === "fulfilled" && scratchpad.value !== null &&
        (scratchpad.value.failed > 0 || scratchpad.value.interrupted)) ||
      (statistics.status === "fulfilled" && statistics.value !== null &&
        (statistics.value.failed > 0 || statistics.value.interrupted)) ||
      [activity, pageVersions, comments, pageComments, objectives, categories, projectDrafts, feedbackPosts, issues, agentJournal, agentEvents, agentLaunch, agentTitle, agentCheckpoint, agentDelegation, agentStandaloneMessages, agentQueueMessages].some((outcome) => outcome.status === "fulfilled" && outcome.value !== null &&
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
      } : {}),
      ...(contentEnabled ? { scratchpads: scratchpad.status === "fulfilled" ? scratchpad.value : { failed: true } } : {}),
      ...(contentEnabled ? { statistics: statistics.status === "fulfilled" ? statistics.value : { failed: true } } : {}),
    }, { status: failed ? 503 : 200 });
  } catch {
    console.error("[encryption-maintenance] batch failed");
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
