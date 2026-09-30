import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore, SupabaseKeyRegistry } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";

type Row = Record<string, unknown>;
type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;
type Result<T> = { data: T | null; error: { code: string; message: string } | null; count?: number | null };
// PostgREST projections vary by caller and are validated at this repository edge.
type ProjectedRow = any;

const contentColumns = [
  "title", "body", "submitted_title", "submitted_body", "translated_title",
  "translated_body", "moderation_reason", "embedding",
] as const;
const contentFields = new Set<string>(["*", ...contentColumns]);
const storageFields = new Set(["encrypted_content", "encryption_version", "encryption_revision", "encryption_checked_at"]);

function validate(row: Row) {
  for (const field of ["title", "body", "submitted_title", "submitted_body"]) {
    if (typeof row[field] !== "string") throw new Error("Invalid feedback post content");
  }
  for (const field of ["translated_title", "translated_body", "moderation_reason"]) {
    if (row[field] !== null && typeof row[field] !== "string") {
      throw new Error("Invalid feedback post content");
    }
  }
  if (row.embedding !== null && typeof row.embedding !== "string" && !Array.isArray(row.embedding)) {
    throw new Error("Invalid feedback post embedding");
  }
}

/** Authorization and visibility must be established before decrypting a service-role row. */
export async function decodeFeedbackPost(row: Row, actorId: string | null = null): Promise<Row> {
  const { encryption_version, encrypted_content, encryption_revision: _revision,
    encryption_checked_at: _checked, ...plain } = row;
  if (encryption_version === undefined && encrypted_content === undefined ||
      encryption_version === 0 && encrypted_content === null) {
    validate(plain);
    return plain;
  }
  if (typeof row.project_id !== "string") throw new Error("Missing feedback project");
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table: "feedback_posts", scope: { kind: "project", id: row.project_id } },
    { actorId, reason: "repository_read" });
  delete decoded.encryption_revision;
  delete decoded.encryption_checked_at;
  validate(decoded);
  return decoded;
}

/** Complete content is encoded together so partial updates never discard raw submissions. */
export async function encodeFeedbackPost(row: Row, previousVersion = 0): Promise<Row> {
  validate(row);
  if (typeof row.project_id !== "string") throw new Error("Missing feedback project");
  if (!isContentEncryptionEnabled() && previousVersion === 0 && !process.env.MINDDY_DATA_ROOT_KEY) return row;
  const scope = { kind: "project" as const, id: row.project_id };
  if (!isContentEncryptionEnabled() && previousVersion === 0 &&
      !await new SupabaseKeyRegistry("content").loadCurrent(scope)) return row;
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, id: row.id ?? randomUUID(), encryption_version: 0, encrypted_content: null,
  }, { table: "feedback_posts", scope });
}

function fields(selection: string): string[] {
  return selection.replace(/\s/g, "").split(/,(?![^()]*\))/);
}

/** Preserve database filtering and pagination before decoding the selected rows. */
class FeedbackPostQuery implements PromiseLike<Result<ProjectedRow[]>> {
  private selection = "*";
  private options?: { count?: "exact"; head?: boolean };
  private filters: Array<{ kind: "eq" | "in" | "is" | "neq" | "not"; column: string; value: unknown; operator?: string }> = [];
  private ordering: Array<{ column: string; ascending: boolean }> = [];
  private maximum?: number;
  private interval?: [number, number];

  constructor(private readonly client: SupabaseClient, private readonly actorId: string | null) {}
  select(selection = "*", options?: { count?: "exact"; head?: boolean }) {
    if (fields(selection).some((field) => storageFields.has(field) ||
      /:(?:title|body|submitted_title|submitted_body|translated_title|translated_body|moderation_reason|embedding)\b/.test(field))) {
      throw new Error("Feedback storage metadata and aliases are private");
    }
    this.selection = selection; this.options = options; return this;
  }
  private filter(kind: "eq" | "in" | "is" | "neq" | "not", column: string, value: unknown, operator?: string) {
    if (contentFields.has(column) || storageFields.has(column)) {
      throw new Error("Feedback content filtering requires authorized application search");
    }
    this.filters.push({ kind, column, value, operator }); return this;
  }
  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  neq(column: string, value: unknown) { return this.filter("neq", column, value); }
  in(column: string, value: unknown[]) { return this.filter("in", column, value); }
  is(column: string, value: null | boolean) { return this.filter("is", column, value); }
  not(column: string, operator: string, value: unknown) { return this.filter("not", column, value, operator); }
  order(column: string, options?: { ascending?: boolean }) {
    if (contentFields.has(column) || storageFields.has(column)) {
      throw new Error("Feedback content ordering requires authorized application sort");
    }
    this.ordering.push({ column, ascending: options?.ascending !== false }); return this;
  }
  limit(count: number) { this.maximum = count; return this; }
  range(from: number, to: number) { this.interval = [from, to]; return this; }

