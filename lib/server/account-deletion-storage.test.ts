import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

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
    let filtered = rows;
    let first = 0;
    let last = 999;
    const builder: Record<string, unknown> = {
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: filtered.slice(first, last + 1), error: null }).then(resolve),
      select: () => builder,
      order: () => builder,
      limit: (count: number) => {
        last = first + count - 1;
        return builder;
      },
      gt: (column: string, value: unknown) => {
        filtered = filtered.filter((row) => !(column in row) || String(row[column]) > String(value));
        return builder;
      },
      range: (start: number, end: number) => {
        first = start;
        last = Math.min(end, start + 999);
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filtered = filtered.filter((row) => !(column in row) || row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filtered = filtered.filter((row) => !(column in row) || values.includes(row[column]));
        return builder;
      },
      not: () => builder,
    };
    return builder;
  };

  const deleteUser = vi.fn(async () => ({ error: null }));
  const nativeErase = vi.fn(async (_userId: string) => {});
  const rpc = vi.fn(async (name: string) => ({ data: name === "revoke_agent_sandbox_allocations" ? [] : true, error: null }));

  const client = {
    from: (table: string) => query(tables[table] ?? []),
    rpc,
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
          objects[bucket] = (objects[bucket] ?? []).filter((path) => !paths.includes(path));
          return { data: null, error: null };
        },
        download: async (path: string) => (objects[bucket] ?? []).includes(path)
          ? { data: new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])]), error: null }
          : { data: null, error: { message: "Object not found" } },
      }),
    },
    auth: { admin: { deleteUser } },
  };

  return { client, removed, objects, tables, deleteUser, rpc, nativeErase };
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

vi.mock("@/lib/server/agent/native-prototype/connections", () => ({
  eraseNativePrototypeAccount: service.nativeErase,
}));

