import "server-only";
import { encodeGithubCommentUrl, shouldEncryptGithubCommentUrl } from
  "@/lib/server/git/comment-sync-url-content";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore, SupabaseKeyRegistry } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";

export type CommentTable = "comments" | "page_comments";
type Row = Record<string, unknown>;
export type CommentRecord = Row & {
  id: string; body: string; quote: string | null; author_id: string | null;
  issue_id: string | null; objective_id: string | null; feedback_post_id: string | null;
  page_id: string; project_id: string; parent_id: string | null; block_id: string | null;
  created_at: string; updated_at: string; via_assistant: boolean; via_mcp: boolean;
  api_key_id: string | null; feedback_user_id: string | null; visibility: string;
  assistant_status: string | null; assistant_tool: string | null;
  attachments?: Row[];
};
type Result<T> = { data: T | null; error: { code: string; message: string } | null; count?: number | null };
type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;
const metadata = new Set(["id", "author_id", "issue_id", "objective_id", "feedback_post_id", "page_id", "project_id",
  "parent_id", "block_id", "created_at", "updated_at", "via_assistant", "via_mcp", "api_key_id", "feedback_user_id",
  "visibility", "assistant_status", "assistant_tool"]);
const joins = new Set(["attachments(*)", "feedback_users!feedback_user_id(pseudonym)",
  "feedback_users!feedback_user_id(name,email,pseudonym)", "feedback_users!feedback_user_id(id,name,email,pseudonym)"]);
const legacyWrites = () => !isContentEncryptionEnabled() && !process.env.MINDDY_DATA_ROOT_KEY;

function fields(selection: string): string[] {
  const parts = selection.replace(/\s/g, "").split(/,(?![^()]*\))/);
  if (parts.some((part) => part !== "*" && part !== "body" && part !== "quote" && !metadata.has(part) && !joins.has(part))) {
    throw new Error("Unsupported comment projection");
  }
  return parts;
}
function validate(table: CommentTable, row: Row) {
  if (typeof row.body !== "string" || table === "page_comments" && row.quote !== null && typeof row.quote !== "string") {
    throw new Error("Invalid comment content");
  }
}
export async function decodeComment(table: CommentTable, row: Row, actorId: string | null = null): Promise<Row> {
  const { encryption_version, encrypted_content, encryption_revision: _revision, encryption_checked_at: _checked, ...plain } = row;
  if (encryption_version === undefined && encrypted_content === undefined || encryption_version === 0 && encrypted_content === null) {
    validate(table, plain);
    return plain;
  }
  if (typeof row.project_id !== "string") throw new Error("Missing comment owner");
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table, scope: { kind: "project", id: row.project_id } }, { actorId, reason: "repository_read" });
  delete decoded.encryption_revision;
  delete decoded.encryption_checked_at;
  validate(table, decoded);
  return decoded;
}

/** Resolve scope from a real parent, using the same authorization client as the write. */
export async function encodeComment(service: SupabaseClient, table: CommentTable, row: Row, previousVersion = 0): Promise<Row> {
  validate(table, row);
  if (legacyWrites() && previousVersion === 0) return row;
  const parents = table === "comments"
    ? { issue_id: "issues", objective_id: "objectives", feedback_post_id: "feedback_posts" }
    : { page_id: "pages" };
  const owners = Object.entries(parents).filter(([column]) => row[column] != null);
  if (owners.length !== 1) throw new Error("Invalid comment parent");
  const [column, parentTable] = owners[0];
  const { data, error } = await service.from(parentTable).select("project_id").eq("id", row[column]).maybeSingle();
  if (error || typeof data?.project_id !== "string" || row.project_id !== undefined && row.project_id !== data.project_id) {
    throw new Error("Invalid comment owner");
  }
  const scope = { kind: "project" as const, id: data.project_id as string };
  if (!isContentEncryptionEnabled() && previousVersion === 0 && !await new SupabaseKeyRegistry("content").loadCurrent(scope)) return row;
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, id: row.id ?? randomUUID(), project_id: scope.id, encryption_version: 0, encrypted_content: null,
  }, { table, scope });
}

