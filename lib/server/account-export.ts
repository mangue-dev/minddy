import { issueStore } from "@/lib/server/issue-store";
import { materializePendingProjectPages } from "@/lib/server/pages";
import { categoryStore } from "@/lib/server/category-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { commentStore } from "@/lib/server/comment-store";
import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeApiKeyContent, type StoredApiKey } from
  "@/lib/server/api-key-content";
import { decodeBillingAccount } from "@/lib/server/billing-content";
import { openPush, type StoredPush } from "@/lib/server/push/content";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  ACCOUNT_TRANSFER_FORMAT,
  ACCOUNT_TRANSFER_VERSION,
  CURRENT_ACCOUNT_EXPORT_VERSION,
} from "@/lib/account-transfer";
import { downloadProjectIcon } from "@/lib/server/project-icon";
import { decodeView } from "@/lib/server/view-content";
import { decodeRoutine } from "@/lib/server/routine-content";
import { decodeProject } from "@/lib/server/project-content";
import { decodePageProjection } from "@/lib/server/page-content";
import { decodeUserAiKeyRow, type UserAiKeyRow } from
  "@/lib/server/user-ai-key-content";
import { downloadAttachment } from "@/lib/server/attachments";
import { decodeAttachmentRow, type AttachmentTable } from
  "@/lib/server/attachment-content";
import { getScratchpadRow } from "@/lib/server/scratchpad";
import { readStatEvents } from "@/lib/server/stat-events";
import { hydrateNumoUserMessages } from "@/lib/server/numo/user-message-content";
import { hydrateNumoFinalMessages } from "@/lib/server/numo/final-content";
import { hydrateNumoToolMessages } from "@/lib/server/numo/tool-content";
import { decodeConversationTitle } from
  "@/lib/server/numo/conversation-title-content";

/**
 * Export of account data (MIN-119, GDPR art. 15 and 20).
 *
 * What the export contains is exactly what deleting the account
 * destroys (`lib/server/account-deletion.ts`), plus what the person has written
 * elsewhere. This symmetry is voluntary: the export is what we take before
 * leaving, it would make no sense for it to be narrower than deletion.
 *
 * Concretely:
 * • the ENTIRE content of the projects it owns — these are those
 * that the deletion of the account takes away, members included;
 * • tickets she created or was assigned in projects she can currently access,
 *   plus comments that she wrote;
 * • everything that is strictly personal: cycles, notepads, conversations
 * with the assistant, notifications, statistics, preferences.
 *
 * What the export does NOT contain, and why:
 * • the content of other people's projects that she did not write — it is not her
 * given within the meaning of article 20, and the application already shows it to her ;
 * • secrets such as API keys, OAuth tokens, repository credentials, and billing
 * identifiers — file bytes are included for transfer, but credentials are not;
 * • the slightest secret. No key, no token, no fingerprint comes out
 * from here: an export is a file that hangs in a folder of
 * downloads. API keys we only give the prefix already displayed on
 * the screen, Git connections only the name of the linked account.
 */

/** Format version. To be incremented if the shape of the document changes. */
export const EXPORT_FORMAT_VERSION = CURRENT_ACCOUNT_EXPORT_VERSION;

type Row = Record<string, unknown>;

/**
 * Minimum form of a PostgREST response. The Supabase client is not typed by
 * a schema generated here: the lines already arrive in `unknown` and leave in
 * JSON, so we treat them as such rather than writing an interface by
 * table for a document that does not read any fields.
 */
interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

/** Report the error rather than returning an empty batch — a truncated export in
 silence is worse than no export at all. */
function unwrap(table: string, result: QueryResult): unknown {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data;
}

function list(table: string, result: QueryResult): Row[] {
  return (unwrap(table, result) as Row[] | null) ?? [];
}

function one(table: string, result: QueryResult): Row | null {
  return (unwrap(table, result) as Row | null) ?? null;
}

