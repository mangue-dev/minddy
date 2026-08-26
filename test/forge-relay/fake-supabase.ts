export type FakeRow = Record<string, unknown>;

import crypto from "node:crypto";

/**
 * Minimal in-memory Supabase query fake for the forge-relay tests. Supports
 * the chain shapes the relay code uses: select/eq/in/lt/gte/order,
 * insert/update/upsert/delete, single/maybeSingle, head-count, and primary-key
 * uniqueness (`nonce` for the replay ledger, `id` elsewhere) so a duplicate
 * insert surfaces as the 23505 replay verdict.
 */
export const fakeTables: Record<string, FakeRow[]> = {};

/** When set, the next insert/upsert fails with this error. */
export let fakeInsertError: { code: string; message: string } | null = null;

export function setFakeTable(name: string, rows: FakeRow[]): void {
  fakeTables[name] = rows;
}

export function setFakeInsertError(error: { code: string; message: string } | null): void {
  fakeInsertError = error;
}

/** Minimal RPC behavior used by relay tests with database-side arbitration. */
export async function fakeRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown }> {
  if (name === "claim_forge_oauth_refresh") {
    const table = args.p_kind === "connection" ? "git_connections" : "git_user_identities";
    const row = (fakeTables[table] ?? []).find((candidate) => candidate.id === args.p_row_id);
    if (!row || row.oauth_refresh_claim) return { data: false, error: null };
    if (row.token_expires_at !== args.p_expected_expires_at) {
      return { data: false, error: null };
    }
    if (row.refresh_token_encrypted !== args.p_expected_refresh_token_encrypted) {
      return { data: false, error: null };
    }
    row.oauth_refresh_claim = args.p_claim_id;
    row.oauth_refresh_claimed_at = new Date().toISOString();
    return { data: true, error: null };
  }
  if (name === "claim_forge_relay_refresh_lineage") {
    const row = (fakeTables.forge_relay_refresh_lineage ?? []).find(
      (candidate) =>
        candidate.instance_id === args.p_instance_id &&
        candidate.provider === args.p_provider &&
        candidate.refresh_token_hash === args.p_refresh_token_hash &&
        !candidate.refresh_claim_id,
    );
    if (!row) return { data: null, error: null };
    row.refresh_claim_id = args.p_claim_id;
    row.refresh_claimed_at = new Date().toISOString();
    return { data: row.id, error: null };
  }
  if (name !== "reserve_forge_relay_mint") {
    return { data: null, error: { message: `Unknown fake RPC: ${name}` } };
  }
  const instanceId = args.p_instance_id;
  const limit = args.p_limit;
  const active = (fakeTables.forge_relay_instances ?? []).some(
    (row) => row.id === instanceId && row.status === "active",
  );
  if (!active) return { data: "instance_inactive", error: null };
  if (typeof limit !== "number") {
    return { data: null, error: { message: "Invalid mint limit" } };
  }
  const windowStart = Date.now() - 60 * 60_000;
  const recent = (fakeTables.forge_relay_audit ?? []).filter(
    (row) =>
      row.instance_id === instanceId &&
      row.action === "mint_installation_token" &&
      Date.parse(String(row.created_at)) >= windowStart,
  ).length;
  if (recent >= limit) return { data: "quota_exceeded", error: null };
  (fakeTables.forge_relay_audit ??= []).push({
    id: crypto.randomUUID(),
    instance_id: instanceId,
    action: "mint_installation_token",
    detail: { state: "reserved" },
    created_at: new Date().toISOString(),
  });
  return { data: "reserved", error: null };
}

export class FakeQuery {
  private filters: ((row: FakeRow) => boolean)[] = [];
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private values: FakeRow | FakeRow[] | null = null;
  private updateValues: FakeRow | null = null;
  private conflictColumns: string[] = [];
  private wantSingle = false;
  private wantMaybeSingle = false;
  private head = false;
  private orderColumn: string | null = null;
  private orderAscending = false;
  private limitCount: number | null = null;

  constructor(private name: string) {}