/**
 * A deliberately small comment repository query vocabulary. Filters/order may
 * reference metadata only; protected projections are decoded before returning.
 * The original RLS client and every caller's scope/visibility predicate are kept.
 */
class CommentQuery implements PromiseLike<Result<CommentRecord[]>> {
  private selection: string | undefined;
  private selectOptions: { count?: "exact"; head?: boolean } | undefined;
  private mode: "read" | "insert" | "update" | "delete" = "read";
  private payload: Row = {};
  private filters: Array<{ op: "eq" | "neq" | "in" | "is"; column: string; value: unknown }> = [];
  private disjunction?: string;
  private ordering?: { column: string; ascending: boolean };
  private maximum?: number;

  constructor(private readonly client: SupabaseClient, private readonly table: CommentTable,
    private readonly actorId: string | null) {}
  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    fields(columns);
    this.selection = columns; this.selectOptions = options; return this;
  }
  insert(row: Row) { this.mode = "insert"; this.payload = row; return this; }
  update(row: Row) {
    if (Object.keys(row).some((key) => !["body", "assistant_status", "assistant_tool", "updated_at"].includes(key))) {
      throw new Error("Unsupported comment update");
    }
    this.mode = "update"; this.payload = row; return this;
  }
  delete() { this.mode = "delete"; return this; }
  private filter(op: "eq" | "neq" | "in" | "is", column: string, value: unknown) {
    if (!metadata.has(column)) throw new Error("Comment filters require metadata");
    this.filters.push({ op, column, value }); return this;
  }
  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  neq(column: string, value: unknown) { return this.filter("neq", column, value); }
  in(column: string, value: readonly unknown[]) { return this.filter("in", column, value); }
  is(column: string, value: null | boolean) { return this.filter("is", column, value); }
  or(expression: string) {
    if (!/^(id|parent_id)\.eq\.[\w-]+,(id|parent_id)\.eq\.[\w-]+$/.test(expression)) throw new Error("Unsupported comment thread filter");
    this.disjunction = expression; return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    if (!metadata.has(column)) throw new Error("Comment ordering requires metadata");
    this.ordering = { column, ascending: options?.ascending !== false }; return this;
  }
  limit(count: number) {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid comment limit");
    this.maximum = count; return this;
  }
  private scope(query: Query): Query {
    for (const filter of this.filters) {
      if (filter.op === "in") query = query.in(filter.column, filter.value as unknown[]);
      else if (filter.op === "is") query = query.is(filter.column, filter.value as null | boolean);
      else query = query[filter.op](filter.column, filter.value);
    }
    if (this.disjunction) query = query.or(this.disjunction);
    return query;
  }
  async execute(terminal?: "single" | "maybeSingle"): Promise<Result<CommentRecord[]>> {
    try {
      const requested = fields(this.selection ?? "*");
      const protectedRead = requested.some((column) => ["*", "body", "quote"].includes(column));
      const columns = protectedRead ? ["*", ...requested.filter((column) => joins.has(column))].join(",") : this.selection!;
      let query: Query;
      if (this.mode === "insert") {
        query = this.client.from(this.table).insert(await encodeComment(this.client, this.table, this.payload)) as unknown as Query;
      } else if (this.mode === "update" && Object.hasOwn(this.payload, "body") && !legacyWrites()) {
        // A body edit must merge the page quote and retain the existing scope, under CAS.
        if (!this.filters.some((f) => f.column === "id" && f.op === "eq")) throw new Error("Comment update requires identity");
        const { data: stored, error } = await this.scope(this.client.from(this.table).select("*")).maybeSingle();
        if (error) return { data: null, error: safeError(error) };
        if (!stored) return { data: [], error: null };
        const before = stored as Row;
        const decoded = await decodeComment(this.table, before, this.actorId);
        const encoded = await encodeComment(this.client, this.table, { ...decoded, ...this.payload }, Number(before.encryption_version ?? 0));
        const patch = { ...this.payload, body: encoded.body,
          ...(encoded.encrypted_content ? { encrypted_content: encoded.encrypted_content, encryption_version: encoded.encryption_version,
            ...(this.table === "page_comments" ? { quote: null } : {}) } : {}) };
        query = this.scope(this.client.from(this.table).update(patch) as unknown as Query);
        if (before.encryption_revision !== undefined) query = query.eq("encryption_revision", before.encryption_revision);
        // Always request the revision-guarded result, even for a background writer.
        const { data, error: writeError } = await query.select(columns);
        if (writeError) return { data: null, error: safeError(writeError) };
        if (!data?.length) return { data: null, error: { code: "40001", message: "Comment changed during update" } };
        return this.result(data as unknown as Row[], requested, protectedRead);
      } else if (this.mode === "update") query = this.client.from(this.table).update(this.payload) as unknown as Query;
      else if (this.mode === "delete") query = this.client.from(this.table).delete() as unknown as Query;
      else query = this.client.from(this.table).select(columns, this.selectOptions);
      if (this.mode !== "read" && this.selection !== undefined) query = query.select(columns);
      query = this.scope(query);
      if (this.ordering) query = query.order(this.ordering.column, { ascending: this.ordering.ascending });
      if (this.maximum !== undefined) query = query.limit(this.maximum);
      const { data: raw, error, count } = terminal ? await query[terminal]() : await query;
      const data = raw && !Array.isArray(raw) ? [raw] : raw;
      if (error) return { data: null, error: safeError(error), count };
      return { ...await this.result(data as unknown as Row[] | null, requested, protectedRead), count };
    } catch { return { data: null, error: { code: "COMMENT_STORAGE", message: "Unable to access comment content" } }; }
  }
  private async result(rows: Row[] | null, requested: string[], protectedRead: boolean): Promise<Result<CommentRecord[]>> {
    if (!rows) return { data: null, error: null };
    const data: CommentRecord[] = [];
    for (const row of rows) {
      const plain = protectedRead ? await decodeComment(this.table, row, this.actorId) : row;
      const projected = requested.includes("*") ? plain : Object.fromEntries(requested.map((column) => {
        const key = column.split(/[!(]/)[0]; return [key, plain[key]];
      }));
      data.push(projected as CommentRecord);
    }
    return { data, error: null };
  }
  async maybeSingle(): Promise<Result<CommentRecord>> {
    const result = await this.execute("maybeSingle");
    if (result.error) return { ...result, data: null };
    if ((result.data?.length ?? 0) > 1) return { data: null, error: { code: "PGRST116", message: "Expected one comment" } };
    return { ...result, data: result.data?.[0] ?? null };
  }
  async single(): Promise<{ data: CommentRecord; error: null } | { data: null; error: { code: string; message: string } }> {
    const result = await this.execute("single");
    if (result.error) return { data: null, error: result.error };
    if (result.data?.length !== 1) return { data: null, error: { code: "PGRST116", message: "Expected one comment" } };
    return { data: result.data[0], error: null };
  }
  then<T = Result<CommentRecord[]>, U = never>(fulfilled?: ((value: Result<CommentRecord[]>) => T | PromiseLike<T>) | null,
    rejected?: ((reason: unknown) => U | PromiseLike<U>) | null): Promise<T | U> {
    return this.execute().then(fulfilled, rejected);
  }
}
function safeError(error: { code?: string; message?: string }) {
  return { code: error.code ?? "COMMENT_STORAGE", message: error.code === "P0001" && error.message?.includes("page_not_live")
    ? "page_not_live" : "Comment storage failed" };
}
export function commentStore(client: SupabaseClient, table: CommentTable = "comments", actorId: string | null = null) {
  if (table !== "comments" && table !== "page_comments") throw new Error("Unsupported comment table");
  return new CommentQuery(client, table, actorId);
}

