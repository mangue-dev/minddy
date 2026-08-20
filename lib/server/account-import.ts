import "server-only";

import { randomUUID } from "node:crypto";
import type { AccountTransferDocument, TransferRow } from "@/lib/account-transfer";
import { getServiceClient } from "@/lib/supabase-service";

type Service = ReturnType<typeof getServiceClient>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AccountImportResult {
  projects: number;
  issues: number;
  pages: number;
  objectives: number;
  comments: number;
  attachments: number;
  personalData: number;
  membershipsRestored: number;
  remappedIds: number;
  skippedMemberships: number;
  warnings: string[];
}

function stringValue(row: TransferRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value ? value : null;
}

function uuidValue(row: TransferRow, key: string): string | null {
  const value = stringValue(row, key);
  return value && UUID_RE.test(value) ? value : null;
}

function mapId(value: unknown, ids: Map<string, string>): string | null {
  return typeof value === "string" ? ids.get(value) ?? null : null;
}

function remapUser(value: unknown, sourceUserId: string, targetUserId: string): string | null {
  if (typeof value !== "string") return null;
  return value === sourceUserId ? targetUserId : null;
}

async function existingById(
  service: Service,
  table: string,
  ids: string[],
  columns = "id",
): Promise<Map<string, TransferRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await service.from(table).select(columns).in("id", ids);
  if (error) throw new Error(`${table}: ${error.message}`);
  return new Map(
    ((data ?? []) as unknown as TransferRow[]).flatMap((row) => {
      const id = stringValue(row, "id");
      return id ? [[id, row] as const] : [];
    }),
  );
}

async function upsertRows(
  service: Service,
  table: string,
  rows: TransferRow[],
  onConflict = "id",
): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await service
      .from(table)
      .upsert(rows.slice(i, i + 200), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function pick(row: TransferRow, keys: string[]): TransferRow {
  return Object.fromEntries(
    keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
  );
}

function safeStorageName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "file";
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}

async function freeProjectKey(
  service: Service,
  sourceKey: string,
  ownerId: string,
  used: Set<string>,
): Promise<string> {
  const candidate = sourceKey.trim().toUpperCase();
  if (!used.has(candidate)) {
    const { data } = await service
      .from("projects")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("key", candidate)
      .maybeSingle();
    if (!data) {
      used.add(candidate);
      return candidate;
    }
  }

  for (let i = 1; i < 1000; i += 1) {
    const suffix = String(i);
    const fallback = `IMP${suffix}`.slice(0, 5);
    if (used.has(fallback)) continue;
    const { data } = await service
      .from("projects")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("key", fallback)
      .maybeSingle();
    if (!data) {
      used.add(fallback);
      return fallback;
    }
  }
  throw new Error("Could not allocate a project key for the imported project");
}

