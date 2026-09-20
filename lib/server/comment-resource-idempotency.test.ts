import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertAttachments } from "./attachments";

it("replays a committed attachment batch without duplicates or overwriting the original resource", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const service = {
    rpc: async () => ({ data: [], error: null }),
    from: () => ({
      upsert(batch: Array<Record<string, unknown>>, options: { ignoreDuplicates: boolean }) {
        expect(options.ignoreDuplicates).toBe(true);
        const inserted = batch.filter((row) => !rows.has(row.id as string));
        for (const row of inserted) rows.set(row.id as string, row);
        return { select: async () => ({ data: inserted, error: null }) };
      },
    }),
  } as unknown as SupabaseClient;
  const args = {
    projectId: "p1", issueId: "i1", commentId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", createdBy: "u1", idempotencyKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    resources: [
      { storage_path: "projects/p1/a.png", file_name: "a.png", mime_type: "image/png", size_bytes: 10 },
      { storage_path: "projects/p1/b.png", file_name: "b.png", mime_type: "image/png", size_bytes: 11 },
    ],
  };
  const original = await insertAttachments(service, args);
  expect(original).toHaveLength(2);
  expect(new Set(original.map((row) => row.id)).size).toBe(2);
  const repeated = await insertAttachments(service, { ...args, resources: args.resources.map((resource) => ({ ...resource, file_name: "changed.png" })) });
  expect(repeated).toEqual([]);
  expect([...rows.values()].map((row) => row.file_name)).toEqual(["a.png", "b.png"]);
  const alternateCase = await insertAttachments(service, {
    ...args,
    commentId: args.commentId.toUpperCase(),
    idempotencyKey: args.idempotencyKey.toUpperCase(),
  });
  expect(alternateCase).toEqual([]);
  expect(rows.size).toBe(2);
  await insertAttachments(service, { ...args, commentId: "c2", idempotencyKey: "c2" });
  expect(rows.size).toBe(4);
});

describe("idempotent resource access checks", () => {
  it("still rejects a file uploaded by another account before any upsert", async () => {
    let writes = 0;
    const service = {
      rpc: async () => ({ data: [{ name: "projects/p1/private.png", owner_id: "other" }], error: null }),
      from: () => { writes += 1; throw new Error("Unexpected write"); },
    } as unknown as SupabaseClient;
    await expect(insertAttachments(service, {
      projectId: "p1", issueId: "i1", commentId: "c1", createdBy: "u1", idempotencyKey: "c1",
      resources: [{ storage_path: "projects/p1/private.png", file_name: "private.png", mime_type: "image/png", size_bytes: 10 }],
    })).rejects.toThrow("uploaded by someone else");
    expect(writes).toBe(0);
  });
});
