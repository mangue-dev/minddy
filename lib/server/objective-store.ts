import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore, SupabaseKeyRegistry } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";

type Row = Record<string, unknown>;
// Supabase's untyped query result is intentionally retained at this adapter edge.
// Callers use different projections; the repository validates protected content.
type ProjectedRow = any;
type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;
type Result<T> = { data: T | null; error: { code: string; message: string } | null; count?: number | null };

function validate(row: Row): void {
  if (typeof row.name !== "string" || !row.name.trim() ||
      row.description !== null && typeof row.description !== "string") {
    throw new Error("Invalid objective content");
  }
}

/** The caller must first authorize the project or use the user's RLS client. */
export async function decodeObjective(row: Row, actorId: string | null = null): Promise<Row> {
  const { encryption_version, encrypted_content, encryption_revision: _revision,
    encryption_checked_at: _checked, ...plain } = row;
  if (encryption_version === undefined && encrypted_content === undefined ||
      encryption_version === 0 && encrypted_content === null) {
    validate(plain);
    return plain;
  }
  if (typeof row.project_id !== "string" || !row.project_id) throw new Error("Missing objective owner");
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table: "objectives", scope: { kind: "project", id: row.project_id } },
    { actorId, reason: "repository_read" });
  delete decoded.encryption_revision;
  delete decoded.encryption_checked_at;
  validate(decoded);
  return decoded;
}

/** Encode complete content before a guarded insert, edit, or account transfer. */
export async function encodeObjective(row: Row, previousVersion = 0): Promise<Row> {
  validate(row);
  if (typeof row.project_id !== "string" || !row.project_id) throw new Error("Missing objective owner");
  if (!isContentEncryptionEnabled() && previousVersion === 0 && !process.env.MINDDY_DATA_ROOT_KEY) return row;
  const scope = { kind: "project" as const, id: row.project_id };
  if (!isContentEncryptionEnabled() && previousVersion === 0 &&
      !await new SupabaseKeyRegistry("content").loadCurrent(scope)) return row;
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, id: row.id ?? randomUUID(), encryption_version: 0, encrypted_content: null,
  }, { table: "objectives", scope });
}

const protectedFields = new Set(["*", "name", "description"]);
const storageFields = new Set(["encrypted_content", "encryption_version", "encryption_revision", "encryption_checked_at"]);
function fields(selection: string): string[] {
  return selection.replace(/\s/g, "").split(/,(?![^()]*\))/);
}
function safeError(error?: { code?: string; message?: string }): { code: string; message: string } {
  return { code: error?.code ?? "OBJECTIVE_STORAGE", message: "Unable to access objective content" };
}

/** Preserve all caller filters and RLS while decoding protected projections. */
class ObjectiveQuery implements PromiseLike<Result<ProjectedRow[]>> {
  private selection = "*";
  private options?: { count?: "exact"; head?: boolean };
  private filters: Array<{ kind: "eq" | "in" | "is" | "neq"; column: string; value: unknown }> = [];
  private ordering?: { column: string; ascending: boolean };
  private maximum?: number;
  private interval?: [number, number];

  constructor(private readonly client: SupabaseClient, private readonly actorId: string | null) {}
  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    if (fields(columns).some((field) => [...storageFields].some((column) =>
      new RegExp(`\\b${column}\\b`).test(field)))) {
      throw new Error("Objective storage metadata is private to the repository");
    }
    if (fields(columns).some((field) => /:(?:name|description)\b/.test(field))) {
      throw new Error("Objective content aliases are not supported");
    }
    this.selection = columns; this.options = options; return this;
  }
  private filter(kind: "eq" | "in" | "is" | "neq", column: string, value: unknown) {
    if (column === "name" || column === "description" || storageFields.has(column)) {
      throw new Error("Objective content filters require authorized application search");
    }
    this.filters.push({ kind, column, value }); return this;
  }
  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  neq(column: string, value: unknown) { return this.filter("neq", column, value); }
  in(column: string, value: unknown[]) { return this.filter("in", column, value); }
  is(column: string, value: null | boolean) { return this.filter("is", column, value); }
  order(column: string, options?: { ascending?: boolean }) {
    if (column === "name" || column === "description" || storageFields.has(column)) {
      throw new Error("Objective content ordering requires authorized application sort");
    }
    this.ordering = { column, ascending: options?.ascending !== false }; return this;
  }
  limit(count: number) { this.maximum = count; return this; }
  range(from: number, to: number) { this.interval = [from, to]; return this; }

  private query(): Query {
    const requested = fields(this.selection);
    const protectedRead = requested.some((field) => protectedFields.has(field));
    const joins = requested.filter((field) => field.includes("(") && field.includes("!"));
    let query = this.client.from("objectives").select(
      protectedRead ? ["*", ...joins].join(",") : this.selection, this.options,
    ) as Query;
    for (const filter of this.filters) {
      if (filter.kind === "in") query = query.in(filter.column, filter.value as unknown[]);
      else if (filter.kind === "is") query = query.is(filter.column, filter.value as null | boolean);
      else query = query[filter.kind](filter.column, filter.value);
    }
    if (this.ordering) query = query.order(this.ordering.column, { ascending: this.ordering.ascending });
    if (this.maximum !== undefined) query = query.limit(this.maximum);
    if (this.interval) query = query.range(...this.interval);
    return query;
  }

  private async project(row: Row): Promise<ProjectedRow> {
    const requested = fields(this.selection);
    const plain = requested.some((field) => protectedFields.has(field))
      ? await decodeObjective(row, this.actorId) : row;
    if (requested.includes("*")) return plain;
    return Object.fromEntries(requested.map((field) => [field.split(/[!(]/)[0], plain[field.split(/[!(]/)[0]]]));
  }
  async execute(terminal?: "single" | "maybeSingle"): Promise<Result<ProjectedRow[]>> {
    try {
      const { data, error, count } = terminal ? await this.query()[terminal]() : await this.query();
      if (error) return { data: null, error: safeError(error), count };
      const rows = data === null ? null : Array.isArray(data) ? data : [data];
      return { data: rows ? await Promise.all(rows.map((row) => this.project(row as Row))) : null, error: null, count };
    } catch {
      throw new Error("Unable to access objective content");
    }
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

export function objectiveStore(client: SupabaseClient, actorId: string | null = null) {
  return new ObjectiveQuery(client, actorId);
}
