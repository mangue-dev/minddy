import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type EncryptionScope } from "./store";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const state = vi.hoisted(() => ({ database: "", version: 1 }));
const key = randomBytes(32);
const blindKey = randomBytes(32);
const store = new EncryptedStore({
  current: async (_scope: EncryptionScope) => ({
    version: state.version, bytes: Buffer.from(key),
  }),
  byVersion: async (_scope: EncryptionScope, version: number) => ({
    version, bytes: Buffer.from(key),
  }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({ current: async () => ({
    version: state.version, bytes: Buffer.from(key),
  }) }),
  getBlindIndexKeys: () => ({ current: async () => ({
    version: 1, bytes: Buffer.from(blindKey),
  }) }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
function sql(database: string, statement: string) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At",
    "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database], {
    input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }).trim();
}
function rows(statement: string): Record<string, unknown>[] {
  return JSON.parse(sql(state.database,
    `SELECT COALESCE(jsonb_agg(source),'[]'::jsonb) FROM (${statement}) source;`));
}

const service = {
  from(table: string) {
    const filters: string[] = [];
    const query = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: string | number) => {
        filters.push(`j.${column}=${typeof value === "number" ? value : quote(value)}`);
        return query;
      },
      neq: (column: string, value: string | number) => {
        filters.push(`j.${column}<>${typeof value === "number" ? value : quote(value)}`);
        return query;
      },
      limit: async (limit: number) => ({ data: rows(`SELECT j.*,
        jsonb_build_object('project_id',r.project_id) AS run
        FROM public.${table} j JOIN public.agent_runs r ON r.id=j.run_id
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY j.encryption_attempted_at NULLS FIRST,j.id LIMIT ${limit}`),
      error: null }),
      maybeSingle: async () => ({ data: rows(`SELECT j.id FROM public.${table} j
        WHERE ${filters.join(" AND ")} LIMIT 1`)[0] ?? null, error: null }),
    };
    return query;
  },
  rpc: async (_name: string, args: Record<string, unknown>) => {
    const literal = (value: unknown) => value === undefined || value === null
      ? "NULL" : typeof value === "number" ? String(value)
      : quote(typeof value === "object" ? JSON.stringify(value) : String(value));
    try {
      const result = sql(state.database, `SET ROLE service_role;
        SELECT public.migrate_agent_journal_ciphertext(
          ${literal(args.p_id)},${literal(args.p_run_id)},
          ${literal(args.p_previous_version)},${literal(args.p_payload)},
          ${literal(args.p_digest)},${literal(args.p_version)},
          ${literal(args.p_event_count)},${literal(args.p_payload_bytes)},
          ${literal(args.p_stored_bytes)},${literal(args.p_verified)},
          ${literal(args.p_previous_events)}::jsonb,
          ${literal(args.p_previous_payload)},${literal(args.p_previous_digest)},
          ${literal(args.p_previous_encoding)},
          ${literal(args.p_previous_event_count)},
          ${literal(args.p_previous_payload_bytes)},
          ${literal(args.p_previous_stored_bytes)});`);
      return { data: result.split("\n").at(-1) === "t", error: null };
    } catch (error) {
      return { data: null, error: { message: String(error) } };
    }
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillAgentJournalBatch } = await import("./agent-journal-backfill");
const { decodeJournal } = await import("@/lib/server/agent/encrypted-journal");

describe.skipIf(!enabled)("agent journal duplicate rotation in isolated PostgreSQL", () => {
  beforeAll(() => {
    state.database = `minddy_min591_journal_rotation_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const template = process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE ?? "minddy_min591_followup_final_v3_20260927";
    sql("postgres", `CREATE DATABASE ${state.database} TEMPLATE ${template};`);
    if (!process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE) {
      sql(state.database, readFileSync("supabase/migrations/20270108140000_verified_encryption_backfill_attempts.sql", "utf8"));
    }
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const run = randomUUID();
    sql(state.database, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
      INSERT INTO public.projects(id,owner_id,name,key)
        VALUES(${quote(project)},${quote(actor)},'Journal rotation','JRT');
      INSERT INTO public.agent_conversations(id,project_id,owner_id)
        VALUES(${quote(conversation)},${quote(project)},${quote(actor)});
      INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
        VALUES(${quote(run)},${quote(project)},${quote(conversation)},${quote(actor)});
      INSERT INTO public.agent_run_journal(run_id,session_id,events)
        VALUES(${quote(run)},'same-session','[{"seq":1,"output":"Private"}]'::jsonb),
          (${quote(run)},'same-session','[{"seq":1,"output":"Private"}]'::jsonb);`);
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("MINDDY_AGENT_JOURNAL_ENCRYPTION_ENABLED", "true");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    if (state.database) sql("postgres", `DROP DATABASE IF EXISTS ${state.database} WITH (FORCE);`);
  });

  it("keeps the alternate lookup through conversion, key rotation, and replay", async () => {
    expect(await backfillAgentJournalBatch(2)).toMatchObject({
      scanned: 2, migrated: 2, failed: 0,
    });
    const converted = rows("SELECT id,payload_sha256 FROM public.agent_run_journal ORDER BY id");
    expect(converted[0].payload_sha256).not.toBe(converted[1].payload_sha256);
    state.version = 2;
    expect(await backfillAgentJournalBatch(2)).toMatchObject({
      scanned: 2, migrated: 2, failed: 0,
    });
    const rotated = rows("SELECT j.*,jsonb_build_object('project_id',r.project_id) AS run FROM public.agent_run_journal j JOIN public.agent_runs r ON r.id=j.run_id ORDER BY j.id");
    expect(rotated.map((row) => row.payload_sha256))
      .toEqual(converted.map((row) => row.payload_sha256));
    for (const row of rotated) {
      expect(row.encryption_version).toBe(2);
      await expect(decodeJournal(String((row.run as { project_id: string }).project_id),
        row as unknown as Parameters<typeof decodeJournal>[1])).resolves.toMatchObject({
        events: [{ seq: 1, output: "Private" }],
      });
    }
    expect(await backfillAgentJournalBatch(2)).toMatchObject({
      unchanged: 2, failed: 0,
    });
  });
});
