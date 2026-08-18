import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { attachmentPaths, type TrashType } from "@/lib/server/trash";
import {
  forgeAttachmentPathsForProjects,
  projectIconPaths,
  removeProjectSideBuckets,
} from "@/lib/server/project-storage";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import {
  ORPHAN_ATTACHMENT_DAYS,
  removeStorageObjects,
  sweepOrphanAttachments,
} from "@/lib/server/attachments";
import {
  ORPHAN_PAGE_FILE_DAYS,
  sweepOrphanPageFiles,
} from "@/lib/server/page-files";

/**
 * Application of retention periods (MIN-119, RGPD art. 5.1.e).
 *
 * A confidentiality policy which announces durations and a code which never
 * deletes anything, it is the most banal breach - and the simplest to observe when of a control. This module is the executable counterpart of the
 * “Retention periods” section of the policy: both must say the
 * same thing, and this is where the value takes precedence.
 *
 * User-created content only leaves on ONE condition:
 * has it deleted. A ticket, a project, an objective or a feedback placed in the
 * trash remains there for 30 days, then the scanning erases it for good (MIN-133) —
 * this is the only case, and the trash announces it in plain text, day by day. All the
 * remainder of what leaves here is *technical*: execution traces, expired tokens,
 * read receipts, the retention of which is no longer useful after a period of time.
 * What the user has not touched, never moves.
 *
 * Called once a night by `app/api/cron/data-retention/route.ts`.
 * The corresponding durations are documented in the internal register of
 * treatments.
 */

/** Retention times, in days. Source of product truth. */
export const RETENTION_DAYS = {
  /** Notifications already read — inbox doesn't go back that far. */
  readNotifications: 180,
  /**
 * Invitations still pending. After this period, the address of a person
 * who has never joined the project is kept without purpose.
 */
  pendingInvitations: 90,
  /**
 * Agent execution traces (events + control messages) after
 * the terminal state of the run. The recovery `checkpoint` is already set to
 * null at the end of the run (lib/server/agent/runs.ts). Then only the
 * metadata attached to the ticket remains: branch, pull request, status, cost.
 */
  agentRunTrace: 30,
  /**
 * Raw payload of Stripe webhooks. The LINE remains beyond — its primary key
 * carries the idempotence guard, deleting it would reopen the door to the
 * replay of an event. Only the `payload` part.
 */
  stripeWebhookPayload: 90,
  /**
 * Forge webhooks delivery receipts (MIN-333) — anti-replay of
 * `forge_webhook_deliveries`. Unlike the Stripe line, this one leaves
 * FULLY: it only carries an opaque identifier, and a forge never
 * re-delivers beyond a few hours. Seven days leaves a comfortable margin
 * without swelling a table which grows with each event.
 */
  forgeWebhookDeliveries: 7,
  /**
 * Trash (MIN-133). The only user content this sweep destroys —
 * and only because the user has already deleted it once. The duration
 * is that displayed on each row of the trash: it lives in
 * `lib/server/trash.ts`, from where it is re-exported here so that the scan and
 * the screen cannot diverge.
 */
  trash: TRASH_RETENTION_DAYS,
  /**
 * Board identities that have NOTHING produced: verified by code then more
 * nothing — no feedback, no vote, no comment, no live session. Their address
 * was kept without purpose, which article 5.1.e does not allow.
 *
 * 90 days, the lifespan of a board session: otherwise, the purge
 * would chase after people still connected. The sort itself is in SQL
 * (`purge_dormant_feedback_identities`) — six “does not exist” that PostgREST
 * cannot express.
 */
  dormantFeedbackIdentities: 90,
  /**
 * Page history (MIN-277): the previous states of a document.
 *
 * Same duration as the trash, and this is deliberate — a second delay would be a
 * second thing to remember, for the same promise ("nothing you have
 * written disappears before thirty days"). What leaves here is never the
 * current document: it lives in `pages`, and nothing erases it until
 * someone deletes it.
 */
  pageVersions: TRASH_RETENTION_DAYS,
  /**
 * ORPHAN page files (MIN-280): no longer cited by any body.
 *
 * This is not a retention period within the meaning of article 5.1.e — the
 * file is no longer data that we keep, it is a byte that is nothing more ne
 * shows. The delay is a GRACE delay: an image leaves a body by a
 * backspace, and returns there by a `⌘Z` done the next day, by the
 * restoration of a version (MIN-277) or by a move to the trash. One
 * week covers all these returns; beyond that, no one comes back.
 */
  orphanPageFiles: ORPHAN_PAGE_FILE_DAYS,
  /**
 * Objects in bucket `attachments` ORPHANS (MIN-348): uploaded live
 * by browser, then never saved — one composer closed, one tab
 * lost. Same nature and same grace period as page files: this
 * is not a retention period, it is the time we leave for a
 * resource to finally be attached.
 */
  orphanAttachments: ORPHAN_ATTACHMENT_DAYS,
} as const;

