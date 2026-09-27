import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type EncryptionScope } from "./store";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const template = "minddy_min591_final_review";
const state = vi.hoisted(() => ({
  database: "", userId: "", turnId: "", messageId: "", conflictId: "", badId: "",
  version: 1, conflictNext: false,
}));
const keys = new Map<number, Buffer>([[1, randomBytes(32)], [2, randomBytes(32)]]);
const store = new EncryptedStore({
  current: async (_scope: EncryptionScope) => ({
    version: state.version, bytes: Buffer.from(keys.get(state.version)!),
  }),
  byVersion: async (_scope: EncryptionScope, version: number) => ({
    version, bytes: Buffer.from(keys.get(version)!),
  }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({
    current: async () => ({ version: state.version, bytes: Buffer.from(keys.get(state.version)!) }),
  }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
function sql(database: string, statement: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At",
    "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database], {
    input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }).trim();
}
function rows(statement: string): Record<string, unknown>[] {
  return JSON.parse(sql(state.database,
    `SELECT COALESCE(jsonb_agg(source), '[]'::jsonb) FROM (${statement}) AS source;`));
}
function json(value: unknown) {
  return value === null ? "NULL" : `${quote(JSON.stringify(value))}::jsonb`;
}

const service = {
  from: (table: string) => {
    let id: string | null = null;
    const query = {
      select: () => query,
      or: () => query,
      order: () => query,
      eq: (_column: string, value: string) => { id = value; return query; },
      limit: async (limit: number) => {
        if (table === "assistant_messages") return { data: rows(`
          SELECT m.id,m.turn_id,m.role,m.content,m.tool_calls,m.context,m.metadata,
            m.tool_payload_version,jsonb_build_object('user_id',c.user_id) AS conversation
          FROM public.assistant_messages AS m JOIN public.conversations AS c
            ON c.id=m.conversation_id WHERE m.id=${quote(state.messageId)} LIMIT ${limit}`), error: null };
        if (table === "numo_assistant_turns") return { data: rows(`
          SELECT id,user_id,checkpoint FROM public.numo_assistant_turns
          WHERE user_id=${quote(state.userId)} ORDER BY id LIMIT ${limit}`), error: null };
        return { data: [], error: null };
      },
      single: async () => {
        const data = rows(table === "assistant_messages" ? `
          SELECT m.id,m.turn_id,m.role,m.content,m.tool_calls,m.context,m.metadata,
            m.tool_payload_version,jsonb_build_object('user_id',c.user_id) AS conversation
          FROM public.assistant_messages AS m JOIN public.conversations AS c
            ON c.id=m.conversation_id WHERE m.id=${quote(id!)}` : `
          SELECT id,user_id,checkpoint FROM public.numo_assistant_turns WHERE id=${quote(id!)}`)[0];
        return { data: data ?? null, error: data ? null : { code: "PGRST116" } };
      },
    };
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "migrate_numo_tool_checkpoint" && state.conflictNext &&
        args.p_id === state.conflictId) {
      state.conflictNext = false;
      sql(state.database, `UPDATE public.numo_assistant_turns SET checkpoint='{"phase":"worker_wait","active_run_id":null}'::jsonb
        WHERE id=${quote(state.conflictId)};`);
    }
    let call: string;
    if (name === "migrate_numo_tool_message") {
      call = `public.migrate_numo_tool_message(${quote(String(args.p_id))},
        ${args.p_old_content === null ? "NULL" : quote(String(args.p_old_content))},
        ${json(args.p_old_tool_calls)},${json(args.p_old_context)},
        ${json(args.p_old_metadata)},${args.p_old_version},
        ${quote(String(args.p_new_content))},${args.p_new_version},
        ${json(args.p_old_checkpoint)},${json(args.p_new_checkpoint)})`;
    } else if (name === "migrate_numo_tool_checkpoint") {
      call = `public.migrate_numo_tool_checkpoint(${quote(String(args.p_id))},
        ${json(args.p_old)},${json(args.p_new)})`;
    } else if (name === "mark_numo_content_attempt") {
      call = `public.mark_numo_content_attempt(${quote(String(args.p_kind))},
        ${quote(String(args.p_id))},${json(args.p_old)},
        ${args.p_call_id ? quote(String(args.p_call_id)) : "NULL"})`;
    } else return { data: false, error: null };
    try { return { data: sql(state.database, `SET ROLE service_role; SELECT ${call};`).split("\n").at(-1) === "t", error: null }; }
    catch { return { data: null, error: { message: "RPC failed" } }; }
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
const { backfillNumoToolContentBatch } = await import("./numo-tool-content-backfill");
const { decodeNumoCheckpoint, decodeNumoToolMessage } = await import("@/lib/server/numo/tool-content");

describe.skipIf(!enabled)("Numo tool worker against isolated PostgreSQL", () => {
  beforeAll(() => {
    state.database = `minddy_min591_numo_worker_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    state.userId = randomUUID();
    state.turnId = randomUUID();
    state.messageId = randomUUID();
    state.conflictId = randomUUID();
    state.badId = randomUUID();
    const project = randomUUID(), conversation = randomUUID();
    sql("postgres", `CREATE DATABASE ${state.database} TEMPLATE ${template};`);
    sql(state.database, `DO $partition$ BEGIN
      EXECUTE format('CREATE TABLE IF NOT EXISTS realtime.%I PARTITION OF realtime.messages FOR VALUES FROM (%L) TO (%L)',
        'messages_' || to_char(current_date,'YYYY_MM_DD'), current_date, current_date + 1);
    END $partition$;`);
    sql(state.database, readFileSync("supabase/migrations/20270108100000_min591_numo_attempts_and_comment_realtime.sql", "utf8"));
    sql(state.database, `INSERT INTO auth.users(id) VALUES(${quote(state.userId)});
      INSERT INTO public.projects(id,owner_id,name,key)
        VALUES(${quote(project)},${quote(state.userId)},'Fixture project','NWW');
      INSERT INTO public.conversations(id,user_id,project_id,status)
        VALUES(${quote(conversation)},${quote(state.userId)},${quote(project)},'generating');
      INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,status,checkpoint)
        VALUES(${quote(state.turnId)},${quote(conversation)},${quote(state.userId)},
          gen_random_uuid(),gen_random_uuid(),'queued',
          ${json({ phase: "tools", assistantMessageId: state.messageId, toolCalls: ["Private tool"] })}),
          (${quote(state.conflictId)},${quote(conversation)},${quote(state.userId)},
          gen_random_uuid(),gen_random_uuid(),'queued',${json({ phase: "model", messages: ["Private model"] })});
      INSERT INTO public.assistant_messages(id,conversation_id,turn_id,role,content,tool_calls,context,metadata)
        VALUES(${quote(state.messageId)},${quote(conversation)},${quote(state.turnId)},
          'assistant','Private assistant','[{"id":"call-1"}]'::jsonb,NULL,'{}'::jsonb);
      INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,status,checkpoint)
        VALUES(${quote(state.badId)},${quote(conversation)},${quote(state.userId)},
          gen_random_uuid(),gen_random_uuid(),'queued',${json({ phase: "model",
            encrypted_payload: JSON.stringify({ format: 3, keyVersion: 1,
              salt: "A".repeat(43), encoding: "json", iv: "A".repeat(16),
              tag: "A".repeat(22), data: "AA" }), encryption_version: 1 })});`);
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("MINDDY_NUMO_TOOL_CONTENT_ENCRYPTION_ENABLED", "true");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    if (state.database) sql("postgres", `DROP DATABASE IF EXISTS ${state.database} WITH (FORCE);`);
  });

  it("atomically converts linked content, survives CAS conflict, and rotates with old keys", async () => {
    state.conflictNext = true;
    expect(await backfillNumoToolContentBatch(5)).toMatchObject({
      conflicted: 1, failed: 1,
    });
    expect(rows(`SELECT tool_checkpoint_checked_at,tool_checkpoint_attempted_at
      FROM public.numo_assistant_turns WHERE id=${quote(state.badId)}`)[0])
      .toMatchObject({ tool_checkpoint_checked_at: null,
        tool_checkpoint_attempted_at: expect.any(String) });
    const first = rows(`SELECT m.id,m.turn_id,m.role,m.content,m.tool_calls,m.context,m.metadata,
      m.tool_payload_version,jsonb_build_object('user_id',c.user_id) AS conversation
      FROM public.assistant_messages m JOIN public.conversations c ON c.id=m.conversation_id
      WHERE m.id=${quote(state.messageId)}`)[0];
    const turn = rows(`SELECT id,user_id,checkpoint FROM public.numo_assistant_turns
      WHERE id=${quote(state.turnId)}`)[0];
    expect(JSON.stringify([first,turn])).not.toContain("Private");
    expect((await decodeNumoToolMessage(state.userId,
      first as Parameters<typeof decodeNumoToolMessage>[1])).content)
      .toBe("Private assistant");
    expect((await decodeNumoCheckpoint(state.userId,state.turnId,
      turn.checkpoint as Record<string, unknown>)).phase).toBe("tools");
    sql(state.database, `DELETE FROM public.numo_assistant_turns WHERE id=${quote(state.badId)};`);
    state.version = 2;
    expect(await backfillNumoToolContentBatch(5)).toMatchObject({ failed: 0 });
    const rotated = rows(`SELECT id,user_id,checkpoint FROM public.numo_assistant_turns
      WHERE id=${quote(state.turnId)}`)[0];
    expect((rotated.checkpoint as Record<string, unknown>).encryption_version).toBe(2);
    expect(rows(`SELECT tool_payload_version FROM public.assistant_messages
      WHERE id=${quote(state.messageId)}`)[0].tool_payload_version).toBe(2);
  });
});
