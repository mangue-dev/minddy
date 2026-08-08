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
 * Une ressource pend d'exactement un parent (`attachments_parent_ck`), et
 * QUATRE des cinq types de la corbeille en portent : un objectif depuis
 * 20260728091000, un retour depuis 20260731090000. Ce test épingle la
 * correspondance type → colonne, la seule chose qui décide si un fichier est
 * relevé ou oublié — la routine (MIN-201) comprise, dont l'absence de colonne
 * est un CHOIX (elle n'a aucune surface où déposer un fichier) et non un oubli :
 * lui en inventer une ferait échouer la purge sur une colonne inexistante.
 *
 * Depuis MIN-184 une ressource peut être un LIEN, sans objet dans le bucket :
 * la requête doit donc écarter les `storage_path` nuls, sinon la liste rendue
 * porterait des nulls que `storage.remove()` refuse — et la purge, qui les
 * passe en bloc, n'effacerait plus rien du tout.
 */

/** Double PostgREST minimal : retient la colonne interrogée et le filtre
    `.not(...)`, rend un chemin. */
function serviceSpy() {
  const calls: { column: string; ids: string[]; notNullOn?: string }[] = [];
  const client = {
    from: () => ({
      select: () => ({
        in: (column: string, ids: string[]) => {
          const call: { column: string; ids: string[]; notNullOn?: string } = {
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
    ["project", "project_id"],
  ] as const)("relève les fichiers d'un %s via %s", async (type, column) => {
    const { client, calls } = serviceSpy();
    const paths = await attachmentPaths(client, type, ["a", "b"]);

    expect(calls).toEqual([
      { column, ids: ["a", "b"], notNullOn: "storage_path is null" },
    ]);
    expect(paths).toEqual(["projects/x/a/f.png", "projects/x/b/f.png"]);
  });

  it("écarte les ressources sans objet dans le bucket (les liens)", async () => {
    const { client, calls } = serviceSpy();
    await attachmentPaths(client, "issue", ["a"]);
    expect(calls[0].notNullOn).toBe("storage_path is null");
  });

  it("n'interroge RIEN pour une routine — elle ne porte aucun fichier", async () => {
    const { client, calls } = serviceSpy();
    await expect(attachmentPaths(client, "routine", ["a"])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("couvre tous les types de la corbeille, sans exception muette", async () => {
    // Un type ajouté à la corbeille sans passer ici serait purgé en laissant ses
    // fichiers derrière lui : chaque type doit soit interroger `attachments`,
    // soit avoir dit explicitement qu'il n'en porte pas (`routine`).
    const withoutAttachments: string[] = ["routine"];
    for (const type of TRASH_TYPES) {
      const { client, calls } = serviceSpy();
      await attachmentPaths(client, type, ["a"]);
      expect(calls, `${type} n'interroge pas attachments`).toHaveLength(
        withoutAttachments.includes(type) ? 0 : 1
      );
    }
  });

  it("n'interroge rien sans identifiant", async () => {
    const { client, calls } = serviceSpy();
    await expect(attachmentPaths(client, "issue", [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