/** Include file bytes so a transfer can recreate attachments on another instance. */
async function includeStorageBytes(
  service: ReturnType<typeof getServiceClient>,
  rows: Row[],
  table: AttachmentTable,
  actorId: string,
): Promise<Row[]> {
  return Promise.all(
    rows.map(async (stored) => {
      const row = await decodeAttachmentRow(table, stored, actorId);
      const storagePath = row.storage_path;
      if (typeof storagePath !== "string" || !storagePath) return row;
      const data = await downloadAttachment(service, storagePath);
      if (!data) throw new Error(`attachments/${storagePath}: download failed`);
      return {
        ...row,
        storage_base64: data.toString("base64"),
      };
    }),
  );
}

async function includeProjectIcons(
  _service: ReturnType<typeof getServiceClient>,
  projects: Row[],
): Promise<Row[]> {
  return Promise.all(
    projects.map(async (project) => {
      const id = project.id as string;
      const data = await downloadProjectIcon(id);
      if (!data) return project;
      return {
        ...project,
        project_icon_base64: data.bytes.toString("base64"),
        project_icon_mime_type: data.mimeType,
      };
    }),
  );
}

// `deleted_at` is one of them: the export gives EVERYTHING that the account holds,
// trash included (MIN-133) — filtering it would cut off a GDPR export of data
// still very present. The column says which ones were awaiting purge.
// The body of the pages is in: without it, the export would say that a wiki exists
// without giving a line.
const PAGE_COLUMNS =
  "id, project_id, parent_id, title, icon, content, position, favorite, version, " +
  "created_by, updated_by, created_at, updated_at, deleted_at, deleted_by, " +
  "database_schema, database_revision, database_title_name, property_values, " +
  "encrypted_content, encryption_version";

const ISSUE_COLUMNS =
  "id, project_id, number, title, description, plan, status, priority, effort, " +
  "assignee_id, due_date, position, created_by, created_at, updated_at, completed_at, " +
  "deleted_at, deleted_by, objective_id, parent_id, cycle_id, recurrence, " +
  "recurrence_series_id, remote_provider, remote_repo_id, remote_number, remote_url, " +
  "automation_override";

export interface AccountExport {
  transfer_format: typeof ACCOUNT_TRANSFER_FORMAT;
  transfer_version: number;
  format_version: number;
  exported_at: string;
  /** What the reader needs to know to understand the file. */
  readme: Record<string, string>;
  account: Row;
  numo_preferences?: Row[];
  owned_projects: Row[];
  memberships: Row[];
  /** Projects hidden from my own navigation (MIN-692). Optional in older exports. */
  hidden_projects?: Row[];
  issues: Row[];
  comments: Row[];
  attachments: Row[];
  page_files: Row[];
  pages: Row[];
  objectives: Row[];
  categories: Row[];
  issue_categories: Row[];
  views: Row[];
  agent_routines: Row[];
  cycles: Row[];
  scratchpad: Row | null;
  assistant_conversations: Row[];
  notifications: Row[];
  push_devices: Row[];
  statistics: Row[];
  billing: Row | null;
  ai_usage: Row[];
  api_keys: Row[];
  connected_apps: Row[];
  git_connections: Row[];
  git_user_identities: Row[];
  model_keys: Row[];
}

/**
 * Collects an account's export. Reading in service key: the person has the
 * right to see everything about their own data, and going back through RLS would require
 * to carry their session up to here for nothing.
 */