async function importProjects(
  service: Service,
  document: AccountTransferDocument,
  userId: string,
  warnings: string[],
): Promise<{ projectIds: Map<string, string>; remapped: number }> {
  const sourceIds = document.owned_projects
    .map((row) => uuidValue(row, "id"))
    .filter((id): id is string => id !== null);
  const existing = await existingById(service, "projects", sourceIds, "id, owner_id, key");
  const usedKeys = new Set<string>();
  const { data: owned } = await service.from("projects").select("key").eq("owner_id", userId);
  for (const row of (owned ?? []) as TransferRow[]) {
    const key = stringValue(row, "key");
    if (key) usedKeys.add(key.toUpperCase());
  }

  const projectIds = new Map<string, string>();
  let remapped = 0;
  const rows: TransferRow[] = [];
  for (const source of document.owned_projects) {
    const sourceId = uuidValue(source, "id");
    const sourceKey = stringValue(source, "key");
    const existingRow = sourceId ? existing.get(sourceId) : undefined;
    const targetId =
      sourceId && (!existingRow || stringValue(existingRow, "owner_id") === userId)
        ? sourceId
        : randomUUID();
    if (sourceId && targetId !== sourceId) {
      remapped += 1;
      warnings.push(`Project ${sourceKey ?? sourceId} received a new ID because the original is already in use.`);
    }
    if (sourceId) projectIds.set(sourceId, targetId);
    rows.push({
      ...pick(source, [
        "name",
        "color",
        "created_at",
        "updated_at",
        "deleted_at",
        "smart_assign_enabled",
        "smart_assign_rules",
        "icon_url",
        "auto_assign_enabled",
        "feedback_review_enabled",
        "feedback_review_skip_over_budget",
        "automations_enabled",
        "automations",
        "feedback_translate_enabled",
        "feedback_team_language",
        "feedback_no_translate_languages",
        "orb_seed",
      ]),
      id: targetId,
      owner_id: userId,
      key: await freeProjectKey(service, sourceKey ?? `IMP${rows.length + 1}`, userId, usedKeys),
    });
  }
  await upsertRows(service, "projects", rows);
  for (const source of document.owned_projects) {
    const sourceId = uuidValue(source, "id");
    const targetId = sourceId ? projectIds.get(sourceId) : null;
    const bytes = source.project_icon_base64;
    if (!targetId || typeof bytes !== "string") continue;
    const mime = typeof source.project_icon_mime_type === "string"
      ? source.project_icon_mime_type
      : "image/webp";
    const extension = mime.includes("png") ? "png" : mime.includes("jpeg") ? "jpg" : "webp";
    const path = `${targetId}.${extension}`;
    const { error } = await service.storage
      .from("project-icons")
      .upload(path, Buffer.from(bytes, "base64"), { contentType: mime, upsert: true });
    if (error) throw new Error(`project-icons/${targetId}: ${error.message}`);
    const { data } = service.storage.from("project-icons").getPublicUrl(path);
    await service.from("projects").update({ icon_url: `${data.publicUrl}?v=${Date.now()}` }).eq("id", targetId);
  }
  return { projectIds, remapped };
}

async function addExistingProjectIds(
  service: Service,
  document: AccountTransferDocument,
  projectIds: Map<string, string>,
): Promise<void> {
  const candidates = new Set<string>();
  for (const collection of [document.issues, document.memberships, document.views, document.pages]) {
    for (const row of collection) {
      const id = uuidValue(row, "project_id");
      if (id && !projectIds.has(id)) candidates.add(id);
    }
  }
  if (candidates.size === 0) return;
  const { data, error } = await service
    .from("projects")
    .select("id")
    .in("id", [...candidates]);
  if (error) throw new Error(`projects: ${error.message}`);
  for (const row of (data ?? []) as TransferRow[]) {
    const id = stringValue(row, "id");
    if (id) projectIds.set(id, id);
  }
}

async function importSimpleEntity(
  service: Service,
  table: string,
  rows: TransferRow[],
  sourceUserId: string,
  userId: string,
  projectIds: Map<string, string>,
  idMap: Map<string, string>,
  columns: string[],
): Promise<number> {
  const sourceIds = rows.map((row) => uuidValue(row, "id")).filter((id): id is string => id !== null);
  const existing = await existingById(service, table, sourceIds);
  const out: TransferRow[] = [];
  for (const source of rows) {
    const sourceId = uuidValue(source, "id");
    const projectId = mapId(source.project_id, projectIds);
    if (source.project_id !== undefined && !projectId) continue;
    if (!sourceId) continue;
    const targetId = existing.has(sourceId) ? sourceId : sourceId;
    idMap.set(sourceId, targetId);
    const row = pick(source, columns);
    row.id = targetId;
    if (row.project_id !== undefined) row.project_id = projectId;
    for (const key of ["created_by", "updated_by", "deleted_by", "author_id", "lead_user_id"]) {
      if (row[key] !== undefined) row[key] = remapUser(row[key], sourceUserId, userId);
    }
    out.push(row);
  }
  await upsertRows(service, table, out);
  return out.length;
}

