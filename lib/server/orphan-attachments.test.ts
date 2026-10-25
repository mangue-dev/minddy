import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";

const { sweepOrphanAttachments } = await import("./attachments");

/**
 * MIN-348 — scanning objects that are no longer designated by any line.
 *
 * Uploading an attachment stores its bytes before the resource is saved. Anything that happens between
 * the two — a composer closed, a creation canceled — leaves the object alone in
 * the bucket, and nothing was picking it up.
 *
 * The sorting is in SQL (an anti-join on the two tables that reference the
 * bucket); what this file pinpoints is what the module DOES with it: it
 * spares what a document still cites (MIN-792), erases the rest in bounded
 * batches, and it stops at the first failure rather than counting as part of
 * the bytes that are still there.
 */

const P = "07b14964-0def-4941-8ddf-686572d6345d";
const U = "5ad9b962-93e7-4a7c-a44b-f4925484ba93";
const object = (i: number, family = `projects/${P}`) =>
  `${family}/00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const idOf = (path: string) => path.split("/").at(-1)!;

function fake(options: { orphans: string[]; removeFails?: boolean }) {
  const removed: string[][] = [];
  const checked: string[] = [];
  let rpcArgs: Record<string, unknown> | null = null;

  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("orphan_attachment_objects");
      rpcArgs = args;
      return { data: options.orphans.map((name) => ({ name })), error: null };
    },
    from: () => ({
      delete: () => ({ in: async () => ({ error: null }) }),
      upsert: async (rows: { storage_path: string }[]) => {
        checked.push(...rows.map((row) => row.storage_path));
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return options.removeFails ? { error: { message: "boom" } } : { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  return { client, removed, checked, args: () => rpcArgs };
}

/** No document cites anything. */
const nothingCited = async () => new Set<string>();

const BEFORE = "2026-08-07T00:00:00.000Z";

describe("sweepOrphanAttachments", () => {
  it("removes the SQL-selected objects and reports the count", async () => {
    const orphans = [object(1), object(2)];
    const service = fake({ orphans });
    const removed = await sweepOrphanAttachments(service.client, BEFORE, 500,
      { findCited: nothingCited });

    expect(removed).toBe(2);
    expect(service.removed).toEqual([orphans]);
    // The grace period travels to the SQL: it is he who protects the object
    // uploaded three minutes ago and not yet saved.
    expect(service.args()).toMatchObject({ p_before: BEFORE });
  });

  it("spares and records the objects a document still cites", async () => {
    // MIN-792: an inline description image has no row, only its address in
    // the text. Removing it would break the description.
    const cited = object(1);
    const orphan = object(2);
    const service = fake({ orphans: [cited, orphan] });
    const findCited = vi.fn(async () => new Set([idOf(cited)]));

    expect(await sweepOrphanAttachments(service.client, BEFORE, 500, { findCited })).toBe(1);
    expect(service.removed).toEqual([[orphan]]);
    expect(service.checked).toEqual([cited]);
  });

  it("reads the Numo messages of the owners of chat uploads", async () => {
    const chat = object(3, `chat/${U}`);
    const service = fake({ orphans: [chat, object(4)] });
    const findCited = vi.fn(async () => new Set<string>());

    await sweepOrphanAttachments(service.client, BEFORE, 500, { findCited });
    expect(findCited).toHaveBeenCalledWith(service.client,
      new Set([idOf(chat), idOf(object(4))]), new Set([U]));
  });

  it("keeps an object whose name cannot be matched in a text", async () => {
    // A historical named object ends with its file name, not an opaque id.
    const named = `projects/${P}/historical/report.pdf`;
    const service = fake({ orphans: [named] });
    expect(await sweepOrphanAttachments(service.client, BEFORE, 500,
      { findCited: nothingCited })).toBe(0);
    expect(service.removed).toEqual([]);
  });

  it("deletes nothing when a document cannot be read", async () => {
    const service = fake({ orphans: [object(1)] });
    await expect(sweepOrphanAttachments(service.client, BEFORE, 500, {
      findCited: async () => { throw new Error("decode failed"); },
    })).rejects.toThrow("decode failed");
    expect(service.removed).toEqual([]);
  });

  it("does nothing when no orphans exist", async () => {
    const service = fake({ orphans: [] });
    expect(await sweepOrphanAttachments(service.client, BEFORE, 500,
      { findCited: nothingCited })).toBe(0);
    expect(service.removed).toEqual([]);
  });

  it("splits removals into bounded batches", async () => {
    const orphans = Array.from({ length: 250 }, (_, i) => object(i));
    const service = fake({ orphans });
    expect(await sweepOrphanAttachments(service.client, BEFORE, 500,
      { findCited: nothingCited })).toBe(250);
    expect(service.removed.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
  });

  it("stops at the first failure without counting remaining objects", async () => {
    const orphans = Array.from({ length: 150 }, (_, i) => object(i));
    const service = fake({ orphans, removeFails: true });
    expect(await sweepOrphanAttachments(service.client, BEFORE, 500,
      { findCited: nothingCited })).toBe(0);
    expect(service.removed).toHaveLength(1);
  });
});