  private query(): Query {
    const requested = fields(this.selection);
    const protectedRead = requested.some((field) => contentFields.has(field));
    const joins = requested.filter((field) => field.includes("("));
    let query = this.client.from("feedback_posts").select(
      protectedRead ? ["*", ...joins].join(",") : this.selection, this.options,
    ) as Query;
    for (const filter of this.filters) {
      if (filter.kind === "in") query = query.in(filter.column, filter.value as unknown[]);
      else if (filter.kind === "is") query = query.is(filter.column, filter.value as null | boolean);
      else if (filter.kind === "not") query = query.not(filter.column, filter.operator ?? "is", filter.value);
      else query = query[filter.kind](filter.column, filter.value);
    }
    for (const order of this.ordering) query = query.order(order.column, { ascending: order.ascending });
    if (this.maximum !== undefined) query = query.limit(this.maximum);
    if (this.interval) query = query.range(...this.interval);
    return query;
  }
  private async project(row: Row): Promise<ProjectedRow> {
    const requested = fields(this.selection);
    const plain = requested.some((field) => contentFields.has(field))
      ? await decodeFeedbackPost(row, this.actorId) : row;
    if (requested.includes("*")) return plain;
    return Object.fromEntries(requested.map((field) => {
      const key = field.split(/[!(]/)[0].split(":")[0];
      return [key, plain[key]];
    }));
  }
  async execute(terminal?: "single" | "maybeSingle"): Promise<Result<ProjectedRow[]>> {
    const { data, error, count } = terminal ? await this.query()[terminal]() : await this.query();
    if (error) return { data: null, error: { code: error.code ?? "FEEDBACK_STORAGE", message: "Unable to access feedback content" }, count };
    const rows = data === null ? null : Array.isArray(data) ? data : [data];
    return { data: rows ? await Promise.all(rows.map((row) => this.project(row as Row))) : null, error: null, count };
  }
  async maybeSingle(): Promise<Result<ProjectedRow>> {
    const result = await this.execute("maybeSingle");
    return { ...result, data: result.data?.[0] ?? null };
  }
  async single(): Promise<Result<ProjectedRow>> {
    const result = await this.execute("single");
    return { ...result, data: result.data?.[0] ?? null };
  }
  then<T = Result<ProjectedRow[]>, U = never>(fulfilled?: ((value: Result<ProjectedRow[]>) => T | PromiseLike<T>) | null,
    rejected?: ((reason: unknown) => U | PromiseLike<U>) | null): Promise<T | U> {
    return this.execute().then(fulfilled, rejected);
  }
}

export function feedbackPostStore(client: SupabaseClient, actorId: string | null = null) {
  return new FeedbackPostQuery(client, actorId);
}

/** Merge protected and metadata fields under one revision check. */
export async function saveFeedbackPostContent(
  client: SupabaseClient,
  id: string,
  projectId: string,
  updates: Row,
): Promise<Result<Row>> {
  const directLegacyUpdate = () => client.from("feedback_posts").update(updates)
    .eq("id", id).eq("project_id", projectId).is("deleted_at", null)
    .select("*").maybeSingle();
  if (!isContentEncryptionEnabled() && !process.env.MINDDY_DATA_ROOT_KEY) {
    const { data, error } = await directLegacyUpdate();
    return { data: data as Row | null, error };
  }
  const { data: current, error: readError } = await client.from("feedback_posts")
    .select("*").eq("id", id).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (readError || !current) return { data: null, error: readError ?? { code: "P0002", message: "Feedback post not found" } };
  if (!isContentEncryptionEnabled() && (current.encryption_version === undefined ||
      current.encryption_version === 0 && !await new SupabaseKeyRegistry("content").loadCurrent(
        { kind: "project", id: projectId }))) {
    const { data, error } = await directLegacyUpdate();
    return { data: data as Row | null, error };
  }
  const plain = await decodeFeedbackPost(current);
  const encoded = await encodeFeedbackPost({ ...plain, ...updates }, current.encryption_version);
  const protectedUpdates = Object.fromEntries(contentColumns.map((field) => [field, encoded[field]]));
  const { data, error } = await client.rpc("save_feedback_post_content", {
    p_id: id, p_project_id: projectId, p_revision: current.encryption_revision,
    p_updates: { ...updates, ...protectedUpdates,
      encrypted_content: encoded.encrypted_content ?? null,
      encryption_version: encoded.encryption_version ?? 0 },
  });
  return { data: data ? await decodeFeedbackPost(data as Row) : null, error };
}
