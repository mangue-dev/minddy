import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * What account deletion leaves, or does not leave, in storage buckets.
 *
 * Rows cascade with `auth.users`, but bytes do not. Every bucket carrying
 * personal data must be scanned explicitly; otherwise deletion succeeds while
 * a file remains available at its public URL.
 *
 * This test pins all storage families together. Adding a new personal bucket
 * without extending account erasure must break the object-count assertion.
 */

const service = vi.hoisted(() => {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const objects: Record<string, string[]> = {};
  const tables: Record<string, Record<string, unknown>[]> = {};

  /** Minimal query constructor: any string, and the object is awaitable. */
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
        // `list` does not go down: we return the entries of the requested level, the
        // folders without metadata like the real service.
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

/** All paths deleted, all buckets combined. */
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
  service.tables.user_avatars = [{ image_path: `users/${USER}.webp` }];

  service.objects.attachments = [
    `projects/${PROJECT}/a/note.pdf`,
    `chat/${USER}/screenshot.png`,
  ];
  service.objects["project-icons"] = [`${PROJECT}/icon.png`];
  service.objects["forge-attachments"] = [`${PR}/abcd/diagram.png`];
  service.objects["user-avatars"] = [`users/${USER}.webp`];
});

describe("deleteAccount storage cleanup", () => {
  it("removes pull-request comment attachments from linked repositories", async () => {
    await deleteAccount(USER);
    expect(removedPaths()).toContain(`${PR}/abcd/diagram.png`);
  });

  it("keeps forge attachments while a surviving project still links the repository", async () => {
    service.tables.project_git_links = [
      { project_id: PROJECT, provider: "github", repo_full_name: "acme/app" },
      { project_id: "other", provider: "github", repo_full_name: "acme/app" },
    ];
    await deleteAccount(USER);
    expect(removedPaths()).not.toContain(`${PR}/abcd/diagram.png`);
  });

  it("removes resources, chat files, project icons, and the user avatar", async () => {
    const result = await deleteAccount(USER);
    expect(removedPaths()).toEqual(
      expect.arrayContaining([
        `projects/${PROJECT}/a/note.pdf`,
        `chat/${USER}/screenshot.png`,
        `${PROJECT}/icon.png`,
        `users/${USER}.webp`,
      ])
    );
    // Five objects, one per family: resource, chat, icon, PR, and avatar.
    expect(result.removedStorageObjects).toBe(5);
    expect(result.warnings).toEqual([]);
  });

  it("deletes the auth account after storage cleanup", async () => {
    await deleteAccount(USER);
    expect(service.deleteUser).toHaveBeenCalledWith(USER);
  });
});
