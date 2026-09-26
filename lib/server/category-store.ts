import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore, SupabaseKeyRegistry } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";

type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error: { code: string; message: string } | null; count?: number | null };
const privateFields = new Set(["encrypted_content", "encryption_version", "encryption_revision", "encryption_checked_at"]);

function validate(row: Row) {
  if (typeof row.name !== "string" || !row.name.trim() || typeof row.project_id !== "string") {
    throw new Error("Invalid category content");
  }
}

/** Call only after RLS or an explicit project authorization has scoped the row. */
export async function decodeCategory(row: Row, actorId: string | null = null): Promise<Row> {
  const { encryption_version, encrypted_content, encryption_revision: _revision,
    encryption_checked_at: _checked, ...plain } = row;
  if (encryption_version === undefined && encrypted_content === undefined ||
      encryption_version === 0 && encrypted_content === null) {
    validate(plain);
    return plain;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table: "categories", scope: { kind: "project", id: row.project_id as string } },
    { actorId, reason: "repository_read" });
  delete decoded.encryption_revision;
  delete decoded.encryption_checked_at;
  validate(decoded);
  return decoded;
}

/** Complete category rows receive an ID before encryption for authenticated AAD. */
export async function encodeCategory(row: Row, previousVersion = 0): Promise<Row> {
  validate(row);
  const scope = { kind: "project" as const, id: row.project_id as string };
  const complete = { ...row, id: row.id ?? randomUUID() };
  if (!isContentEncryptionEnabled() && previousVersion === 0) {
    try {
      if (!await new SupabaseKeyRegistry("content").loadCurrent(scope)) return complete;
    } catch (error) {
      // A preview may still use the pre-registry schema while writes are off.
      if (error instanceof Error && /^Unable to load current data key: (42P01|PGRST205)$/.test(error.message)) {
        return complete;
      }
      throw error;
    }
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...complete, encryption_version: 0, encrypted_content: null,
  }, { table: "categories", scope });
}

type Filter = { kind: "eq" | "in" | "is"; column: string; value: unknown };

/** A small RLS-preserving query adapter for category content projections. */
class CategoryQuery implements PromiseLike<Result<Row[]>> {
  private selection = "*";
  private options?: { count?: "exact"; head?: boolean };
  private filters: Filter[] = [];
  private ordering?: { column: string; ascending: boolean };

  constructor(private readonly client: SupabaseClient, private readonly actorId: string | null) {}
  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    const fields = columns.replace(/\s/g, "").split(",");
    if (fields.some((field) => privateFields.has(field) || field.includes(":"))) {
      throw new Error("Category storage metadata is private to the repository");
    }
    this.selection = columns;
    this.options = options;
    return this;
  }
  private filter(kind: Filter["kind"], column: string, value: unknown) {
    if (privateFields.has(column)) throw new Error("Category storage metadata is private to the repository");
    this.filters.push({ kind, column, value });
    return this;
  }
  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  in(column: string, values: unknown[]) { return this.filter("in", column, values); }
  is(column: string, value: null | boolean) { return this.filter("is", column, value); }
  order(column: string, options?: { ascending?: boolean }) {
    if (privateFields.has(column)) throw new Error("Category storage metadata is private to the repository");
    this.ordering = { column, ascending: options?.ascending !== false };
    return this;
  }
  async execute(): Promise<Result<Row[]>> {
    try {
      const fields = this.selection.replace(/\s/g, "").split(",");
      const content = fields.includes("*") || fields.includes("name") ||
        this.filters.some((filter) => filter.column === "name") || this.ordering?.column === "name";
      const postFilters = this.filters.filter((filter) => filter.column === "name");
      const build = () => {
        let query = this.client.from("categories").select(content ? "*" : this.selection,
          content ? { count: "exact" } : this.options);
        for (const filter of this.filters.filter((item) => item.column !== "name")) {
          if (filter.kind === "in") query = query.in(filter.column, filter.value as unknown[]);
          else if (filter.kind === "is") query = query.is(filter.column, filter.value as null | boolean);
          else query = query.eq(filter.column, filter.value);
        }
        if (this.ordering && this.ordering.column !== "name") {
          query = query.order(this.ordering.column, { ascending: this.ordering.ascending });
        }
        if (content) query = query.order("id", { ascending: true });
        return query;
      };
      const { data, error, count } = await build();
      if (error) return { data: null, error: { code: error.code ?? "CATEGORY_STORAGE", message: "Unable to access category content" }, count };
      if (this.options?.head && !content) return { data: null, error: null, count };
      const rawRows = [...(data ?? [])] as unknown as Row[];
      if (content && rawRows.length > 0 &&
          (typeof count === "number" && count > rawRows.length || rawRows.length === 1000)) {
        const pageSize = rawRows.length;
        for (let offset = pageSize; ; offset += pageSize) {
          const next = await build().range(offset, offset + pageSize - 1);
          if (next.error) return { data: null, error: { code: next.error.code ?? "CATEGORY_STORAGE",
            message: "Unable to access category content" } };
          const page = (next.data ?? []) as unknown as Row[];
          rawRows.push(...page);
          if (page.length < pageSize || typeof count === "number" && rawRows.length >= count) break;
        }
      }
      let rows: Row[] = content ? await Promise.all(rawRows.map((row) => decodeCategory(row, this.actorId))) : rawRows;
      for (const filter of postFilters) {
        rows = rows.filter((row) => filter.kind === "eq" ? row.name === filter.value :
          filter.kind === "in" ? (filter.value as unknown[]).includes(row.name) : row.name === filter.value);
      }
      if (this.ordering?.column === "name") {
        rows.sort((a, b) => String(a.name).localeCompare(String(b.name)) * (this.ordering!.ascending ? 1 : -1));
      }
      if (!fields.includes("*")) {
        rows = rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
      }
      return { data: this.options?.head ? null : rows, error: null,
        count: content && (this.options?.count || this.options?.head) ? rows.length : count };
    } catch {
      return { data: null, error: { code: "CATEGORY_STORAGE", message: "Unable to access category content" } };
    }
  }
  then<T = Result<Row[]>, U = never>(fulfilled?: ((value: Result<Row[]>) => T | PromiseLike<T>) | null,
    rejected?: ((reason: unknown) => U | PromiseLike<U>) | null): Promise<T | U> {
    return this.execute().then(fulfilled, rejected);
  }
}

export function categoryStore(client: SupabaseClient, actorId: string | null = null) {
  return new CategoryQuery(client, actorId);
}
