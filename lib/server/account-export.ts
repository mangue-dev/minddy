import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  ACCOUNT_TRANSFER_FORMAT,
  ACCOUNT_TRANSFER_VERSION,
  CURRENT_ACCOUNT_EXPORT_VERSION,
} from "@/lib/account-transfer";
import { projectIconPaths } from "@/lib/server/project-storage";

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
 * • her contributions in the projects of others — tickets that she created or
 * that are assigned to her, comments that she wrote;
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
): Promise<Row[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = row.storage_path;
      if (typeof storagePath !== "string" || !storagePath) return row;
      const { data, error } = await service.storage
        .from("attachments")
        .download(storagePath);
      if (error || !data) {
        throw new Error(`attachments/${storagePath}: ${error?.message ?? "download failed"}`);
      }
      return {
        ...row,
        storage_base64: Buffer.from(await data.arrayBuffer()).toString("base64"),
      };
    }),
  );
}

async function includeProjectIcons(
  service: ReturnType<typeof getServiceClient>,
  projects: Row[],
): Promise<Row[]> {
  const paths = await projectIconPaths(
    service,
    projects.map((project) => project.id as string),
  );
  return Promise.all(
    projects.map(async (project) => {
      const id = project.id as string;
      const path = paths.find((candidate) => candidate.startsWith(`${id}.`));
      if (!path) return project;
      const { data, error } = await service.storage.from("project-icons").download(path);
      if (error || !data) {
        throw new Error(`project-icons/${path}: ${error?.message ?? "download failed"}`);
      }
      return {
        ...project,
        project_icon_base64: Buffer.from(await data.arrayBuffer()).toString("base64"),
        project_icon_mime_type: data.type || "image/webp",
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
  "created_by, updated_by, created_at, updated_at, deleted_at, deleted_by";

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
  preferences: Row | null;
  owned_projects: Row[];
  memberships: Row[];
  issues: Row[];
  comments: Row[];
  attachments: Row[];
  page_files: Row[];
  pages: Row[];
  objectives: Row[];
  categories: Row[];
  issue_categories: Row[];
  views: Row[];
  cycles: Row[];
  scratchpad: Row | null;
  assistant_conversations: Row[];
  code_agent_conversations: Row[];
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
  const ownedProjects = list(
    "projects",
    await service
      .from("projects")
      .select("id, name, key, color, created_at, updated_at, deleted_at")
      .eq("owner_id", userId)
      .order("created_at")
  );
  const exportedProjects = await includeProjectIcons(service, ownedProjects);
  const ownedIds = exportedProjects.map((p) => p.id as string);

  const [
    preferences,
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
    service.from("user_agent_preferences").select("*").eq("user_id", userId).maybeSingle(),
    service.from("project_members").select("project_id, role, created_at").eq("user_id", userId),
    ownedIds.length
      ? service.from("issues").select(ISSUE_COLUMNS).in("project_id", ownedIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    service
      .from("issues")
      .select(ISSUE_COLUMNS)
      .or(`created_by.eq.${userId},assignee_id.eq.${userId}`),
    service
      .from("comments")
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
      ? service.from("objectives").select("*").in("project_id", ownedIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    ownedIds.length
      ? service
          .from("categories")
          .select("id, project_id, name, color, created_at")
          .in("project_id", ownedIds)
          .order("created_at")
      : Promise.resolve({ data: [] as Row[], error: null }),
    service.from("views").select("*").eq("user_id", userId),
    service.from("cycles").select("*").eq("user_id", userId).order("start_date"),
    service
      .from("user_scratchpad")
      .select("content, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("conversations")
      .select("id, project_id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at"),
    service
      .from("notifications")
      .select(
        "id, project_id, type, issue_id, agent_conversation_id, comment_id, read_at, created_at",
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
      .select("transport, native_installation_id, device_label, enabled, created_at, last_push_at")
      .eq("user_id", userId)
      .order("created_at"),
    service
      .from("stat_events")
      .select("kind, occurred_at, project_name, issue_number, issue_title")
      .eq("user_id", userId)
      .order("occurred_at"),
    service
      .from("billing_accounts")
      .select(
        "email, stripe_plan_id, stripe_subscription_status, stripe_current_period_start, " +
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
      .select("name, key_prefix, created_at, last_used_at, revoked_at")
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
      .select("provider, key_prefix, base_url, created_at, last_used_at")
      .eq("user_id", userId)
      .order("created_at"),
  ]);

  const conversationRows = list("conversations", conversations);
  const conversationIds = conversationRows.map((c) => c.id as string);
  const messages = conversationIds.length
    ? list(
        "assistant_messages",
        await service
          .from("assistant_messages")
          .select("conversation_id, role, content, tool_name, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at")
      )
    : [];

  const messagesByConversation = new Map<string, Row[]>();
  for (const message of messages) {
    const key = message.conversation_id as string;
    const bucket = messagesByConversation.get(key);
    if (bucket) bucket.push(message);
    else messagesByConversation.set(key, [message]);
  }

  const codeConversationRows = list(
    "agent_conversations",
    await service
      .from("agent_conversations")
      .select("id, project_id, title, visibility, archived_at, created_at, updated_at")
      .eq("owner_id", userId)
      .order("created_at"),
  );
  const codeConversationIds = codeConversationRows.map((c) => c.id as string);
  const [codeMessages, codeTurns, codeContexts] = codeConversationIds.length
    ? await Promise.all([
        service
          .from("agent_messages")
          .select("conversation_id, turn_id, role, content, source, created_at")
          .in("conversation_id", codeConversationIds)
          .order("created_at"),
        service
          .from("agent_turns")
          .select(
            "id, conversation_id, status, model, reasoning_level, cost_usd, outcome, error_message, started_at, completed_at, created_at",
          )
          .in("conversation_id", codeConversationIds)
          .order("created_at"),
        service
          .from("agent_conversation_contexts")
          .select("conversation_id, kind, resource_id, role, snapshot, created_at")
          .in("conversation_id", codeConversationIds)
          .order("created_at"),
      ])
    : [
        { data: [] as Row[], error: null },
        { data: [] as Row[], error: null },
        { data: [] as Row[], error: null },
      ];

  const codeRowsFor = (table: string, result: QueryResult, id: string): Row[] =>
    list(table, result).filter((row) => row.conversation_id === id);

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
  );
  const exportedPageFiles = await includeStorageBytes(service, list("page_files", pageFiles));

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
    preferences: one("user_agent_preferences", preferences),
    owned_projects: exportedProjects,
    memberships: list("project_members", memberships),
    issues: [...issuesById.values()],
    comments: list("comments", comments),
    attachments: exportedAttachments,
    page_files: exportedPageFiles,
    pages: list("pages", pages),
    objectives: list("objectives", objectives),
    categories: list("categories", categories),
    issue_categories: issueCategories,
    views: list("views", views),
    cycles: list("cycles", cycles),
    scratchpad: one("user_scratchpad", scratchpad),
    assistant_conversations: conversationRows.map((c) => ({
      ...c,
      messages: messagesByConversation.get(c.id as string) ?? [],
    })),
    code_agent_conversations: codeConversationRows.map((c) => ({
      ...c,
      contexts: codeRowsFor("agent_conversation_contexts", codeContexts, c.id as string),
      turns: codeRowsFor("agent_turns", codeTurns, c.id as string),
      messages: codeRowsFor("agent_messages", codeMessages, c.id as string),
    })),
    notifications: list("notifications", notifications),
    push_devices: list("push_subscriptions", pushDevices),
    statistics: list("stat_events", statistics),
    billing: one("billing_accounts", billing),
    ai_usage: list("ai_usage", aiUsage),
    api_keys: list("api_keys", apiKeys),
    connected_apps: list("oauth_grants", grants),
    git_connections: list("git_connections", gitConnections),
    git_user_identities: list("git_user_identities", gitIdentities),
    model_keys: list("user_ai_keys", modelKeys),
  };
}
