import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";

const { removeStorageObjects } = await import("./attachments");

/**
 * MIN-184 — bucket cleaning goes EVERYTHING through here, and a null poisons the whole lot.
 *
 * `storage.remove(paths)` posts a single `{ prefixes: [...] }`: if an element
 * is not a string, the service refuses the REQUEST, not the element — and since
 * the error is only logged (a housekeeping failure should never make
 * fail the business write), nothing is erased, without anyone seeing it.
 *
 * Since a resource can be a LINK, `storage_path` null is a value
 * ORDINARY of the table: the least caller that falls on paths without
 * filter takes the null with it. Callers filter (trash,
 * retention, delete account, delete resource, delete
 * comment); this test pins the second belt, the one that is valid for
 * the caller who will come next.
 */

/** Since MIN-343, the bottleneck first asks the two tables that reference the
 bucket if a row still names the path. Here none does: the lot
 passes integer, and it is the null which remains the subject of the file. */
const noReference = () => ({
  select: () => ({ in: async () => ({ data: [], error: null }) }),
});

function storageSpy() {
  const remove = vi.fn(async () => ({ data: null, error: null }));
  const service = {
    from: noReference,
    storage: { from: () => ({ remove }) },
  } as unknown as SupabaseClient;
  return { service, remove };
}

describe("removeStorageObjects", () => {
  it("efface les chemins qu'on lui donne", async () => {
    const { service, remove } = storageSpy();
    await removeStorageObjects(service, ["projects/p/a/f.png", "projects/p/b/g.pdf"]);
    expect(remove).toHaveBeenCalledWith([
      "projects/p/a/f.png",
      "projects/p/b/g.pdf",
    ]);
  });

  it("écarte le chemin nul d'un lien sans emporter les fichiers avec lui", async () => {
    const { service, remove } = storageSpy();
    await removeStorageObjects(service, [null, "projects/p/a/f.png", undefined]);
    expect(remove).toHaveBeenCalledWith(["projects/p/a/f.png"]);
  });

  it("n'appelle pas le storage quand il ne reste aucun objet", async () => {
    const { service, remove } = storageSpy();
    await removeStorageObjects(service, [null, "", undefined]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("ne lève jamais : un ménage raté ne fait pas échouer l'écriture", async () => {
    const service = {
      from: noReference,
      storage: {
        from: () => ({
          remove: async () => {
            throw new Error("network down");
          },
        }),
      },
    } as unknown as SupabaseClient;
    await expect(
      removeStorageObjects(service, ["projects/p/a/f.png"])
    ).resolves.toBeUndefined();
  });
});