export async function importAccountTransfer(
  document: AccountTransferDocument,
  userId: string,
): Promise<AccountImportResult> {
  const service = getServiceClient();
  const sourceUserId = stringValue(document.account, "id") ?? "";
  const warnings: string[] = [];
  const result: AccountImportResult = {
    projects: 0,
    issues: 0,
    pages: 0,
    objectives: 0,
    comments: 0,
    attachments: 0,
    personalData: 0,
    membershipsRestored: 0,
    remappedIds: 0,
    skippedMemberships: 0,
    warnings,
  };

  const projects = await importProjects(service, document, userId, warnings);
  result.projects = document.owned_projects.length;
  result.remappedIds += projects.remapped;
  await addExistingProjectIds(service, document, projects.projectIds);

  const objectiveIds = new Map<string, string>();
  result.objectives = await importSimpleEntity(
    service,
    "objectives",
    document.objectives,
    sourceUserId,
    userId,
    projects.projectIds,
    objectiveIds,
    ["id", "project_id", "name", "description", "status", "lead_user_id", "target_date", "color", "created_at", "updated_at", "deleted_at", "deleted_by"],
  );

  const categoryIds = new Map<string, string>();
  const categories = document.categories ?? [];
  result.personalData += await importSimpleEntity(
    service,
    "categories",
    categories,
    sourceUserId,
    userId,
    projects.projectIds,
    categoryIds,
    ["id", "project_id", "name", "color", "created_at"],
  );

  const cycleIds = new Map<string, string>();
  if (document.cycles.length) {
    const cycleRows: TransferRow[] = [];
    for (const row of document.cycles) {
      const id = uuidValue(row, "id");
      if (!id) continue;
      cycleIds.set(id, id);
      cycleRows.push({ ...pick(row, ["id", "start_date", "end_date", "intensity", "target_points", "completed_points", "filled_at", "created_at", "updated_at"]), id, user_id: userId });
    }
    await upsertRows(service, "cycles", cycleRows);
    result.personalData += cycleRows.length;
  }

  const issueIds = new Map<string, string>();
  const issueRows: TransferRow[] = [];
  const existingIssues = await existingById(
    service,
    "issues",
    document.issues.map((row) => uuidValue(row, "id")).filter((id): id is string => id !== null),
    "id, project_id",
  );
  for (const source of document.issues) {
    const sourceId = uuidValue(source, "id");
    const projectId = mapId(source.project_id, projects.projectIds);
    if (!sourceId || !projectId) continue;
    const existing = existingIssues.get(sourceId);
    const targetId = existing && existing.project_id === projectId ? sourceId : randomUUID();
    if (targetId !== sourceId) {
      result.remappedIds += 1;
      warnings.push(`Issue ${sourceId} received a new ID because the original is already in use.`);
    }
    issueIds.set(sourceId, targetId);
  }
  for (const source of document.issues) {
    const sourceId = uuidValue(source, "id");
    const projectId = mapId(source.project_id, projects.projectIds);
    if (!sourceId || !projectId) continue;
    const targetId = issueIds.get(sourceId);
    if (!targetId) continue;
    issueRows.push({
      ...pick(source, ["number", "title", "description", "plan", "status", "priority", "effort", "due_date", "position", "created_at", "updated_at", "completed_at", "deleted_at", "recurrence", "remote_provider", "remote_repo_id", "remote_number", "remote_url", "automation_override"]),
      id: targetId,
      project_id: projectId,
      created_by: remapUser(source.created_by, sourceUserId, userId),
      assignee_id: remapUser(source.assignee_id, sourceUserId, userId),
      objective_id: mapId(source.objective_id, objectiveIds),
      parent_id: mapId(source.parent_id, issueIds),
      cycle_id: mapId(source.cycle_id, cycleIds),
    });
  }
  await upsertRows(service, "issues", issueRows);
  result.issues = issueRows.length;

  const issueCategoryRows = (document.issue_categories ?? []).flatMap((row) => {
    const issueId = mapId(row.issue_id, issueIds);
    const categoryId = mapId(row.category_id, categoryIds);
    return issueId && categoryId ? [{ issue_id: issueId, category_id: categoryId }] : [];
  });
  await upsertRows(service, "issue_categories", issueCategoryRows, "issue_id,category_id");

  const pageIds = new Map<string, string>();
  const pageSourceIds = document.pages.map((row) => uuidValue(row, "id")).filter((id): id is string => id !== null);
  const existingPages = await existingById(service, "pages", pageSourceIds, "id, project_id");
  for (const source of document.pages) {
    const sourceId = uuidValue(source, "id");
    const projectId = mapId(source.project_id, projects.projectIds);
    if (!sourceId || !projectId) continue;
    const existing = existingPages.get(sourceId);
    const targetId = existing && existing.project_id === projectId ? sourceId : randomUUID();
    if (targetId !== sourceId) result.remappedIds += 1;
    pageIds.set(sourceId, targetId);
  }
  const pageRows = document.pages.flatMap((source) => {
    const sourceId = uuidValue(source, "id");
    const projectId = mapId(source.project_id, projects.projectIds);
    const targetId = sourceId ? pageIds.get(sourceId) : null;
    if (!sourceId || !projectId || !targetId) return [];
    return [{
      ...pick(source, ["title", "icon", "content", "position", "favorite", "version", "created_at", "updated_at", "deleted_at", "deleted_by"]),
      id: targetId,
      project_id: projectId,
      parent_id: mapId(source.parent_id, pageIds),
      created_by: remapUser(source.created_by, sourceUserId, userId),
      updated_by: remapUser(source.updated_by, sourceUserId, userId),
    }];
  });
  await upsertRows(service, "pages", pageRows);
  result.pages = pageRows.length;

  const pageFiles: TransferRow[] = document.page_files.flatMap((source) => {
    const projectId = mapId(source.project_id, projects.projectIds);
    const pageId = mapId(source.page_id, pageIds);
    const id = uuidValue(source, "id");
    if (!id || !projectId || !pageId || typeof source.storage_base64 !== "string") {
      if (id && pageId && source.storage_base64 === undefined) {
        warnings.push(`Page file ${id} was skipped because its file bytes are missing.`);
      }
      return [];
    }
    return [{
      ...pick(source, ["id", "file_name", "mime_type", "size_bytes", "created_at"]),
      id,
      page_id: pageId,
      project_id: projectId,
      created_by: userId,
    }];
  });
  for (const row of pageFiles) {
    const source = document.page_files.find((item) => item.id === row.id);
    if (!source || typeof source.storage_base64 !== "string") continue;
    const path = `projects/${row.project_id}/pages/${row.page_id}/${row.id}/${safeStorageName(row.file_name)}`;
    const { error } = await service.storage
      .from("attachments")
      .upload(path, Buffer.from(source.storage_base64, "base64"), { contentType: String(row.mime_type ?? "application/octet-stream"), upsert: true });
    if (error) throw new Error(`page_files/${row.id}: ${error.message}`);
    row.storage_path = path;
  }
  await upsertRows(service, "page_files", pageFiles);
  result.attachments += pageFiles.length;

  const commentIds = new Map<string, string>();
  for (const source of document.comments) {
    const id = uuidValue(source, "id");
    if (id) commentIds.set(id, id);
  }
  const comments = document.comments.flatMap((source) => {
    const issueId = mapId(source.issue_id, issueIds);
    const id = uuidValue(source, "id");
    if (!id || !issueId) return [];
    return [{
      ...pick(source, ["id", "body", "via_assistant", "via_mcp", "created_at", "updated_at"]),
      id,
      issue_id: issueId,
      author_id: userId,
      parent_id: mapId(source.parent_id, commentIds),
    }];
  });
  await upsertRows(service, "comments", comments);
  result.comments = comments.length;

  const attachments: TransferRow[] = document.attachments.flatMap((source) => {
    const projectId = mapId(source.project_id, projects.projectIds);
    const issueId = mapId(source.issue_id, issueIds);
    const objectiveId = mapId(source.objective_id, objectiveIds);
    const pageId = mapId(source.page_id, pageIds);
    const id = uuidValue(source, "id");
    if (!id || !projectId || (!issueId && !objectiveId && !pageId)) return [];
    if (source.kind === "file" && typeof source.storage_base64 !== "string") {
      warnings.push(`Attachment ${id} was skipped because its file bytes are missing.`);
      return [];
    }
    return [{
      ...pick(source, ["id", "comment_id", "kind", "url", "icon_data_url", "file_name", "mime_type", "size_bytes"]),
      id,
      project_id: projectId,
      issue_id: issueId,
      objective_id: objectiveId,
      page_id: pageId,
      created_by: userId,
    }];
  });
  for (const row of attachments) {
    const source = document.attachments.find((item) => item.id === row.id);
    if (source?.kind === "file" && typeof source.storage_base64 === "string") {
      const path = `projects/${row.project_id}/${row.issue_id ?? row.objective_id ?? row.id}/${row.id}/${safeStorageName(row.file_name)}`;
      const { error } = await service.storage
        .from("attachments")
        .upload(path, Buffer.from(source.storage_base64, "base64"), { contentType: String(row.mime_type ?? "application/octet-stream"), upsert: true });
      if (error) throw new Error(`attachments/${row.id}: ${error.message}`);
      row.storage_path = path;
    }
  }
  await upsertRows(service, "attachments", attachments);
  result.attachments = attachments.length;

  if (document.preferences) {
    await upsertRows(service, "user_agent_preferences", [{ ...document.preferences, user_id: userId }], "user_id");
    result.personalData += 1;
  }
  if (document.scratchpad) {
    await upsertRows(service, "user_scratchpad", [{ ...document.scratchpad, user_id: userId }], "user_id");
    result.personalData += 1;
  }
  await upsertRows(
    service,
    "views",
    document.views.flatMap((source) => {
      const id = uuidValue(source, "id");
      if (!id) return [];
      const projectId = mapId(source.project_id, projects.projectIds);
      if (source.project_id !== undefined && !projectId) return [];
      return [{ ...pick(source, ["id", "name", "filters", "sort", "display", "position", "created_at", "updated_at", "kind"]), id, project_id: projectId, user_id: userId }];
    }),
  );

  const conversationIds = new Map<string, string>();
  const conversations = document.assistant_conversations.flatMap((source) => {
    const id = uuidValue(source, "id");
    if (!id) return [];
    conversationIds.set(id, id);
    return [{
      id,
      project_id: mapId(source.project_id, projects.projectIds),
      user_id: userId,
      title: source.title ?? null,
      created_at: source.created_at,
      updated_at: source.updated_at,
    }];
  });
  await upsertRows(service, "conversations", conversations);
  for (const conversation of document.assistant_conversations) {
    const conversationId = uuidValue(conversation, "id");
    const messages = Array.isArray(conversation.messages)
      ? (conversation.messages as unknown[]).flatMap((message) => {
          if (!message || typeof message !== "object") return [];
          const row = message as TransferRow;
          return conversationId
            ? [{ ...pick(row, ["role", "content", "tool_name", "created_at"]), conversation_id: conversationId }]
            : [];
        })
      : [];
    await upsertRows(service, "assistant_messages", messages);
  }
  result.personalData += conversations.length;

  const codeConversationIds = new Map<string, string>();
  const codeConversations = document.code_agent_conversations.flatMap((source) => {
    const id = uuidValue(source, "id");
    const projectId = mapId(source.project_id, projects.projectIds);
    if (!id || !projectId) return [];
    codeConversationIds.set(id, id);
    return [{
      id,
      project_id: projectId,
      owner_id: userId,
      title: source.title ?? null,
      visibility: source.visibility ?? "private",
      archived_at: source.archived_at ?? null,
      created_at: source.created_at,
      updated_at: source.updated_at,
    }];
  });
  await upsertRows(service, "agent_conversations", codeConversations);
  const codeTurnIds = new Map<string, string>();
  const codeTurns = document.code_agent_conversations.flatMap((conversation) => {
    const conversationId = uuidValue(conversation, "id");
    if (!conversationId || !codeConversationIds.has(conversationId)) return [];
    return Array.isArray(conversation.turns)
      ? (conversation.turns as unknown[]).flatMap((turn) => {
          if (!turn || typeof turn !== "object") return [];
          const row = turn as TransferRow;
          const id = uuidValue(row, "id");
          if (!id) return [];
          codeTurnIds.set(id, id);
          return [{ ...pick(row, ["id", "status", "model", "reasoning_level", "cost_usd", "outcome", "error_message", "started_at", "completed_at", "created_at"]), id, conversation_id: conversationId }];
        })
      : [];
  });
  await upsertRows(service, "agent_turns", codeTurns);
  const codeMessages = document.code_agent_conversations.flatMap((conversation) => {
    const conversationId = uuidValue(conversation, "id");
    if (!conversationId || !codeConversationIds.has(conversationId)) return [];
    return Array.isArray(conversation.messages)
      ? (conversation.messages as unknown[]).flatMap((message) => {
          if (!message || typeof message !== "object") return [];
          const row = message as TransferRow;
          return [{ ...pick(row, ["role", "content", "source", "created_at"]), conversation_id: conversationId, turn_id: mapId(row.turn_id, codeTurnIds), created_by: remapUser(row.created_by, sourceUserId, userId) }];
        })
      : [];
  });
  await upsertRows(service, "agent_messages", codeMessages);
  const codeContexts = document.code_agent_conversations.flatMap((conversation) => {
    const conversationId = uuidValue(conversation, "id");
    if (!conversationId || !codeConversationIds.has(conversationId)) return [];
    return Array.isArray(conversation.contexts)
      ? (conversation.contexts as unknown[]).flatMap((context) => {
          if (!context || typeof context !== "object") return [];
          const row = context as TransferRow;
          const resourceId = row.kind === "issue"
            ? mapId(row.resource_id, issueIds)
            : row.kind === "page"
              ? mapId(row.resource_id, pageIds)
              : null;
          return resourceId
            ? [{ ...pick(row, ["kind", "role", "snapshot", "created_at"]), conversation_id: conversationId, resource_id: resourceId }]
            : [];
        })
      : [];
  });
  await upsertRows(service, "agent_conversation_contexts", codeContexts, "conversation_id,kind,resource_id");
  result.personalData += codeConversations.length;

  const notifications = document.notifications.flatMap((source) => {
    const id = uuidValue(source, "id");
    const projectId = mapId(source.project_id, projects.projectIds);
    if (!id || (source.project_id !== undefined && !projectId)) return [];
    return [{
      ...pick(source, ["id", "type", "read_at", "created_at"]),
      id,
      user_id: userId,
      project_id: projectId,
      issue_id: mapId(source.issue_id, issueIds),
      comment_id: mapId(source.comment_id, new Map()),
      agent_conversation_id: mapId(source.agent_conversation_id, codeConversationIds),
    }];
  });
  await upsertRows(service, "notifications", notifications);
  await upsertRows(
    service,
    "stat_events",
    document.statistics.flatMap((source) => [{
      ...pick(source, ["kind", "occurred_at", "project_name", "issue_number", "issue_title", "task_text"]),
      user_id: userId,
      project_id: mapId(source.project_id, projects.projectIds),
      issue_id: mapId(source.issue_id, issueIds),
    }]),
  );
  await upsertRows(
    service,
    "ai_usage",
    document.ai_usage.flatMap((source) => [{
      ...pick(source, ["feature", "model", "total_tokens", "created_at"]),
      user_id: userId,
    }]),
  );
  result.personalData += notifications.length + document.statistics.length + document.ai_usage.length;

  for (const membership of document.memberships) {
    const projectId = mapId(membership.project_id, projects.projectIds);
    if (!projectId) {
      result.skippedMemberships += 1;
      continue;
    }
    const { error } = await service.from("project_members").upsert(
      { project_id: projectId, user_id: userId, role: membership.role ?? "member", created_at: membership.created_at },
      { onConflict: "project_id,user_id" },
    );
    if (error) throw new Error(`project_members: ${error.message}`);
    result.membershipsRestored += 1;
  }

  if (sourceUserId && document.account.user_metadata && typeof document.account.user_metadata === "object") {
    const { data: current } = await service.auth.admin.getUserById(userId);
    const currentMetadata = current?.user?.user_metadata ?? {};
    await service.auth.admin.updateUserById(userId, {
      user_metadata: { ...currentMetadata, ...document.account.user_metadata },
    });
    result.personalData += 1;
  }

  return result;
}