/** Account import cannot upsert raw bodies around the encrypted boundary. */
export async function importComment(client: SupabaseClient, row: Row): Promise<void> {
  const { data: existing, error } = await client.from("comments").select("*").eq("id", row.id).maybeSingle();
  if (error) throw new Error("Unable to inspect imported comment");
  if (existing && (existing.author_id !== row.author_id || existing.issue_id !== row.issue_id)) {
    throw new Error("Imported comment ownership conflict");
  }
  const encoded = await encodeComment(client, "comments", row, Number(existing?.encryption_version ?? 0));
  let write = existing
    ? client.from("comments").update(encoded).eq("id", row.id).eq("author_id", row.author_id).eq("issue_id", row.issue_id)
    : client.from("comments").insert(encoded);
  if (existing?.encryption_revision !== undefined) write = write.eq("encryption_revision", existing.encryption_revision);
  const { data, error: writeError } = await write.select("id");
  if (writeError || data?.length !== 1) throw new Error("Unable to import comment");
}

/** Keep the forge sidecar and content atomic, including simultaneous first delivery. */
export async function syncGithubComment(client: SupabaseClient, parameters: {
  p_issue_id: string; p_remote_comment_id: string; p_author_id: string | null;
  p_body: string; p_author_login: string | null; p_author_association: string | null;
  p_html_url: string | null; p_created_at_remote: string | null;
  p_updated_at_remote: string | null; p_deleted_at_remote: string | null;
}): Promise<void> {
  if (legacyWrites()) {
    const { error } = await client.rpc("sync_github_issue_comment_atomic", parameters);
    if (error) throw new Error("Unable to synchronize comment");
    return;
  }
  const { data: issueScope, error: issueScopeError } = await client.from("issues")
    .select("project_id").eq("id", parameters.p_issue_id).maybeSingle();
  if (issueScopeError || !issueScope?.project_id) {
    throw new Error("Unable to resolve GitHub comment URL scope");
  }
  const encryptUrl = await shouldEncryptGithubCommentUrl(client, issueScope.project_id);
  const storedUrl = encryptUrl
    ? await encodeGithubCommentUrl(issueScope.project_id, parameters.p_issue_id,
        parameters.p_remote_comment_id, parameters.p_html_url)
    : { html_url: parameters.p_html_url, html_url_encryption_version: 0 };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: sidecar, error } = await client.from("github_issue_comment_syncs").select("comment_id")
      .eq("issue_id", parameters.p_issue_id).eq("remote_comment_id", parameters.p_remote_comment_id).maybeSingle();
    if (error) throw new Error("Unable to inspect synchronized comment");
    const id = sidecar?.comment_id ?? randomUUID();
    const encoded = await encodeComment(client, "comments", {
      id, issue_id: parameters.p_issue_id, author_id: parameters.p_author_id, body: parameters.p_body,
    });
    const values = {
      ...parameters, p_comment_id: id, p_body: encoded.body,
      p_encryption_version: encoded.encryption_version ?? 0, p_encrypted_content: encoded.encrypted_content ?? null,
      p_html_url: storedUrl.html_url,
    };
    const { data, error: writeError } = encryptUrl
      ? await client.rpc("sync_github_issue_comment_encrypted_url", {
          ...values, p_url_encryption_version: storedUrl.html_url_encryption_version,
        })
      : await client.rpc("sync_github_issue_comment_atomic", values);
    if (writeError) throw new Error("Unable to synchronize comment");
    if (data?.state === "synced" || data?.state === "stale") return;
    if (data?.state !== "conflict") throw new Error("Invalid comment synchronization result");
  }
  throw new Error("Comment synchronization conflict; retry delivery");
}
