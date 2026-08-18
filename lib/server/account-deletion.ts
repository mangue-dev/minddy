import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { cancelStripeSubscription, isStripeConfigured } from "@/lib/server/stripe";
import { pageFilePathsForProjects } from "@/lib/server/page-files";
import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";
import {
  forgeAttachmentPathsForProjects,
  listStoragePrefix,
  projectIconPaths,
} from "@/lib/server/project-storage";
import { stopSandboxByName } from "@/lib/server/agent/sandbox";
import { revokeRunKey } from "@/lib/server/agent/run-key";

/**
 * Account deletion (MIN-119, GDPR art. 17 — right to erasure).
 *
 * Immediate and definitive: no trash, no grace period. The scheme
 * is already done for this — `auth.users` cascades over everything that is personal and
 * sets the author columns to NULL, so that the thread of a shared ticket
 * remains readable without no longer designating anyone.
 *
 * THE consequence to never be silenced : `projects.owner_id … on delete cascade`.
 * Deleting your account destroys the projects you own, with their
 * tickets, their files and the access of their other members. It is the role of
 * `previewAccountDeletion()` to encrypt it BEFORE the person confirms —
 * an irreversible deletion is only acceptable if it has been announced.
 *
 * The order of operations counts: what the cascade does not take away must leave
 * first, otherwise we lose track of what needed to be cleaned.
 * 1. the Stripe subscription (no reason to continue charging);
 * 2. the storage objects (LINES cascade, not FILES);
 * 3. the account itself, which take away the rest.
 */

type Service = ReturnType<typeof getServiceClient>;

export interface DeletionPreview {
  /** Projects that will be destroyed — those that the person owns. */
  ownedProjects: Array<{ id: string; name: string; memberCount: number }>;
  /** Tickets contained in these projects. */
  issueCount: number;
  /** Members of other accounts who will lose access. */
  affectedMemberCount: number;
  /** Comments written by the person, here and elsewhere. */
  commentCount: number;
  /** Is a paid subscription in progress? */
  hasActiveSubscription: boolean;
}

/** What deletion will destroy, encrypted, for the confirmation screen. */
export async function previewAccountDeletion(userId: string): Promise<DeletionPreview> {
  const service = getServiceClient();

  const { data: projects } = await service
    .from("projects")
    .select("id, name")
    .eq("owner_id", userId)
    .is("deleted_at", null);

  const ownedIds = (projects ?? []).map((p) => p.id as string);

  const [members, issues, comments, billing] = await Promise.all([
    ownedIds.length
      ? service.from("project_members").select("project_id, user_id").in("project_id", ownedIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ownedIds.length
      ? service.from("issues").select("id", { count: "exact", head: true }).in("project_id", ownedIds)
      : Promise.resolve({ count: 0 }),
    service.from("comments").select("id", { count: "exact", head: true }).eq("author_id", userId),
    service
      .from("billing_accounts")
      .select("stripe_subscription_id, stripe_subscription_status")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const memberRows = (members.data ?? []) as Array<{ project_id: string; user_id: string }>;
  const perProject = new Map<string, number>();
  const others = new Set<string>();
  for (const row of memberRows) {
    perProject.set(row.project_id, (perProject.get(row.project_id) ?? 0) + 1);
    if (row.user_id !== userId) others.add(row.user_id);
  }

  const status = billing.data?.stripe_subscription_status as string | undefined;

  return {
    ownedProjects: (projects ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      // +1: the owner has no line in project_members.
      memberCount: (perProject.get(p.id as string) ?? 0) + 1,
    })),
    issueCount: issues.count ?? 0,
    affectedMemberCount: others.size,
    commentCount: comments.count ?? 0,
    hasActiveSubscription:
      !!billing.data?.stripe_subscription_id &&
      (status === "active" || status === "trialing" || status === "past_due"),
  };
}

export interface DeletionResult {
  deletedProjects: number;
  removedStorageObjects: number;
  subscriptionCanceled: boolean;
  /** What could not be cleaned — the deletion of the account took place when
 itself, these lines are used to finish the cleaning by hand. */
  warnings: string[];
}

/** Deletes a batch of objects, without ever failing to delete the account. */
async function removeObjects(
  service: Service,
  bucket: string,
  paths: string[],
  warnings: string[]
): Promise<number> {
  if (paths.length === 0) return 0;
  // Storage caps a `remove`: we cut it.
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await service.storage.from(bucket).remove(chunk);
    if (error) warnings.push(`storage ${bucket}: ${error.message}`);
    else removed += chunk.length;
  }
  return removed;
}