  select(_columns?: string, opts?: { count?: string; head?: boolean }): this {
    if (opts?.head) this.head = true;
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  lt(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) < String(value));
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) >= String(value));
    return this;
  }
  lte(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) <= String(value));
    return this;
  }
  limit(count: number): this {
    this.limitCount = count;
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderColumn = column;
    this.orderAscending = opts?.ascending ?? false;
    return this;
  }
  insert(values: FakeRow | FakeRow[]): this {
    this.mode = "insert";
    this.values = values;
    return this;
  }
  upsert(values: FakeRow | FakeRow[], opts?: { onConflict?: string }): this {
    this.mode = "upsert";
    this.values = values;
    this.conflictColumns = (opts?.onConflict ?? "").split(",").filter(Boolean);
    return this;
  }
  update(values: FakeRow): this {
    this.mode = "update";
    this.updateValues = values;
    return this;
  }
  delete(): this {
    this.mode = "delete";
    return this;
  }
  single(): this {
    this.wantSingle = true;
    return this;
  }
  maybeSingle(): this {
    this.wantMaybeSingle = true;
    return this;
  }

  private rows(): FakeRow[] {
    return (fakeTables[this.name] ??= []);
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every((f) => f(row));
  }

  private upsertRows(input: FakeRow | FakeRow[]): void {
    for (const value of Array.isArray(input) ? input : [input]) {
      const existing = this.rows().find((row) =>
        this.conflictColumns.every((col) => row[col] === value[col]),
      );
      if (existing) Object.assign(existing, value);
      else this.rows().push({ ...value });
    }
  }

  then(
    resolve: (result: { data: unknown; error: unknown; count?: number }) => unknown,
    reject: (reason: unknown) => unknown,
  ): unknown {
    try {
      if ((this.mode === "insert" || this.mode === "upsert") && fakeInsertError) {
        return resolve({ data: null, error: fakeInsertError });
      }
      if (this.mode === "insert") {
        const input = Array.isArray(this.values) ? this.values : [this.values as FakeRow];
        for (const value of input) {
          const key = value.nonce ?? value.id;
          if (key !== undefined && this.rows().some((row) => (row.nonce ?? row.id) === key)) {
            return resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          }
        }
        // Emulate uuid PK defaults (`gen_random_uuid()`).
        for (const value of input) {
          if (value.id === undefined) value.id = crypto.randomUUID();
        }
      }
      let result: FakeRow[] = [];
      if (this.mode === "insert" || this.mode === "upsert") {
        const input = Array.isArray(this.values) ? this.values : [this.values as FakeRow];
        if (this.mode === "upsert") this.upsertRows(input);
        else for (const value of input) this.rows().push({ ...value });
        result = input.map((value) => ({ ...value }));
      } else if (this.mode === "update") {
        // Real Supabase returns the UPDATED rows that matched the filters
        // before they were applied.
        const matched = this.rows().filter((row) => this.matches(row));
        for (const row of matched) Object.assign(row, this.updateValues);
        result = matched.map((row) => ({ ...row }));
      } else if (this.mode === "delete") {
        const table = this.rows();
        fakeTables[this.name] = table.filter((row) => !this.matches(row));
        result = table.filter((row) => this.matches(row));
      } else {
        result = this.rows().filter((row) => this.matches(row)).map((row) => ({ ...row }));
        if (this.orderColumn) {
          const column = this.orderColumn;
          result.sort((a, b) =>
            this.orderAscending
              ? String(a[column]).localeCompare(String(b[column]))
              : String(b[column]).localeCompare(String(a[column])),
          );
        }
        if (this.limitCount !== null) result = result.slice(0, this.limitCount);
      }
      if (this.head) return resolve({ data: null, error: null, count: result.length });
      if (this.wantSingle) {
        return resolve({ data: result[0] ?? null, error: result[0] ? null : { message: "no rows" } });
      }
      if (this.wantMaybeSingle) return resolve({ data: result[0] ?? null, error: null });
      return resolve({ data: result, error: null });
    } catch (err) {
      return reject(err);
    }
  }
}