const { deleteAccount } = await import("./account-deletion");
const { GET: readForgeAttachment } = await import("@/app/api/pr-attachments/[...path]/route");

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
  service.rpc.mockClear();
  service.nativeErase.mockReset();
  service.nativeErase.mockResolvedValue(undefined);

  service.tables.projects = [{ id: PROJECT }];
  service.tables.attachments = [{ storage_path: `projects/${PROJECT}/a/note.pdf` }];
  service.tables.project_git_links = [
    { project_id: PROJECT, provider: "github", repo_full_name: "acme/app" },
  ];
  service.tables.pull_requests = [{ id: PR, provider: "github", repo_full_name: "acme/app" }];
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

  it("removes a merged PR's old object before deleting its last linked project", async () => {
    const oldPr = "55555555-5555-4555-8555-555555555555";
    const asset = "66666666-6666-4666-8666-666666666666";
    const oldPath = `${oldPr}/${asset}/historical.png`;
    service.tables.forge_attachment_legacy_pr_aliases = [
      { old_pr_id: oldPr, current_pr_id: PR },
    ];
    service.objects["forge-attachments"].push(oldPath);

    const request = new Request(`https://minddy.test/api/pr-attachments/${oldPath}`);
    const context = { params: Promise.resolve({ path: oldPath.split("/") }) };
    expect((await readForgeAttachment(request, context)).status).toBe(200);

    await deleteAccount(USER);

    expect(service.objects["forge-attachments"]).not.toContain(oldPath);
    const response = await readForgeAttachment(request, context);
    expect(response.status).toBe(404);
  });

  it("keeps a surviving project's historical objects in a shared repository", async () => {
    const survivor = "44444444-4444-4444-8444-444444444444";
    const oldPr = "55555555-5555-4555-8555-555555555555";
    const doomedPath = `${oldPr}/66666666-6666-4666-8666-666666666666/doomed.png`;
    const survivingPath = `${oldPr}/77777777-7777-4777-8777-777777777777/survivor.png`;
    const ownerlessPath = `${oldPr}/88888888-8888-4888-8888-888888888888/unknown.png`;
    const digest = (path: string) => createHash("sha256").update(path).digest("hex");
    service.tables.project_git_links.push({
      project_id: survivor, provider: "github", repo_full_name: "acme/app",
    });
    service.tables.forge_attachment_legacy_pr_aliases = [
      { old_pr_id: oldPr, current_pr_id: PR },
    ];
    service.tables.forge_attachment_legacy_owners = [
      { old_path_digest: digest(doomedPath), project_id: PROJECT },
      { old_path_digest: digest(survivingPath), project_id: survivor },
    ];
    service.objects["forge-attachments"].push(
      doomedPath, survivingPath, ownerlessPath,
    );

    await deleteAccount(USER);

    expect(service.objects["forge-attachments"]).not.toContain(doomedPath);
    expect(service.objects["forge-attachments"]).toEqual(expect.arrayContaining([
      survivingPath, ownerlessPath,
    ]));
  });

  it("finds a surviving project beyond PostgREST's first result page", async () => {
    const oldPr = "55555555-5555-4555-8555-555555555555";
    const oldPath = `${oldPr}/66666666-6666-4666-8666-666666666666/retained.png`;
    service.tables.forge_attachment_legacy_pr_aliases = [
      { old_pr_id: oldPr, current_pr_id: PR },
    ];
    service.objects["forge-attachments"].push(oldPath);
    for (let index = 0; index < 999; index++) {
      service.tables.project_git_links.push({
        project_id: `unrelated-${index}`, provider: "github",
        repo_full_name: `unrelated/repo-${index}`,
      });
    }
    service.tables.project_git_links.push({
      project_id: "survivor", provider: "github", repo_full_name: "acme/app",
    });

    await deleteAccount(USER);

    expect(service.objects["forge-attachments"]).toContain(oldPath);
  });

  it("collects historical paths beyond the first PR and alias result pages", async () => {
    const finalPr = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const finalAlias = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const oldPath = `${finalAlias}/66666666-6666-4666-8666-666666666666/paged.png`;
    const pagedId = (index: number) =>
      `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
    service.tables.pull_requests = Array.from({ length: 1000 }, (_, index) => ({
      id: pagedId(index), provider: "github", repo_full_name: "acme/app",
    }));
    service.tables.pull_requests.push({
      id: finalPr, provider: "github", repo_full_name: "acme/app",
    });
    service.tables.forge_attachment_legacy_pr_aliases = Array.from(
      { length: 1000 }, (_, index) => ({
        old_pr_id: pagedId(index), current_pr_id: finalPr,
      }),
    );
    service.tables.forge_attachment_legacy_pr_aliases.push({
      old_pr_id: finalAlias, current_pr_id: finalPr,
    });
    service.objects["forge-attachments"] = [oldPath];

    await deleteAccount(USER);

    expect(service.objects["forge-attachments"]).not.toContain(oldPath);
  });

  it("removes only the deleted project's opaque forge objects when a repository is shared", async () => {
    const survivingProject = "44444444-4444-4444-8444-444444444444";
    const protectedPath = `projects/${PROJECT}/forge/opaque-token/generation`;
    const orphanPath = `projects/${PROJECT}/forge/abandoned/generation`;
    const survivingPath = `projects/${survivingProject}/forge/other-token/generation`;
    service.tables.project_git_links = [
      { project_id: PROJECT, provider: "github", repo_full_name: "acme/app" },
      { project_id: survivingProject, provider: "github", repo_full_name: "acme/app" },
    ];
    service.objects["forge-attachments"].push(protectedPath, orphanPath, survivingPath);

    await deleteAccount(USER);

    expect(removedPaths()).toEqual(expect.arrayContaining([protectedPath, orphanPath]));
    expect(removedPaths()).not.toContain(survivingPath);
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

  it("stops native subscription runtimes after the committed fence and before deleting Auth keys", async () => {
    await deleteAccount(USER);
    expect(service.rpc.mock.calls[0][0]).toBe("begin_agent_account_erasure");
    expect(service.nativeErase).toHaveBeenCalledWith(USER);
    expect(service.rpc.mock.invocationCallOrder[0]).toBeLessThan(service.nativeErase.mock.invocationCallOrder[0]);
    expect(service.nativeErase.mock.invocationCallOrder[0]).toBeLessThan(service.deleteUser.mock.invocationCallOrder[0]);
  });

  it("retains the account and control descriptors when a native runtime cannot be stopped", async () => {
    service.nativeErase.mockRejectedValueOnce(new Error("Native sandbox stop is unconfirmed"));
    await expect(deleteAccount(USER)).rejects.toThrow("stop is unconfirmed");
    expect(service.rpc.mock.calls[0][0]).toBe("begin_agent_account_erasure");
    expect(service.deleteUser).not.toHaveBeenCalled();
    expect(service.removed).toEqual([]);

    await deleteAccount(USER);
    expect(service.nativeErase).toHaveBeenCalledTimes(2);
    expect(service.deleteUser).toHaveBeenCalledTimes(1);
  });
});
