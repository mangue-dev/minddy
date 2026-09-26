import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";

type Row = Record<string, unknown>;
type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;
type Result<T> = { data: T | null; error: { code?: string; message: string } | null; count?: number | null };
type ProjectedRow = any;

export const issueContentColumns = [
  "title", "description", "plan", "remote_url", "automation_override",
] as const;

function complete(row: Row): Row {
  return {
    description: null,
    plan: null,
    remote_url: null,
    automation_override: null,
    ...row,
  };
}

function validate(row: Row): void {
  if (typeof row.title !== "string" || !row.title.trim() ||
      ["description", "plan", "remote_url"].some((field) =>
        row[field] !== null && typeof row[field] !== "string") ||
      row.automation_override !== null &&
      (typeof row.automation_override !== "object" || Array.isArray(row.automation_override))) {
    throw new Error("Invalid issue content");
  }
}

/** The caller must establish project access before decoding a service-role row. */
export async function decodeIssue(row: Row, actorId: string | null = null): Promise<Row> {
  const { encryption_version, encrypted_content, encryption_revision: _revision,
    encryption_checked_at: _checked, ...plain } = row;
  if (encryption_version === undefined && encrypted_content === undefined ||
      encryption_version === 0 && encrypted_content === null) {
    const result = complete(plain);
    validate(result);
    return result;
  }
  if (typeof row.project_id !== "string") throw new Error("Missing issue project");
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table: "issues", scope: { kind: "project", id: row.project_id } },
    { actorId, reason: "repository_read" });
  delete decoded.encryption_revision;
  delete decoded.encryption_checked_at;
  validate(decoded);
  return decoded;
}

/** Encode the complete source, including fields omitted by a create request. */
export async function encodeIssue(row: Row, previousVersion = 0): Promise<Row> {
  const logical = complete(row);
  validate(logical);
  if (typeof logical.project_id !== "string") throw new Error("Missing issue project");
  const optIn = isContentEncryptionEnabled() && process.env.MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED === "true";
  if (!optIn && previousVersion === 0 && !process.env.MINDDY_DATA_ROOT_KEY) return logical;
  const scope = { kind: "project" as const, id: logical.project_id };
  if (!optIn && previousVersion === 0) {
    const { data, error } = await getServiceClient().from("issue_encryption_scopes")
      .select("project_id").eq("project_id", scope.id).maybeSingle();
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      throw new Error("Unable to resolve issue encryption state");
    }
    if (!data) return logical;
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...logical, id: logical.id ?? randomUUID(), encryption_version: 0, encrypted_content: null,
  }, { table: "issues", scope });
}

/** Read a complete issue under the caller's existing RLS and metadata filters. */
export async function readIssue(
  client: SupabaseClient,
  id: string,
  projectId: string,
  actorId: string | null = null,
): Promise<{ data: Row | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await client.from("issues").select("*")
    .eq("id", id).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (error || !data) return { data: null, error };
  return { data: await decodeIssue(data as Row, actorId), error: null };
}

const protectedFields = new Set<string>(["*", ...issueContentColumns]);
const storageFields = new Set(["encrypted_content", "encryption_version", "encryption_revision", "encryption_checked_at"]);

