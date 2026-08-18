import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const { insertAttachments, removeStorageObjects, ResourceScopeError } =
  await import("./attachments");

/**
 * MIN-343 — ANOTHER'S FILE.
 *
 * Two halves of the same default, and both are here because they hold each other:
 *
 * - at SAVE, nothing checked that the `storage_path` declared had
 * been uploaded by the person saving it — only the prefix `projects/{id}/`
 * was, and it says the project, not the person ;
 * - upon DELETION, the object was removed as soon as ONE line naming it disappeared,
 * even if another one still named it.
 *
 * Chained: a member saves a resource on a colleague's file,
 * deletes its own line (the `created_by` filter is respected, it destroys correctly
 * SA line), and the colleague's object goes with it.
 *
 * What we simulate: the storage and the two tables which reference its objects.
 * Nothing else — the guards tested are in `attachments.ts`, not in Supabase.
 */

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ISSUE = "22222222-2222-4222-8222-222222222222";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATH = `projects/${PROJECT}/abc/rapport.pdf`;

function fake({
  owners = {},
  referencedIn = {},
  referenceFails = false,
}: {
  /** path → uploader registered by storage (absent = unknown object). */
  owners?: Record<string, string | null>;
  /** table → paths that a live row still names. */
  referencedIn?: { attachments?: string[]; page_files?: string[] };
  referenceFails?: boolean;
} = {}) {
  const removed: string[][] = [];
  const inserted: Record<string, unknown>[] = [];

  const client = {
    rpc: async (_fn: string, params: { paths: string[] }) => ({
      data: params.paths
        .filter((p) => p in owners)
        .map((p) => ({ name: p, owner_id: owners[p] })),
      error: null,
    }),
    from: (table: string) => ({
      insert: (batch: Record<string, unknown>[]) => {
        inserted.push(...batch);
        return {
          select: async () => ({
            data: batch.map((r) => ({ ...r, id: "row-1" })),
            error: null,
          }),
        };
      },
      select: () => ({
        in: async (_column: string, slice: string[]) => {
          if (referenceFails) return { data: null, error: { message: "boom" } };
          const held =
            (referencedIn as Record<string, string[] | undefined>)[table] ?? [];
          return {
            data: slice.filter((p) => held.includes(p)).map((p) => ({ storage_path: p })),
            error: null,
          };
        },
      }),
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  return { client, removed, inserted };
}

const fileResource = {
  storage_path: PATH,
  file_name: "rapport.pdf",
  mime_type: "application/pdf",
  size_bytes: 12,
};

describe("registering a resource on someone else's file", () => {
  const parent = { projectId: PROJECT, issueId: ISSUE, commentId: null };

  it("rejects a path uploaded by someone else", async () => {
    const { client, inserted } = fake({ owners: { [PATH]: ALICE } });
    await expect(
      insertAttachments(client, {
        ...parent,
        createdBy: BOB,
        resources: [fileResource],
      })
    ).rejects.toBeInstanceOf(ResourceScopeError);
    // And nothing is written: the line which would have been used to destroy does not exist.
    expect(inserted).toHaveLength(0);
  });

  it("allows its own upload through", async () => {
    const { client, inserted } = fake({ owners: { [PATH]: ALICE } });
    const rows = await insertAttachments(client, {
      ...parent,
      createdBy: ALICE,
      resources: [fileResource],
    });
    expect(rows).toHaveLength(1);
    expect(inserted[0].storage_path).toBe(PATH);
  });

  it("allows an object created by minddy itself through", async () => {
    // Server-side sending (MCP) or inter-project copy: storage has no
    // uploader to give, and the line is written in the same gesture.
    const { client } = fake({ owners: { [PATH]: null } });
    await expect(
      insertAttachments(client, {
        ...parent,
        createdBy: BOB,
        resources: [fileResource],
      })
    ).resolves.toHaveLength(1);
  });

  it("does not ask storage for a link", async () => {
    const { client } = fake();
    await expect(
      insertAttachments(client, {
        ...parent,
        createdBy: BOB,
        resources: [
          {
            kind: "link" as const,
            url: "https://example.test/doc",
            file_name: "example.test",
            icon_data_url: null,
          },
        ],
      })
    ).resolves.toHaveLength(1);
  });
});

describe("supprimer les octets d'un objet encore référencé", () => {
  it("garde l'objet qu'une autre ligne nomme encore", async () => {
    const { client, removed } = fake({ referencedIn: { attachments: [PATH] } });
    await removeStorageObjects(client, [PATH]);
    expect(removed).toHaveLength(0);
  });

  it("garde l'objet qu'un fichier de page nomme encore", async () => {
    // Two tables reference the same bucket: only look at yours
    // would make the guard true on half the paths.
    const { client, removed } = fake({ referencedIn: { page_files: [PATH] } });
    await removeStorageObjects(client, [PATH]);
    expect(removed).toHaveLength(0);
  });

  it("retire l'orphelin, et lui seul", async () => {
    const orphan = `projects/${PROJECT}/def/vieux.pdf`;
    const { client, removed } = fake({ referencedIn: { attachments: [PATH] } });
    await removeStorageObjects(client, [PATH, orphan, null, ""]);
    expect(removed).toEqual([[orphan]]);
  });

  it("deletes nothing when it no longer knows what references what", async () => {
    // An orphan costs bytes; one deletion too much costs the file
    // de quelqu'un.
    const { client, removed } = fake({ referenceFails: true });
    await removeStorageObjects(client, [PATH]);
    expect(removed).toHaveLength(0);
  });
});
