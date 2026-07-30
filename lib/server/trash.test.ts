import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachmentPaths, TRASH_TYPES } from "./trash";

/**
 * MIN-133 — la purge doit emporter les FICHIERS avec la ligne.
 *
 * `attachments` cascade avec son parent, mais les objets du bucket, eux, ne
 * cascadent pas : leurs chemins doivent être relevés AVANT le delete, sinon ils
 * restent dans le storage sans plus aucune ligne pour les nommer — invisibles,
 * et impossibles à rattraper ensuite.
 *
 * Une pièce jointe pend d'exactement un parent (`attachments_parent_ck`), et
 * les QUATRE types de la corbeille en portent : un objectif depuis
 * 20260728091000, un retour depuis 20260731090000. Ce test épingle la
 * correspondance type → colonne, la seule chose qui décide si un fichier est
 * relevé ou oublié.
 */

/** Double PostgREST minimal : retient la colonne interrogée, rend un chemin. */
function serviceSpy() {
  const calls: { column: string; ids: string[] }[] = [];
  const client = {
    from: () => ({
      select: () => ({
        in: (column: string, ids: string[]) => {
          calls.push({ column, ids });
          return Promise.resolve({
            data: ids.map((id) => ({ storage_path: `projects/x/${id}/f.png` })),
            error: null,
          });
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
    ["project", "project_id"],
  ] as const)("relève les fichiers d'un %s via %s", async (type, column) => {
    const { client, calls } = serviceSpy();
    const paths = await attachmentPaths(client, type, ["a", "b"]);

    expect(calls).toEqual([{ column, ids: ["a", "b"] }]);
    expect(paths).toEqual(["projects/x/a/f.png", "projects/x/b/f.png"]);
  });

  it("couvre les quatre types de la corbeille, sans exception muette", async () => {
    for (const type of TRASH_TYPES) {
      const { client, calls } = serviceSpy();
      await attachmentPaths(client, type, ["a"]);
      expect(calls, `${type} n'interroge pas attachments`).toHaveLength(1);
    }
  });

  it("n'interroge rien sans identifiant", async () => {
    const { client, calls } = serviceSpy();
    await expect(attachmentPaths(client, "issue", [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
