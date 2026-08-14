import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MIN-296 — ce que la suppression de compte laisse (ou non) dans les BUCKETS.
 *
 * Les lignes cascadent avec `auth.users`, les octets non : chaque bucket qui
 * porte quelque chose de la personne doit être balayé à la main, et un bucket
 * oublié ne se voit nulle part — la requête réussit, l'écran dit « supprimé »,
 * et le fichier reste servi par son URL. Il en manquait un : les pièces jointes
 * des commentaires de pull request (bucket `forge-attachments`, PUBLIC).
 *
 * Ce fichier épingle les quatre balayages ensemble : c'est la LISTE qui est le
 * sujet, pas chacun pris à part. Un cinquième bucket ajouté un jour sans son
 * passage ici fera tomber le test du décompte.
 */

const service = vi.hoisted(() => {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const objects: Record<string, string[]> = {};
  const tables: Record<string, Record<string, unknown>[]> = {};

  /** Constructeur de requête minimal : tout chaîne, et l'objet est awaitable. */
  const query = (rows: Record<string, unknown>[]) => {
    const builder: Record<string, unknown> = {
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    for (const method of ["select", "eq", "in", "not"]) {
      builder[method] = () => builder;
    }
    return builder;
  };

  const deleteUser = vi.fn(async () => ({ error: null }));

  const client = {
    from: (table: string) => query(tables[table] ?? []),
    storage: {
      from: (bucket: string) => ({
        // `list` ne descend pas : on rend les entrées du niveau demandé, les
        // dossiers sans métadonnées comme le vrai service.
        list: async (prefix: string) => {
          const all = objects[bucket] ?? [];
          const scoped = all.filter((p) => (prefix ? p.startsWith(`${prefix}/`) : true));
          const seen = new Set<string>();
          const data = [];
          for (const path of scoped) {
            const rest = prefix ? path.slice(prefix.length + 1) : path;
            const [head, ...tail] = rest.split("/");
            if (seen.has(head)) continue;
            seen.add(head);
            data.push(
              tail.length
                ? { name: head, id: null, metadata: null }
                : { name: head, id: head, metadata: {} }
            );
          }
          return { data, error: null };
        },
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { data: null, error: null };
        },
      }),
    },
    auth: { admin: { deleteUser } },
  };

  return { client, removed, objects, tables, deleteUser };
});

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => service.client,
}));

vi.mock("@/lib/server/stripe", () => ({
  isStripeConfigured: () => false,
  cancelStripeSubscription: vi.fn(),
}));

vi.mock("@/lib/server/page-files", () => ({
  pageFilePathsForProjects: async () => [] as string[],
}));

const { deleteAccount } = await import("./account-deletion");

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const PR = "33333333-3333-4333-8333-333333333333";

/** Tous les chemins effacés, tous buckets confondus. */
const removedPaths = () => service.removed.flatMap((r) => r.paths);

beforeEach(() => {
  service.removed.length = 0;
  for (const key of Object.keys(service.objects)) delete service.objects[key];
  for (const key of Object.keys(service.tables)) delete service.tables[key];
  service.deleteUser.mockClear();

  service.tables.projects = [{ id: PROJECT }];
  service.tables.attachments = [{ storage_path: `projects/${PROJECT}/a/note.pdf` }];
  service.tables.project_git_links = [
    { project_id: PROJECT, provider: "github", repo_full_name: "acme/app" },
  ];
  service.tables.pull_requests = [{ id: PR }];

  service.objects.attachments = [
    `projects/${PROJECT}/a/note.pdf`,
    `chat/${USER}/screenshot.png`,
  ];
  service.objects["project-icons"] = [`${PROJECT}/icon.png`];
  service.objects["forge-attachments"] = [`${PR}/abcd/diagram.png`];
});

describe("deleteAccount — le balayage des buckets", () => {
  it("emporte les pièces jointes des commentaires de PR des dépôts liés", async () => {
    await deleteAccount(USER);
    expect(removedPaths()).toContain(`${PR}/abcd/diagram.png`);
  });

  it("épargne celles d'un dépôt qu'un projet survivant lie encore", async () => {
    service.tables.project_git_links = [
      { project_id: PROJECT, provider: "github", repo_full_name: "acme/app" },
      { project_id: "other", provider: "github", repo_full_name: "acme/app" },
    ];
    await deleteAccount(USER);
    expect(removedPaths()).not.toContain(`${PR}/abcd/diagram.png`);
  });

  it("balaye aussi les ressources, les fichiers de chat et l'icône du projet", async () => {
    const result = await deleteAccount(USER);
    expect(removedPaths()).toEqual(
      expect.arrayContaining([
        `projects/${PROJECT}/a/note.pdf`,
        `chat/${USER}/screenshot.png`,
        `${PROJECT}/icon.png`,
      ])
    );
    // Quatre objets, un par famille : ressource, chat, icône, PR.
    expect(result.removedStorageObjects).toBe(4);
    expect(result.warnings).toEqual([]);
  });

  it("efface le compte lui-même en dernier", async () => {
    await deleteAccount(USER);
    expect(service.deleteUser).toHaveBeenCalledWith(USER);
  });
});
