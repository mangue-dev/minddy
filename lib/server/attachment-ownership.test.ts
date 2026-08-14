import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const { insertAttachments, removeStorageObjects, ResourceScopeError } =
  await import("./attachments");

/**
 * MIN-343 — LE FICHIER D'UN AUTRE.
 *
 * Deux moitiés du même défaut, et les deux sont ici parce qu'elles se tiennent :
 *
 *  - à l'ENREGISTREMENT, rien ne vérifiait que le `storage_path` déclaré avait
 *    été téléversé par celui qui l'enregistre — seul le préfixe `projects/{id}/`
 *    l'était, et il dit le projet, pas la personne ;
 *  - à la SUPPRESSION, l'objet partait dès qu'UNE ligne le nommant disparaissait,
 *    même si une autre le nommait encore.
 *
 * Enchaînées : un membre enregistre une ressource sur le fichier d'un collègue,
 * supprime sa propre ligne (le filtre `created_by` est respecté, il détruit bien
 * SA ligne), et l'objet du collègue s'en va avec.
 *
 * Ce qu'on simule : le storage et les deux tables qui référencent ses objets.
 * Rien d'autre — les gardes testées sont dans `attachments.ts`, pas dans Supabase.
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
  /** chemin → téléverseur enregistré par le storage (absent = objet inconnu). */
  owners?: Record<string, string | null>;
  /** table → chemins qu'une ligne vivante nomme encore. */
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

describe("enregistrer une ressource sur le fichier d'un autre", () => {
  const parent = { projectId: PROJECT, issueId: ISSUE, commentId: null };

  it("refuse le chemin téléversé par quelqu'un d'autre", async () => {
    const { client, inserted } = fake({ owners: { [PATH]: ALICE } });
    await expect(
      insertAttachments(client, {
        ...parent,
        createdBy: BOB,
        resources: [fileResource],
      })
    ).rejects.toBeInstanceOf(ResourceScopeError);
    // Et rien n'est écrit : la ligne qui aurait servi à détruire n'existe pas.
    expect(inserted).toHaveLength(0);
  });

  it("laisse passer son propre téléversement", async () => {
    const { client, inserted } = fake({ owners: { [PATH]: ALICE } });
    const rows = await insertAttachments(client, {
      ...parent,
      createdBy: ALICE,
      resources: [fileResource],
    });
    expect(rows).toHaveLength(1);
    expect(inserted[0].storage_path).toBe(PATH);
  });

  it("laisse passer un objet créé par minddy lui-même", async () => {
    // Envoi côté serveur (MCP) ou copie inter-projets : le storage n'a pas de
    // téléverseur à donner, et la ligne est écrite dans le même geste.
    const { client } = fake({ owners: { [PATH]: null } });
    await expect(
      insertAttachments(client, {
        ...parent,
        createdBy: BOB,
        resources: [fileResource],
      })
    ).resolves.toHaveLength(1);
  });

  it("ne demande rien au storage pour un lien", async () => {
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
    // Deux tables référencent le même bucket : ne regarder que la sienne
    // rendrait la garde vraie sur la moitié des chemins.
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

  it("ne supprime rien quand il ne sait plus qui référence quoi", async () => {
    // Un orphelin coûte des octets ; une suppression de trop coûte le fichier
    // de quelqu'un.
    const { client, removed } = fake({ referenceFails: true });
    await removeStorageObjects(client, [PATH]);
    expect(removed).toHaveLength(0);
  });
});