export async function buildAccountExport(userId: string): Promise<AccountExport> {
  const service = getServiceClient();

  const { data: authUser, error: authError } = await service.auth.admin.getUserById(userId);
  if (authError || !authUser?.user) {
    throw new Error(authError?.message ?? "Compte introuvable");
  }
  const user = authUser.user;

  // Owned projects — the export gives the entire content, since their
  // suppression suivra celle du compte.
  const ownedProjectRows = list(
    "projects",
    await service
      .from("projects")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at")
  );
  const projectFields = ["id", "name", "key", "color", "created_at",
    "updated_at", "deleted_at", "smart_assign_enabled", "smart_assign_rules",
    "auto_assign_enabled", "feedback_review_enabled",
    "feedback_review_skip_over_budget", "automations_enabled", "automations",
    "feedback_translate_enabled", "feedback_team_language",
    "feedback_no_translate_languages", "orb_seed"];
  const ownedProjects = await Promise.all(ownedProjectRows.map(async (row) => {
    const plain = await decodeProject(row, userId);
    return Object.fromEntries(projectFields.map((field) => [field, plain[field]]));
  }));
  const exportedProjects = await includeProjectIcons(service, ownedProjects);
  const ownedIds = exportedProjects.map((p) => p.id as string);
  const membershipsResult = await service.from("project_members")
    .select("project_id, role, created_at").eq("user_id", userId);
  const memberIds = list("project_members", membershipsResult)
    .map((membership) => membership.project_id as string);
  const readableIssueProjectIds = [...new Set([...ownedIds, ...memberIds])];
  // Personal navigation preference (MIN-692): which projects I hid.
  const hiddenProjects = list("hidden_projects", await service
    .from("hidden_projects")
    .select("project_id, hidden_at")
    .eq("user_id", userId)
    .order("hidden_at"));

  // Page typing still pending in the collaboration journal is written into
  // the rows first, so the export holds the latest text (MIN-688).
  await materializePendingProjectPages(service, ownedIds);
  const [
    numoPreferences,
    memberships,
    ownedIssues,
    myIssues,
    comments,
    attachments,
    pageFiles,
    pages,
    objectives,
    categories,
    views,
    routines,
    cycles,
    scratchpad,
    conversations,
    notifications,
    pushDevices,
    statistics,
    billing,
    aiUsage,
    apiKeys,
    grants,
    gitConnections,
    gitIdentities,
    modelKeys,
  ] = await Promise.all([
    service.from("user_numo_preferences").select("provider,model,updated_at").eq("user_id", userId),
    Promise.resolve(membershipsResult),
    ownedIds.length
      ? issueStore(service).select(ISSUE_COLUMNS).in("project_id", ownedIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    readableIssueProjectIds.length
      ? issueStore(service).select(ISSUE_COLUMNS)
          .in("project_id", readableIssueProjectIds)
          .or(`created_by.eq.${userId},assignee_id.eq.${userId}`)
      : Promise.resolve({ data: [] as Row[], error: null }),
    commentStore(service, "comments", userId)
      .select(
        "id, issue_id, parent_id, body, via_assistant, via_mcp, created_at, updated_at"
      )
      .eq("author_id", userId)
      .order("created_at"),
    service
      .from("attachments")
      .select(
        "id, project_id, issue_id, comment_id, objective_id, kind, url, page_id, " +
          "storage_path, icon_data_url, file_name, mime_type, size_bytes, created_at"
      )
      .eq("created_by", userId)
      .order("created_at"),
    // Files PLACED IN a page (MIN-280). A table apart from
    // resources, so a separate line here: forgetting them would make an export which
    // doesn't see half of what the person uploaded.
    service
      .from("page_files")
      .select(
        "id, project_id, page_id, storage_path, file_name, mime_type, size_bytes, created_at"
      )
      .eq("created_by", userId)
      .order("created_at"),
    // The WIKI of owned projects (MIN-283). Body included: a page IS its
    // document, and an export which only gives the titles would not be a
    // export. The trashed pages are there, like the tickets — the column
    // `deleted_at` says which ones were waiting for the purge.
    ownedIds.length
      ? service
          .from("pages")
          .select(PAGE_COLUMNS)
          .in("project_id", ownedIds)
          .order("created_at")
      : Promise.resolve({ data: [] as Row[], error: null }),
    ownedIds.length
      ? objectiveStore(service).select("*").in("project_id", ownedIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    ownedIds.length
      ? categoryStore(service)
          .select("id, project_id, name, color, created_at")
          .in("project_id", ownedIds)
          .order("created_at")
      : Promise.resolve({ data: [] as Row[], error: null }),
    service.from("views").select("*").eq("user_id", userId),
    ownedIds.length
      ? service.from("agent_routines").select("*").in("project_id", ownedIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    service.from("cycles").select("*").eq("user_id", userId).order("start_date"),
    getScratchpadRow(service, userId),
    service
      .from("conversations")
      .select("id, project_id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at"),
    service
      .from("notifications")
      .select(
        "id, project_id, type, issue_id, comment_id, read_at, created_at",
      )
      .eq("user_id", userId)
      .order("created_at"),
    // Devices subscribed to push notifications (MIN-183). NEITHER `endpoint`, NOR
    // `p256dh`/`auth`: this trio IS the ability to push a notification to
    // this person, and bringing it out in a downloadable file would make it
    // one more secret to protect, for no additional information —
    // the label already says what device it is.
    service
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at"),
    readStatEvents(service, userId),
    service
      .from("billing_accounts")
      .select(
        "user_id, email, stripe_plan_id, stripe_subscription_status, stripe_current_period_start, " +
          "stripe_current_period_end, stripe_cancel_at_period_end, created_at"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    // AI consumption: what was used, not what it cost. THE
    // montant en dollars du ledger reste interne (l'usage se dit en pourcentage
    // of the budget on the product side), and it doesn't tell the person anything more about
    // HER — this is Minddy's billing data, not hers.
    service
      .from("ai_usage")
      .select("feature, model, total_tokens, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000),
    // API keys: the prefix is ​​already what the settings show. `key_hash`
    // NEVER comes out — that's the secret, even in the form of a print.
    service
      .from("api_keys")
      .select("*")
      .eq("user_id", userId)
      .order("created_at"),
    service
      .from("oauth_grants")
      .select("client_id, scope, created_at, last_used_at, revoked_at")
      .eq("user_id", userId)
      .order("created_at"),
    service
      .from("git_connections")
      .select("provider, account_login, account_type, repository_selection, created_at")
      .eq("user_id", userId)
      .order("created_at"),
    // Personal git account (MIN-144): the login and the provider, never them
    // tokens — same rules as the line above.
    service
      .from("git_user_identities")
      .select("provider, account_login, provider_account_id, created_at")
      .eq("user_id", userId)
      .order("created_at"),
    service
      .from("user_ai_keys")
      .select("id, user_id, provider, key_encrypted, key_prefix, base_url, feature_models, encrypted_content, encryption_version, created_at, last_used_at")
      .eq("user_id", userId)
      .order("created_at"),
  ]);

  const conversationRows = list("conversations", conversations);
  const conversationIds = conversationRows.map((c) => c.id as string);
  const messages = conversationIds.length
    ? (await hydrateNumoToolMessages(service,
      await hydrateNumoFinalMessages(service,
        await hydrateNumoUserMessages(service, list(
        "assistant_messages",
        await service
          .from("assistant_messages")
          .select("id, conversation_id, role, content, context, metadata, tool_calls, tool_call_id, tool_name, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at")
      ), userId), userId), userId)).map(({ conversation_id, role, content,
        context, metadata, tool_calls, tool_call_id, tool_name, created_at }) =>
        ({ conversation_id, role, content, context, metadata, tool_calls,
          tool_call_id, tool_name, created_at }))
    : [];

  const messagesByConversation = new Map<string, Row[]>();
  for (const message of messages) {
    const key = message.conversation_id as string;
    const bucket = messagesByConversation.get(key);
    if (bucket) bucket.push(message);
    else messagesByConversation.set(key, [message]);
  }

  // A ticket from an owned project can also have been created by the person:
  // deduplicated so as not to output it twice.
  const issuesById = new Map<string, Row>();
  for (const issue of [...list("issues", ownedIssues), ...list("issues", myIssues)]) {
    issuesById.set(issue.id as string, issue);
  }

  const ownedIssueIds = list("issues", ownedIssues).map((issue) => issue.id as string);
  const issueCategories = ownedIssueIds.length
    ? list(
        "issue_categories",
        await service
          .from("issue_categories")
          .select("issue_id, category_id")
          .in("issue_id", ownedIssueIds),
      )
    : [];
  const exportedAttachments = await includeStorageBytes(
    service,
    list("attachments", attachments),
    "attachments", userId,
  );
  const exportedPageFiles = await includeStorageBytes(service,
    list("page_files", pageFiles), "page_files", userId);

  const billingRow = one("billing_accounts", billing);
  const exportedBilling = billingRow
    ? await decodeBillingAccount(userId, billingRow as Row & {
      user_id: string; email: string | null }) : null;
  return {
    transfer_format: ACCOUNT_TRANSFER_FORMAT,
    transfer_version: ACCOUNT_TRANSFER_VERSION,
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    readme: {
      about:
        "Export des données personnelles associées à ce compte minddy, au titre " +
        "des articles 15 et 20 du RGPD.",
      owned_projects:
        "Contenu intégral des projets dont vous êtes propriétaire. Supprimer " +
        "votre compte supprime ces projets, leurs tickets et leurs membres.",
      issues:
        "Tickets que vous avez créés ou qui vous sont assignés, plus tous ceux " +
        "des projets que vous possédez.",
      attachments:
        "Ressources que vous avez ajoutées : fichiers et leur contenu pour " +
        "permettre le transfert, liens, " +
        "dont l'URL figure ici, et pages du " +
        "projet, désignées par leur identifiant.",
      page_files:
        "Fichiers et images que vous avez déposés DANS le corps d'une page " +
        "(contenu inclus pour permettre le transfert). Ils sont listés à part des " +
        "ressources : ce ne sont pas des pièces jointes d'un ticket, mais des " +
        "morceaux du document lui-même.",
      pages:
        "Les pages du wiki des projets que vous possédez, corps compris — le " +
        "document est stocké en JSON (le même que celui de l'éditeur). Une " +
        "page se réexporte aussi en markdown, page par page ou branche " +
        "entière, depuis son menu dans l'application.",
      secrets:
        "Aucune clé ni aucun jeton ne figure dans ce fichier : seuls les " +
        "préfixes déjà affichés dans les réglages y apparaissent.",
      contact: CONTACT_EMAIL,
    },
    account: {
      id: user.id,
      email: user.email ?? null,
      display_name:
        (user.user_metadata?.display_name as string | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        null,
      providers: user.app_metadata?.providers ?? [],
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      user_metadata: user.user_metadata ?? {},
    },
    numo_preferences: list("user_numo_preferences", numoPreferences),
    owned_projects: exportedProjects,
    memberships: list("project_members", memberships),
    hidden_projects: hiddenProjects,
    issues: [...issuesById.values()],
    comments: list("comments", comments),
    attachments: exportedAttachments,
    page_files: exportedPageFiles,
    pages: await Promise.all(list("pages", pages).map((row) =>
      decodePageProjection(row, userId))),
    objectives: list("objectives", objectives),
    categories: list("categories", categories),
    issue_categories: issueCategories,
    views: await Promise.all(list("views", views).map((row) =>
      decodeView(row, userId))),
    agent_routines: await Promise.all(list("agent_routines", routines).map((row) =>
      decodeRoutine(row, userId))),
    cycles: list("cycles", cycles),
    scratchpad: scratchpad ? { content: scratchpad.content, updated_at: scratchpad.updated_at } : null,
    assistant_conversations: await Promise.all(conversationRows.map(async (c) => ({
      ...c,
      title: await decodeConversationTitle(userId, c.id as string,
        c.title as string | null, userId),
      messages: messagesByConversation.get(c.id as string) ?? [],
    }))),
    notifications: list("notifications", notifications),
    push_devices: await Promise.all(list("push_subscriptions", pushDevices)
      .map(async (row) => {
        const device = await openPush(row as StoredPush & Record<string, unknown>);
        return { transport: device.transport, device_label: device.device_label,
          enabled: device.enabled, created_at: device.created_at,
          last_push_at: device.last_push_at };
      })),
    statistics,
    billing: exportedBilling,
    ai_usage: list("ai_usage", aiUsage),
    api_keys: await Promise.all(list("api_keys", apiKeys).map(async (row) => {
      const content = await decodeApiKeyContent(row as StoredApiKey);
      return { name: content.name, key_prefix: row.key_prefix,
        created_at: row.created_at, last_used_at: row.last_used_at,
        revoked_at: row.revoked_at };
    })),
    connected_apps: list("oauth_grants", grants),
    git_connections: list("git_connections", gitConnections),
    git_user_identities: list("git_user_identities", gitIdentities),
    model_keys: await Promise.all(list("user_ai_keys", modelKeys).map(
      async (row) => {
        const plain = await decodeUserAiKeyRow(row as UserAiKeyRow, userId);
        return { provider: plain.provider, key_prefix: plain.key_prefix,
          base_url: plain.base_url, created_at: plain.created_at,
          last_used_at: plain.last_used_at };
      })),
  };
}
