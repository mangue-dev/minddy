import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Export des données d'un compte (MIN-119, RGPD art. 15 et 20).
 *
 * Ce que l'export contient est exactement ce que la suppression du compte
 * détruit (`lib/server/account-deletion.ts`), plus ce que la personne a écrit
 * ailleurs. Cette symétrie est volontaire : l'export est ce qu'on emporte avant
 * de partir, il n'aurait aucun sens qu'il soit plus étroit que l'effacement.
 *
 * Concrètement :
 *   • le contenu INTÉGRAL des projets dont elle est propriétaire — ce sont ceux
 *     que la suppression du compte emporte, membres compris ;
 *   • ses contributions dans les projets des autres — tickets qu'elle a créés ou
 *     qui lui sont assignés, commentaires qu'elle a écrits ;
 *   • tout ce qui est strictement personnel : cycles, bloc-notes, conversations
 *     avec l'assistant, notifications, statistiques, préférences.
 *
 * Ce que l'export ne contient PAS, et pourquoi :
 *   • le contenu des projets des autres qu'elle n'a pas écrit — ce n'est pas sa
 *     donnée au sens de l'article 20, et l'application le lui montre déjà ;
 *   • les octets des pièces jointes — l'export est un JSON ; les fichiers restent
 *     téléchargeables depuis l'application tant que le compte existe ;
 *   • le moindre secret. Aucune clé, aucun jeton, aucune empreinte ne sort
 *     d'ici : un export est un fichier qui traîne dans un dossier de
 *     téléchargements. Des clés API on ne donne que le préfixe déjà affiché à
 *     l'écran, des connexions Git que le nom du compte relié.
 */

/** Version du format. À incrémenter si la forme du document change. */
export const EXPORT_FORMAT_VERSION = 2;

type Row = Record<string, unknown>;

/**
 * Forme minimale d'une réponse PostgREST. Le client Supabase n'est pas typé par
 * un schéma généré ici : les lignes arrivent déjà en `unknown` et repartent en
 * JSON, donc on les traite comme telles plutôt que d'écrire une interface par
 * table pour un document qui n'en lit aucun champ.
 */
interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

/** Remonte l'erreur plutôt que de rendre un lot vide — un export tronqué en
    silence est pire que pas d'export du tout. */
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

// `deleted_at` en fait partie : l'export donne TOUT ce que le compte détient,
// corbeille comprise (MIN-133) — la filtrer amputerait un export RGPD de données
// encore bien présentes. La colonne dit lesquelles étaient en attente de purge.
// Le corps des pages est dedans : sans lui, l'export dirait qu'un wiki existe
// sans en donner une ligne.
const PAGE_COLUMNS =
  "id, project_id, parent_id, title, icon, content, position, favorite, " +
  "created_by, updated_by, created_at, updated_at, deleted_at";

const ISSUE_COLUMNS =
  "id, project_id, number, title, description, plan, status, priority, effort, " +
  "assignee_id, due_date, created_by, created_at, updated_at, completed_at, deleted_at";

export interface AccountExport {
  format_version: number;
  exported_at: string;
  /** Ce que le lecteur doit savoir pour comprendre le fichier. */
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
 * Rassemble l'export d'un compte. Lecture en clé de service : la personne a le
 * droit de tout voir de ses propres données, et repasser par RLS obligerait à
 * porter sa session jusqu'ici pour rien.
 */
export async function buildAccountExport(userId: string): Promise<AccountExport> {
  const service = getServiceClient();

  const { data: authUser, error: authError } = await service.auth.admin.getUserById(userId);
  if (authError || !authUser?.user) {
    throw new Error(authError?.message ?? "Compte introuvable");
  }
  const user = authUser.user;

  // Projets possédés — l'export en donne le contenu entier, puisque leur
  // suppression suivra celle du compte.
  const ownedProjects = list(
    "projects",
    await service
      .from("projects")
      .select("id, name, key, color, created_at, updated_at, deleted_at")
      .eq("owner_id", userId)
      .order("created_at")
  );
  const ownedIds = ownedProjects.map((p) => p.id as string);

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
      .select("id, issue_id, body, created_at, updated_at")
      .eq("author_id", userId)
      .order("created_at"),
    service
      .from("attachments")
      .select(
        "id, project_id, issue_id, comment_id, kind, url, page_id, file_name, mime_type, size_bytes, created_at"
      )
      .eq("created_by", userId)
      .order("created_at"),
    // Les fichiers POSÉS DANS une page (MIN-280). Une table à part des
    // ressources, donc une ligne à part ici : les oublier ferait un export qui
    // ne voit pas la moitié de ce que la personne a téléversé.
    service
      .from("page_files")
      .select(
        "id, project_id, page_id, file_name, mime_type, size_bytes, created_at"
      )
      .eq("created_by", userId)
      .order("created_at"),
    // Le WIKI des projets possédés (MIN-283). Corps compris : une page EST son
    // document, et un export qui n'en donnerait que les titres ne serait pas un
    // export. Les pages corbeillées y sont, comme les tickets — la colonne
    // `deleted_at` dit lesquelles attendaient la purge.
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
    // Appareils abonnés aux notifications push (MIN-183). NI `endpoint`, NI
    // `p256dh`/`auth` : ce trio EST la capacité de pousser une notification à
    // cette personne, et le ressortir dans un fichier téléchargeable en ferait
    // un secret de plus à protéger, pour aucune information supplémentaire —
    // le libellé dit déjà quel appareil c'est.
    service
      .from("push_subscriptions")
      .select("transport, device_label, enabled, created_at, last_push_at")
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
    // Consommation d'IA : ce qui a été utilisé, pas ce que ça a coûté. Le
    // montant en dollars du ledger reste interne (l'usage se dit en pourcentage
    // du budget côté produit), et il ne dit rien de plus à la personne sur
    // ELLE — c'est une donnée de facturation de minddy, pas la sienne.
    service
      .from("ai_usage")
      .select("feature, model, total_tokens, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000),
    // Clés API : le préfixe est déjà ce que montrent les réglages. `key_hash`
    // ne sort JAMAIS — c'est le secret, même sous forme d'empreinte.
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
    // Compte git personnel (MIN-144) : le login et le fournisseur, jamais les
    // tokens — mêmes règles que la ligne au-dessus.
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

  // Un ticket d'un projet possédé peut aussi avoir été créé par la personne :
  // dédoublonné pour ne pas le sortir deux fois.
  const issuesById = new Map<string, Row>();
  for (const issue of [...list("issues", ownedIssues), ...list("issues", myIssues)]) {
    issuesById.set(issue.id as string, issue);
  }

  return {
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
        "Ressources que vous avez ajoutées : fichiers (métadonnées seulement — " +
        "les fichiers eux-mêmes restent téléchargeables depuis l'application " +
        "tant que le compte existe), liens, dont l'URL figure ici, et pages du " +
        "projet, désignées par leur identifiant.",
      page_files:
        "Fichiers et images que vous avez déposés DANS le corps d'une page " +
        "(métadonnées seulement, comme ci-dessus). Ils sont listés à part des " +
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
      contact: "hello@minddy.app",
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
    owned_projects: ownedProjects,
    memberships: list("project_members", memberships),
    issues: [...issuesById.values()],
    comments: list("comments", comments),
    attachments: list("attachments", attachments),
    page_files: list("page_files", pageFiles),
    pages: list("pages", pages),
    objectives: list("objectives", objectives),
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