/**
 * Clears the account and everything related to it. Idempotent in fact: a
 * second call to an account that has already left fails at step 3 with a clear
 * message, it does not destroy anything else.
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const service = getServiceClient();
  const warnings: string[] = [];

  // ── 1. Abonnement Stripe ────────────────────────────────────────────────
  let subscriptionCanceled = false;
  const { data: billing } = await service
    .from("billing_accounts")
    .select("stripe_subscription_id, stripe_subscription_status")
    .eq("user_id", userId)
    .maybeSingle();

  const subscriptionId = billing?.stripe_subscription_id as string | undefined;
  const status = billing?.stripe_subscription_status as string | undefined;
  if (subscriptionId && status !== "canceled" && isStripeConfigured()) {
    try {
      await cancelStripeSubscription(subscriptionId);
      subscriptionCanceled = true;
    } catch (e) {
      // We continue: leaving a subscription pending is a problem of
      // billing to be paid by hand, not a reason to refuse a right.
      warnings.push(`stripe: ${(e as Error).message}`);
    }
  }

  // ── 2. Objets de stockage ───────────────────────────────────────────────
  // The `attachments` lines cascade with the project, the FILES do not: without
  // this passage they would remain in the bucket with nothing left to designate them.
  const { data: projects } = await service
    .from("projects")
    .select("id")
    .eq("owner_id", userId);
  const ownedIds = (projects ?? []).map((p) => p.id as string);

  let removedStorageObjects = 0;

  if (ownedIds.length) {
    // A link type resource has no object — `storage_path` null.
    const { data: attachments } = await service
      .from("attachments")
      .select("storage_path")
      .in("project_id", ownedIds)
      .not("storage_path", "is", null);
    removedStorageObjects += await removeObjects(
      service,
      "attachments",
      (attachments ?? []).map((a) => a.storage_path as string),
      warnings
    );

    // Files placed IN page bodies (MIN-280): same bucket, same
    // rule, other table. Without this passage, deleting an account would leave
    // storage all the images from the wikis of its projects.
    removedStorageObjects += await removeObjects(
      service,
      "attachments",
      await pageFilePathsForProjects(service, ownedIds),
      warnings
    );

    // Project icons: one per project, extension unknown → we list.
    removedStorageObjects += await removeObjects(
      service,
      "project-icons",
      await projectIconPaths(service, ownedIds),
      warnings
    );

    // Attachments from PR comments (MIN-296). PUBLIC bucket paths
    // `{pr_id}/…` (MIN-162): without this passage, files deposited from a
    // deleted account remained readable by URL, indefinitely and with nothing left
    // in base to designate them.
    removedStorageObjects += await removeObjects(
      service,
      FORGE_ATTACHMENTS_BUCKET,
      await forgeAttachmentPathsForProjects(service, ownedIds),
      warnings
    );
  }

  // Assistant chat uploads: no basic lines, only
  // objets sous `chat/{user_id}/`.
  const chatObjects = await listStoragePrefix(service, "attachments", `chat/${userId}`);
  removedStorageObjects += await removeObjects(service, "attachments", chatObjects, warnings);

  // Personal conversations of the code officer in OTHERS' projects
  // owners. `owner_id on delete set null` would anonymize them instead of
  // delete them; we first cut their compute and their key, then the cascade of
  // the conversation carries runs, turns, messages, events and readings.
  const { data: personalConversations } = await service
    .from("agent_conversations")
    .select("id")
    .eq("owner_id", userId)
    .eq("visibility", "private");
  const personalConversationIds = (personalConversations ?? []).map((row) => row.id as string);
  if (personalConversationIds.length) {
    const { data: personalRuns } = await service
      .from("agent_runs")
      .select("sandbox_id, provider_key_id")
      .in("conversation_id", personalConversationIds);
    for (const run of personalRuns ?? []) {
      if (run.sandbox_id) {
        await stopSandboxByName(run.sandbox_id as string).catch((e) =>
          warnings.push(`agent sandbox: ${(e as Error).message}`),
        );
      }
      if (run.provider_key_id) {
        await revokeRunKey(run.provider_key_id as string).catch((e) =>
          warnings.push(`agent key: ${(e as Error).message}`),
        );
      }
    }
    const { error: conversationsError } = await service
      .from("agent_conversations")
      .delete()
      .in("id", personalConversationIds);
    if (conversationsError) warnings.push(`agent conversations: ${conversationsError.message}`);
  }

  // ── 3. The account ──────────────────────────── ────────────────────────────
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  return {
    deletedProjects: ownedIds.length,
    removedStorageObjects,
    subscriptionCanceled,
    warnings,
  };
}