function fields(selection: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < selection.length; i++) {
    if (selection[i] === "(") depth++;
    else if (selection[i] === ")") depth--;
    else if (selection[i] === "," && depth === 0) {
      result.push(selection.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(selection.slice(start).trim());
  return result;
}

/** Preserve RLS and metadata filtering while hydrating protected projections. */
class IssueQuery implements PromiseLike<Result<ProjectedRow[]>> {
  private selection = "*";
  private options?: { count?: "exact"; head?: boolean };
  private filters: Array<{ kind: "eq" | "neq" | "in" | "is" | "not" | "or" | "gte" | "lte" | "gt" | "lt"; column: string; value: unknown; operator?: string }> = [];
  private ordering: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }> = [];
  private maximum?: number;
  private interval?: [number, number];

  constructor(private readonly client: SupabaseClient, private readonly actorId: string | null) {}
  select(selection = "*", options?: { count?: "exact"; head?: boolean }) {
    if (fields(selection).some((field) => [...storageFields].some((column) =>
      new RegExp(`\\b${column}\\b`).test(field)) ||
      /:(?:title|description|plan|remote_url|automation_override)\b/.test(field))) {
      throw new Error("Issue storage metadata and content aliases are private");
    }
    this.selection = selection; this.options = options; return this;
  }
  private filter(kind: IssueQuery["filters"][number]["kind"], column: string, value: unknown, operator?: string) {
    if (protectedFields.has(column) || storageFields.has(column) ||
        kind === "or" && /(?:^|[,.(])(?:title|description|plan|remote_url|automation_override)\./.test(column)) {
      throw new Error("Issue content filters require authorized application search");
    }
    this.filters.push({ kind, column, value, operator }); return this;
  }
  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  neq(column: string, value: unknown) { return this.filter("neq", column, value); }
  in(column: string, value: unknown[]) { return this.filter("in", column, value); }
  is(column: string, value: null | boolean) { return this.filter("is", column, value); }
  not(column: string, operator: string, value: unknown) { return this.filter("not", column, value, operator); }
  or(expression: string) { return this.filter("or", expression, null); }
  gte(column: string, value: unknown) { return this.filter("gte", column, value); }
  lte(column: string, value: unknown) { return this.filter("lte", column, value); }
  gt(column: string, value: unknown) { return this.filter("gt", column, value); }
  lt(column: string, value: unknown) { return this.filter("lt", column, value); }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    if (protectedFields.has(column) || storageFields.has(column)) {
      throw new Error("Issue content ordering requires authorized application sort");
    }
    this.ordering.push({ column, ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst }); return this;
  }
  limit(count: number) { this.maximum = count; return this; }
  range(from: number, to: number) { this.interval = [from, to]; return this; }

  private query(): Query {
    const requested = fields(this.selection);
    const protectedRead = requested.some((field) => protectedFields.has(field));
    const joins = requested.filter((field) => field.includes("(") && field.includes(")"));
    let query = this.client.from("issues").select(
      protectedRead ? ["*", ...joins].join(",") : this.selection, this.options,
    ) as Query;
    for (const filter of this.filters) {
      if (filter.kind === "or") query = query.or(filter.column);
      else if (filter.kind === "in") query = query.in(filter.column, filter.value as unknown[]);
      else if (filter.kind === "is") query = query.is(filter.column, filter.value as null | boolean);
      else if (filter.kind === "not") query = query.not(filter.column, filter.operator ?? "is", filter.value);
      else if (filter.kind === "eq") query = query.eq(filter.column, filter.value);
      else if (filter.kind === "neq") query = query.neq(filter.column, filter.value);
      else if (filter.kind === "gte") query = query.gte(filter.column, filter.value);
      else if (filter.kind === "lte") query = query.lte(filter.column, filter.value);
      else if (filter.kind === "gt") query = query.gt(filter.column, filter.value);
      else if (filter.kind === "lt") query = query.lt(filter.column, filter.value);
    }
    for (const order of this.ordering) query = query.order(order.column,
      { ascending: order.ascending, nullsFirst: order.nullsFirst });
    if (this.maximum !== undefined) query = query.limit(this.maximum);
    if (this.interval) query = query.range(...this.interval);
    return query;
  }
  private async project(row: Row): Promise<ProjectedRow> {
    const requested = fields(this.selection);
    const plain = requested.some((field) => protectedFields.has(field))
      ? await decodeIssue(row, this.actorId) : row;
    if (requested.includes("*")) return plain;
    return Object.fromEntries(requested.map((field) => {
      const key = field.split(/[!(]/)[0].split(":")[0];
      return [key, plain[key]];
    }));
  }
  async execute(terminal?: "single" | "maybeSingle"): Promise<Result<ProjectedRow[]>> {
    const { data, error, count } = terminal ? await this.query()[terminal]() : await this.query();
    if (error) return { data: null, error: fields(this.selection).some((field) => protectedFields.has(field))
      ? { code: error.code, message: "Unable to access issue content" } : error, count };
    const rows = data === null ? null : Array.isArray(data) ? data : [data];
    return { data: rows ? await Promise.all(rows.map((row) => this.project(row as Row))) : null,
      error: null, count };
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

export function issueStore(client: SupabaseClient, actorId: string | null = null) {
  return new IssueQuery(client, actorId);
}

/** Resolve issue titles only within the caller's already authorized projects. */
export async function loadIssueTitles(
  client: SupabaseClient,
  issueIds: readonly string[],
  projectIds: readonly string[],
  actorId: string | null = null,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (issueIds.length === 0 || projectIds.length === 0) return titles;
  const ids = [...new Set(issueIds)];
  const projects = [...new Set(projectIds)];
  for (let offset = 0; offset < ids.length; offset += 200) {
    for (let projectOffset = 0; projectOffset < projects.length; projectOffset += 100) {
      const { data, error } = await issueStore(client, actorId).select("id, title")
        .in("id", ids.slice(offset, offset + 200))
        .in("project_id", projects.slice(projectOffset, projectOffset + 100))
        .is("deleted_at", null);
      if (error) throw new Error("Unable to load issue titles");
      for (const row of data ?? []) titles.set(row.id as string, row.title as string);
    }
  }
  return titles;
}

/** Internal checklist sync: compare the complete row before changing its plan. */
export async function saveIssuePlanSnapshot(
  client: SupabaseClient, issueId: string, projectId: string,
  expectedPlan: string, nextPlan: string,
): Promise<boolean> {
  const { data: stored, error } = await client.from("issues").select("*")
    .eq("id", issueId).eq("project_id", projectId)
    .is("deleted_at", null).maybeSingle();
  if (error || !stored) return false;
  const current = await decodeIssue(stored);
  if (current.plan !== expectedPlan) return false;
  const encoded = await encodeIssue({ ...current, plan: nextPlan },
    (stored.encryption_version as number | undefined) ?? 0);
  const updates: Row = Object.fromEntries(issueContentColumns.map((field) => [field, encoded[field]]));
  if (encoded.encryption_version !== undefined) {
    updates.encryption_version = encoded.encryption_version;
    updates.encrypted_content = encoded.encrypted_content;
  }
  let query = client.from("issues").update(updates)
    .eq("id", issueId).eq("project_id", projectId).is("deleted_at", null);
  if (stored.encryption_revision !== undefined) {
    query = query.eq("encryption_revision", stored.encryption_revision);
  } else {
    query = query.eq("plan", expectedPlan);
  }
  const { data, error: writeError } = await query.select("id").maybeSingle();
  if (writeError) throw new Error("Unable to save issue plan");
  return !!data;
}
