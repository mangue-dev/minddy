import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 7);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
const { decodeRunEvent, encodeRunEvent, listRunEvents, hydrateAgentSummaryCopies } =
  await import("./run-event-store");

function client(error: { message: string } | null = null) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    order: () => query,
    gt: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    in: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: [{ id: "event-1", seq: 3, type: "summary",
        payload: { text: "private" }, created_at: "2026-01-01",
        run_id: "run-1", encryption_version: 0, encrypted_content: null,
        run: { project_id: "project-1" } }],
      error,
    })),
  };
  return {
    filters,
    service: { from: () => query } as unknown as SupabaseClient,
  };
}

describe("agent run event read boundary", () => {
  it("binds the run and project before returning event content", async () => {
    const { filters, service } = client();
    const rows = await listRunEvents(service,
      { id: "run-1", project_id: "project-1" },
      { after: 2, types: ["summary"] });
    expect(filters).toEqual([
      ["run_id", "run-1"], ["run.project_id", "project-1"],
      ["seq", 2], ["type", ["summary"]],
    ]);
    expect(rows).toEqual([{
      id: "event-1", seq: 3, type: "summary",
      payload: { text: "private" }, created_at: "2026-01-01",
    }]);
  });

  it("fails on a storage error instead of returning an empty transcript", async () => {
    const { service } = client({ message: "storage error" });
    await expect(listRunEvents(service,
      { id: "run-1", project_id: "project-1" })).rejects.toThrow(
        "Unable to read agent run events");
  });

  it("reads a legacy preview schema only while the event flag is disabled", async () => {
    let reads = 0;
    const query = {
      select: () => query, eq: () => query, order: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(
        ++reads === 1
          ? { data: null, error: { code: "PGRST204" } }
          : { data: [{ id: "event-1", run_id: "run-1", seq: 1,
              type: "summary", payload: { text: "legacy" }, created_at: "2026-01-01" }],
            error: null },
      )),
    };
    const service = { from: () => query } as unknown as SupabaseClient;
    await expect(listRunEvents(service,
      { id: "run-1", project_id: "project-1" })).resolves.toMatchObject([
      { payload: { text: "legacy" } },
    ]);
    expect(reads).toBe(2);
  });

  it("protects an event and binds ciphertext to its project and event ID", async () => {
    const payload = { text: "private summary", nested: { output: "secret" } };
    const encoded = await encodeRunEvent("project-1", "run-1", 3, "summary", payload,
      "event-1");
    expect(encoded.payload).toBeNull();
    expect(encoded.encrypted_content).not.toContain("private summary");
    expect(encoded.has_summary_text).toBe(true);
    await expect(decodeRunEvent("project-1", {
      ...encoded, created_at: "2026-01-01",
    })).resolves.toMatchObject({ payload });
    await expect(decodeRunEvent("project-2", {
      ...encoded, created_at: "2026-01-01",
    })).rejects.toThrow();
    await expect(decodeRunEvent("project-1", {
      ...encoded, id: "event-2", created_at: "2026-01-01",
    })).rejects.toThrow();
    await expect(decodeRunEvent("project-1", {
      ...encoded, run_id: "run-2", created_at: "2026-01-01",
    })).rejects.toThrow();
  });

  it("recovers an encrypted summary copy only through its scoped source event", async () => {
    const encoded = await encodeRunEvent("project-1", "run-1", 3, "summary",
      { text: "private summary" }, "event-1");
    const event = { ...encoded, created_at: "2026-01-01",
      run: { project_id: "project-1" } };
    const query = {
      select: () => query, in: () => query, eq: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: [event], error: null,
      })),
    };
    const service = { from: () => query } as unknown as SupabaseClient;
    await expect(hydrateAgentSummaryCopies(service, "project-1", [{
      source: "agent", legacy_event_id: "event-1", content: encoded.encrypted_content,
    }])).resolves.toMatchObject([{ content: "private summary" }]);
    await expect(hydrateAgentSummaryCopies(service, null, [{
      source: "agent", legacy_event_id: "event-1", content: encoded.encrypted_content,
    }])).resolves.toMatchObject([{ content: "private summary" }]);
  });
});