export type RetentionKey = keyof typeof RETENTION_DAYS;

const DAY_MS = 86_400_000;

/** ISO limit below which a line is expired. */
export function cutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export interface RetentionStep {
  /** Name of the purge, as it appears in the cron output. */
  step: string;
  /** Rows affected, or null if the step failed. */
  deleted: number | null;
  error?: string;
}

export interface RetentionSweepResult {
  ok: boolean;
  ranAt: string;
  steps: RetentionStep[];
}

/**
 * Wraps a purge: a table that fails (column renamed, timeout) must
 * not carry the entire scan — the following ones still run, and the
 * cron reports the faulty step.
 */
async function step(
  name: string,
  run: () => Promise<number>
): Promise<RetentionStep> {
  try {
    return { step: name, deleted: await run() };
  } catch (e) {
    return { step: name, deleted: null, error: (e as Error).message };
  }
}

type Service = ReturnType<typeof getServiceClient>;

/** Counts lines actually deleted (`count: "exact"` on a delete). */
function counted(result: { count: number | null; error: unknown }): number {
  if (result.error) throw result.error as Error;
  return result.count ?? 0;
}

/** Notifications lues il y a plus de `readNotifications` jours. */
async function purgeReadNotifications(service: Service, now: Date) {
  return counted(
    await service
      .from("notifications")
      .delete({ count: "exact" })
      .not("read_at", "is", null)
      .lt("read_at", cutoff(RETENTION_DAYS.readNotifications, now))
  );
}

/** Invitations never accepted, issued more than `pendingInvitations` ago. */
async function purgePendingInvitations(service: Service, now: Date) {
  return counted(
    await service
      .from("project_invitations")
      .delete({ count: "exact" })
      .eq("status", "pending")
      .lt("created_at", cutoff(RETENTION_DAYS.pendingInvitations, now))
  );
}

const TERMINAL_RUN_STATUSES = ["completed", "failed", "canceled"];

/**
 * Traces of agent runs completed more than `agentRunTrace` days ago.
 *
 * Three tables (`agent_run_events`, `agent_run_messages`, `agent_run_journal`)
 * filtered on the same
 * list of runs: PostgREST does not know how to join in a DELETE, so we resolve
 * the identifiers first. The batch is finite — a daily sweep makes up for the remainder the next day, and an unlimited purge on a base that has accumulated months of runs would exceed the duration of the function.
 */
async function purgeAgentRunTraces(service: Service, now: Date) {
  const { data, error } = await service
    .from("agent_runs")
    .select("id")
    .in("status", TERMINAL_RUN_STATUSES)
    .lt("updated_at", cutoff(RETENTION_DAYS.agentRunTrace, now))
    .limit(500);
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;

  const events = counted(
    await service.from("agent_run_events").delete({ count: "exact" }).in("run_id", ids)
  );
  const messages = counted(
    await service.from("agent_run_messages").delete({ count: "exact" }).in("run_id", ids)
  );
  // The opencode log (MIN-286): this is by far the heaviest of the three — it
  // carry the full output of each tool. Without this line, he would survive the
  // fil qu'il accompagne.
  const journal = counted(
    await service.from("agent_run_journal").delete({ count: "exact" }).in("run_id", ids)
  );
  return events + messages + journal;
}

