import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";

const { collectCitedIds, findCitedUploads, uploadObjectId } = await import("./upload-citations");

/**
 * MIN-792 — before the nightly sweep deletes an upload, every text that can
 * cite it is read. These tests pin what counts as a citation and which
 * tables are read, against an in-memory database of plaintext rows (the
 * decoders pass legacy rows through after validating them).
 */

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const OWNER = "5ad9b962-93e7-4a7c-a44b-f4925484ba93";
const STRANGER = "9a429df6-36a4-479a-8643-b0a881b81087";
const IMAGE = "11111111-1111-4111-8111-111111111111";
const NOTEBOOK = "22222222-2222-4222-8222-222222222222";
const CHAT = "33333333-3333-4333-8333-333333333333";
const ORPHAN = "44444444-4444-4444-8444-444444444444";

const src = (path: string) => `/api/attachments/file?path=${encodeURIComponent(path)}`;

type Row = Record<string, unknown>;

function database(tables: Record<string, Row[]>, failing?: string) {
  const reads: string[] = [];
  const client = {
    from: (table: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      let range: [number, number] = [0, Infinity];
      const query = {
        select: () => query,
        order: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          return query;
        },
        then: (resolve: (value: unknown) => void) => {
          reads.push(table);
          if (table === failing) return resolve({ data: null, error: { message: "boom" } });
          const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          resolve({ data: rows.slice(range[0], range[1] + 1), error: null });
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, reads };
}

const issue = (description: string) => ({
  id: crypto.randomUUID(), project_id: PROJECT, title: "Ticket", description, plan: null,
  remote_url: null, automation_override: null,
});

describe("uploadObjectId", () => {
  it("reads the opaque id that ends a storage path", () => {
    expect(uploadObjectId(`projects/${PROJECT}/${IMAGE.toUpperCase()}`)).toBe(IMAGE);
    expect(uploadObjectId(`chat/${OWNER}/${CHAT}`)).toBe(CHAT);
  });

  it("has no id for a historical named object", () => {
    expect(uploadObjectId(`projects/${PROJECT}/historical/report.pdf`)).toBeNull();
  });
});

describe("collectCitedIds", () => {
  it("finds an id in any string, encoded or nested, and only wanted ids", () => {
    const found = new Set<string>();
    collectCitedIds({
      type: "doc",
      content: [{ type: "image", attrs: { src: src(`projects/${PROJECT}/${IMAGE}`) } }],
      text: `see ${PROJECT}`,
    }, new Set([IMAGE, ORPHAN]), found);
    expect(found).toEqual(new Set([IMAGE]));
  });
});

describe("findCitedUploads", () => {
  it("reports candidates cited by a description, a notebook or an owner's Numo message", async () => {
    const db = database({
      issues: [issue(`Before ![shot](${src(`projects/${PROJECT}/${IMAGE}`)})`)],
      user_scratchpad: [{ user_id: OWNER, content: `![n](${src(`chat/${OWNER}/${NOTEBOOK}`)})` }],
      conversations: [{ id: "c1", user_id: OWNER }],
      assistant_messages: [{
        id: "m1", conversation_id: "c1", role: "user", content: "look",
        metadata: { attachments: [{ storage_path: `chat/${OWNER}/${CHAT}` }] },
      }],
    });

    const cited = await findCitedUploads(db.client, [IMAGE, NOTEBOOK, CHAT, ORPHAN], [OWNER]);
    expect(cited).toEqual(new Set([IMAGE, NOTEBOOK, CHAT]));
  });

  it("reads trashed rows, since a restored ticket must find its images again", async () => {
    const db = database({
      issues: [{ ...issue(src(`projects/${PROJECT}/${IMAGE}`)), deleted_at: "2026-10-01T00:00:00Z" }],
    });
    expect(await findCitedUploads(db.client, [IMAGE])).toEqual(new Set([IMAGE]));
  });

  it("ignores the Numo messages of other accounts", async () => {
    // A chat upload can only be attached by its owner.
    const db = database({
      conversations: [{ id: "c2", user_id: STRANGER }],
      assistant_messages: [{
        id: "m2", conversation_id: "c2", role: "user", content: CHAT, metadata: {},
      }],
    });
    expect(await findCitedUploads(db.client, [CHAT], [OWNER])).toEqual(new Set());
  });

  it("stops reading once every candidate is found", async () => {
    const db = database({ issues: [issue(IMAGE)] });
    await findCitedUploads(db.client, [IMAGE]);
    expect(db.reads).toEqual(["issues"]);
  });

  it("reads every text source when a candidate is cited nowhere", async () => {
    const db = database({});
    expect(await findCitedUploads(db.client, [ORPHAN], [OWNER])).toEqual(new Set());
    expect(db.reads).toEqual([
      "issues", "objectives", "comments", "page_comments", "pages", "page_versions",
      "feedback_posts", "agent_routines", "user_scratchpad", "conversations",
    ]);
  });

  it("pages through large tables", async () => {
    const filler = Array.from({ length: 600 }, () => issue("nothing here"));
    const db = database({ issues: [...filler, issue(IMAGE)] });
    expect(await findCitedUploads(db.client, [IMAGE])).toEqual(new Set([IMAGE]));
    expect(db.reads.filter((table) => table === "issues")).toHaveLength(2);
  });

  it("throws when a source cannot be read, so nothing is deleted", async () => {
    const db = database({}, "pages");
    await expect(findCitedUploads(db.client, [ORPHAN])).rejects.toThrow(/pages/);
  });

  it("throws when a row cannot be decoded", async () => {
    const db = database({ objectives: [{ id: "o1", project_id: PROJECT, name: "", description: null }] });
    await expect(findCitedUploads(db.client, [ORPHAN])).rejects.toThrow();
  });

  it("reads nothing without candidates", async () => {
    const db = database({});
    expect(await findCitedUploads(db.client, [])).toEqual(new Set());
    expect(db.reads).toEqual([]);
  });
});
