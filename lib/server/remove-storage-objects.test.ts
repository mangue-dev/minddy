import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";

const { removeStorageObjects } = await import("./attachments");

/**
 * MIN-184 — le ménage du bucket passe TOUT par ici, et un null y empoisonne le
 * lot entier.
 *
 * `storage.remove(paths)` poste un seul `{ prefixes: [...] }` : si un élément
 * n'est pas une chaîne, le service refuse la REQUÊTE, pas l'élément — et comme
 * l'erreur n'est que journalisée (un échec de ménage ne doit jamais faire
 * échouer l'écriture métier), plus rien n'est effacé, sans que personne le voie.
 *
 * Depuis qu'une ressource peut être un LIEN, `storage_path` nul est une valeur
 * ORDINAIRE de la table : le moindre appelant qui relève des chemins sans
 * filtrer emporte le null avec lui. Les appelants filtrent (corbeille,
 * rétention, suppression de compte, suppression de ressource, suppression de
 * commentaire) ; ce test épingle la seconde ceinture, celle qui vaut pour
 * l'appelant qui viendra ensuite.
 */

/** Depuis MIN-343, le goulot demande d'abord aux deux tables qui référencent le
    bucket si une ligne nomme encore le chemin. Ici aucune ne le fait : le lot
    passe entier, et c'est le null qui reste le sujet du fichier. */
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
