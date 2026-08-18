import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachmentPaths, TRASH_TYPES } from "./trash";

/**
 * MIN-133 — the purge must take the FILES with the line.
 *
 * `attachments` cascade with its parent, but the objects in the bucket do not
 * cascade: their paths must be noted BEFORE the delete, otherwise they
 * remain in the storage without any line to name them — invisible,
 * and impossible to catch afterwards.
 *
 * A resource hangs from exactly one parent (`attachments_parent_ck`), and
 * FOUR of the five types in the bin carry them: an objective from
 * 20260728091000, a return from 20260731090000. This test pinpoints the
 * type → column match, the only thing that decides if a file is
 * found or forgotten — the routine (MIN-201) included, including the absence of column
 * is a CHOICE (it has no surface on which to deposit a file) and not an oversight:
 * inventing one would cause the purge to fail on a non-existent column.
 *
 * Since MIN-280, a PAGE also carries one — in `page_files`, the other
 * table, that of files placed IN a document body. The “page” type
 * is therefore no longer an exception, and a project queries both.
 *
 * Since MIN-184 a resource can be a LINK, without an object in the bucket:
 * the query must therefore exclude null `storage_path`, otherwise the list rendered
 * would carry nulls that `storage.remove()` refuses — and the purge, which takes place in bulk, would no longer erase anything at all.
 */

/** Double minimal PostgREST: retains the TABLE, the queried column and the
 filter `.not(...)`, returns a path. */
function serviceSpy() {
  const calls: {
    table: string;
    column: string;
    ids: string[];
    notNullOn?: string;
  }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        in: (column: string, ids: string[]) => {
          const call: {
            table: string;
            column: string;
            ids: string[];
            notNullOn?: string;
          } = {
            table,
            column,
            ids,
          };
          calls.push(call);
          const result = {
            data: ids.map((id) => ({ storage_path: `projects/x/${id}/f.png` })),
            error: null,
          };
          return {
            not: (col: string, operator: string, value: unknown) => {
              call.notNullOn = `${col} ${operator} ${value}`;
              return Promise.resolve(result);
            },
            then: (resolve: (v: typeof result) => unknown) => resolve(result),
          };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("attachmentPaths", () => {
  it.each([
    ["issue", "issue_id"],
    ["objective", "objective_id"],
    ["feedback", "feedback_post_id"],
  ] as const)("relève les fichiers d'un %s via %s", async (type, column) => {
    const { client, calls } = serviceSpy();
    const paths = await attachmentPaths(client, type, ["a", "b"]);

    expect(calls).toEqual([
      {
        table: "attachments",
        column,
        ids: ["a", "b"],
        notNullOn: "storage_path is null",
      },
    ]);
    expect(paths).toEqual(["projects/x/a/f.png", "projects/x/b/f.png"]);
  });

  /**
 * MIN-280 — a file placed IN a page body lives in `page_files`, not
 * in `attachments` (two lifetimes, two tables). The purge must therefore
 * query BOTH where both exist, otherwise purging a project
 * would leave all the images from its wiki in the bucket — the exact fault
 * that this file exists to prevent, a table later.
 */
  it("restores files from a PAGE in page_files and nowhere else", async () => {
    const { client, calls } = serviceSpy();
    const paths = await attachmentPaths(client, "page", ["a"]);
    expect(calls).toEqual([{ table: "page_files", column: "page_id", ids: ["a"] }]);
    expect(paths).toEqual(["projects/x/a/f.png"]);
  });

  it("restores BOTH for a project: its resources and page files", async () => {
    const { client, calls } = serviceSpy();
    const paths = await attachmentPaths(client, "project", ["a"]);
    expect(calls.map((c) => `${c.table}.${c.column}`)).toEqual([
      "page_files.project_id",
      "attachments.project_id",
    ]);
    expect(paths).toHaveLength(2);
  });

  it("discards resources without a bucket object (links)", async () => {
    const { client, calls } = serviceSpy();
    await attachmentPaths(client, "issue", ["a"]);
    expect(calls[0].notNullOn).toBe("storage_path is null");
  });

  it("n'interroge RIEN pour une routine — elle ne porte aucun fichier", async () => {
    const { client, calls } = serviceSpy();
    await expect(attachmentPaths(client, "routine", ["a"])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("covers every trash type without a silent exception", async () => {
    // A type added to the trash without going here would be purged leaving its
    // files behind it: each type must query one of the two tables,
    // or have explicitly said that he does not carry any (`routine`, which has no
    // no surface to place a file on).
    const withoutFiles: string[] = ["routine"];
    for (const type of TRASH_TYPES) {
      const { client, calls } = serviceSpy();
      await attachmentPaths(client, type, ["a"]);
      expect(
        calls.length,
        `${type} n'interroge ni attachments ni page_files`
      ).toBe(withoutFiles.includes(type) ? 0 : type === "project" ? 2 : 1);
    }
  });

  it("n'interroge rien sans identifiant", async () => {
    const { client, calls } = serviceSpy();
    await expect(attachmentPaths(client, "issue", [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
