import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";

const { sweepOrphanAttachments } = await import("./attachments");

/**
 * MIN-348 — scanning objects that are no longer designated by any line.
 *
 * Sending an attachment is direct-to-storage: the bytes leave the
 * browser BEFORE the resource is saved. Anything that happens between
 * the two — a composer closed, a creation canceled — leaves the object alone in
 * the bucket, and nothing was picking it up.
 *
 * The sorting is in SQL (an anti-join on the two tables that reference the
 * bucket); what this file pinpoints is what the module DOES with it: it
 * erases in bounded batches, and it stops at the first failure rather than counting
 * as part of the bytes that are still there.
 */

function fake(options: { orphans: string[]; removeFails?: boolean }) {
  const removed: string[][] = [];
  let rpcArgs: Record<string, unknown> | null = null;

  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("orphan_attachment_objects");
      rpcArgs = args;
      return { data: options.orphans.map((name) => ({ name })), error: null };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return options.removeFails ? { error: { message: "boom" } } : { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  return { client, removed, args: () => rpcArgs };
}

const BEFORE = "2026-08-07T00:00:00.000Z";

describe("sweepOrphanAttachments", () => {
  it("efface ce que le tri SQL a désigné, et le dit", async () => {
    const service = fake({ orphans: ["projects/p/1/a.png", "projects/p/2/b.pdf"] });
    const removed = await sweepOrphanAttachments(service.client, BEFORE);

    expect(removed).toBe(2);
    expect(service.removed).toEqual([["projects/p/1/a.png", "projects/p/2/b.pdf"]]);
    // The grace period travels to the SQL: it is he who protects the object
    // uploaded three minutes ago and not yet saved.
    expect(service.args()).toMatchObject({ p_before: BEFORE });
  });

  it("ne touche à rien quand il n'y a pas d'orphelin", async () => {
    const service = fake({ orphans: [] });
    expect(await sweepOrphanAttachments(service.client, BEFORE)).toBe(0);
    expect(service.removed).toEqual([]);
  });

  it("découpe en lots — `remove` refuse la requête entière au-delà", async () => {
    const orphans = Array.from({ length: 250 }, (_, i) => `projects/p/${i}/f.png`);
    const service = fake({ orphans });
    expect(await sweepOrphanAttachments(service.client, BEFORE)).toBe(250);
    expect(service.removed.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
  });

  it("s'arrête au premier échec plutôt que de compter des octets encore là", async () => {
    const orphans = Array.from({ length: 150 }, (_, i) => `projects/p/${i}/f.png`);
    const service = fake({ orphans, removeFails: true });
    expect(await sweepOrphanAttachments(service.client, BEFORE)).toBe(0);
    expect(service.removed).toHaveLength(1);
  });
});