/** Expired OAuth authorization codes (one-time use, very short term). */
async function purgeExpiredOauthCodes(service: Service, now: Date) {
  return counted(
    await service
      .from("oauth_authorization_codes")
      .delete({ count: "exact" })
      .lt("expires_at", now.toISOString())
  );
}

/** Expired sessions and one-time codes from public feedback boards. */
async function purgeExpiredFeedbackAuth(service: Service, now: Date) {
  const iso = now.toISOString();
  const sessions = counted(
    await service.from("feedback_sessions").delete({ count: "exact" }).lt("expires_at", iso)
  );
  const codes = counted(
    await service.from("feedback_otp_codes").delete({ count: "exact" }).lt("expires_at", iso)
  );
  return sessions + codes;
}

/**
 * Dormant board identities (MIN-119, art. 5.1.e).
 *
 * Batch bound like the others: the next day's sweep continues. The
 * function returns the number of rows actually deleted.
 */
async function purgeDormantFeedbackIdentities(service: Service, now: Date) {
  const { data, error } = await service.rpc("purge_dormant_feedback_identities", {
    p_before: cutoff(RETENTION_DAYS.dormantFeedbackIdentities, now),
    p_limit: 500,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/**
 * Payload of Stripe webhooks beyond `stripeWebhookPayload` days.
 * `update`, not `delete`: the line keeps its anti-replay role.
 */
async function stripPayloads(service: Service, now: Date) {
  const { count, error } = await service
    .from("stripe_webhook_events")
    .update({ payload: null }, { count: "exact" })
    .not("payload", "is", null)
    .lt("created_at", cutoff(RETENTION_DAYS.stripeWebhookPayload, now));
  if (error) throw error;
  return count ?? 0;
}

/** Accused of delivering forge webhook beyond their replay window. */
async function purgeForgeWebhookDeliveries(service: Service, now: Date) {
  return counted(
    await service
      .from("forge_webhook_deliveries")
      .delete({ count: "exact" })
      .lt("received_at", cutoff(RETENTION_DAYS.forgeWebhookDeliveries, now))
  );
}

/**
 * Expired page versions (MIN-277).
 *
 * Batch bounded like the others. The counter on a heavily written page can go up
 * quickly (one version per five minutes per author), and an unlimited purge
 * on a backlog would exceed the duration of the feature; the scanning of the
 * next day resumes the rest.
 *
 * The DEFINITIVE purge of a page does not go through here: its versions
 * go through the cascade of `page_versions.page_id` (see the migration), at the
 * same moment when the line part.
 */
async function purgePageVersions(service: Service, now: Date) {
  const { data, error } = await service
    .from("page_versions")
    .select("id")
    .lt("created_at", cutoff(RETENTION_DAYS.pageVersions, now))
    .limit(1000);
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;
  return counted(
    await service.from("page_versions").delete({ count: "exact" }).in("id", ids)
  );
}

/**
 * The tables in the trash, and the type that corresponds to them.
 *
 * The PAGES go through it TWICE, and the order is the bottom line: a page
 * trashed with its parent carries `deleted_root_id`, and `parent_id` is
 * `on delete set null` — purging a root before its descendants would leave them
 * behind, rootless, thus reappearing in the trash as standalone
 * lines. The descendants first, the roots then: the bounded lot can
 * cut wherever it wants, it never leaves any visible orphan.
 */
const TRASH_TABLES: {
  table: string;
  type: TrashType;
  /** Restricts the batch: `notNull` / `isNull` on a column. */
  scope?: { column: string; isNull: boolean };
}[] = [
  { table: "issues", type: "issue" },
  { table: "objectives", type: "objective" },
  { table: "feedback_posts", type: "feedback" },
  { table: "agent_routines", type: "routine" },
  { table: "pages", type: "page", scope: { column: "deleted_root_id", isNull: false } },
  { table: "pages", type: "page", scope: { column: "deleted_root_id", isNull: true } },
  { table: "projects", type: "project" },
];

/**
 * Trash: items deleted more than `trash` days ago.
 *
 * Order matters. The projects go LAST: deleting a cascade
 * project on its tickets, its objectives, its feedbacks and its routines, and purging a
 * project first would take away lines that we would not have counted — the total
 * reported to the cron would lie. The storage objects do not cascade at all:
 * their paths are noted BEFORE the delete, then deleted once the lines
 * are gone. A routine does not have a file but carries its passages
 * (`agent_runs.routine_id` cascade): it is here, and only here, that
 * the history of a deleted routine really disappears.
 *
 * Batch bounded by table: the next day's sweep picks up the rest, where a
 * unlimited purge on a backlog would exceed the duration of the function.
 */
const TRASH_BATCH = 500;

async function purgeTrash(service: Service, now: Date) {
  const expired = cutoff(RETENTION_DAYS.trash, now);
  let deleted = 0;

  for (const { table, type, scope } of TRASH_TABLES) {
    const query = service
      .from(table)
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", expired);
    if (scope) {
      if (scope.isNull) query.is(scope.column, null);
      else query.not(scope.column, "is", null);
    }
    const { data, error } = await query.limit(TRASH_BATCH);
    if (error) throw error;

    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length === 0) continue;

    const paths = await attachmentPaths(service, type, ids);
    // A project also carries its icon and comment attachments
    // of his PR, in two PUBLIC buckets that nothing cascades (MIN-296). Even
    // rule that the rest: recorded before the delete, deleted after.
    const sideBuckets =
      type === "project"
        ? {
            icons: await projectIconPaths(service, ids),
            forge: await forgeAttachmentPathsForProjects(service, ids),
          }
        : null;

    deleted += counted(
      await service.from(table).delete({ count: "exact" }).in("id", ids)
    );
    await removeStorageObjects(service, paths);
    if (sideBuckets) {
      const { errors } = await removeProjectSideBuckets(service, sideBuckets);
      for (const message of errors) console.error(`[retention] ${message}`);
    }
  }

  return deleted;
}

/** Runs all purges and renders the detail in stages. */
export async function runRetentionSweep(now: Date = new Date()): Promise<RetentionSweepResult> {
  const service = getServiceClient();

  const steps = [
    await step("read_notifications", () => purgeReadNotifications(service, now)),
    await step("pending_invitations", () => purgePendingInvitations(service, now)),
    await step("agent_run_traces", () => purgeAgentRunTraces(service, now)),
    await step("oauth_authorization_codes", () => purgeExpiredOauthCodes(service, now)),
    await step("feedback_auth", () => purgeExpiredFeedbackAuth(service, now)),
    await step("feedback_dormant_identities", () =>
      purgeDormantFeedbackIdentities(service, now)
    ),
    await step("stripe_webhook_payloads", () => stripPayloads(service, now)),
    await step("forge_webhook_deliveries", () =>
      purgeForgeWebhookDeliveries(service, now)
    ),
    await step("page_versions", () => purgePageVersions(service, now)),
    // BEFORE the trash, and the order has a reason: purging a page takes away its
    // files itself (lib/server/trash.ts). Going here first avoids
    // reread lines which will be sent in the second, and above all to count
    // twice the same bytes in the cron report.
    await step("orphan_page_files", () =>
      sweepOrphanPageFiles(service, cutoff(RETENTION_DAYS.orphanPageFiles, now))
    ),
    // Like scanning page files, and for the same reason: BEFORE the
    // trash, which itself takes the objects from the lines it purges.
    await step("orphan_attachments", () =>
      sweepOrphanAttachments(service, cutoff(RETENTION_DAYS.orphanAttachments, now))
    ),
    await step("trash", () => purgeTrash(service, now)),
  ];

  return {
    ok: steps.every((s) => s.deleted !== null),
    ranAt: now.toISOString(),
    steps,
  };
}
