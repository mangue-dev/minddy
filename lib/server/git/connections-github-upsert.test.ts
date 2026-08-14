import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-324 — la clé de conflit d'`upsertGithubConnection` est le seul
 * `installation_id`, et son `update` réécrivait `user_id` : un appelant qui
 * énumérait ces identifiants (de petits entiers séquentiels) se réattribuait les
 * installations des autres locataires, donc leurs dépôts privés.
 *
 * Ce que ce test tient : une ligne existante ne change plus de main, et elle
 * n'est pas non plus modifiée au passage.
 */

const updates: { payload: Record<string, unknown>; id: unknown }[] = [];
const inserts: Record<string, unknown>[] = [];
let existing: { id: string; user_id: string } | null = null;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: existing }) }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async (_col: string, id: unknown) => {
          updates.push({ payload, id });
          return {};
        },
      }),
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            inserts.push(payload);
            return { data: { id: "new-connection" }, error: null };
          },
        }),
      }),
    }),
  }),
}));

const { upsertGithubConnection, GithubInstallationOwnedByAnotherUserError } =
  await import("./connections");

const PARAMS = {
  userId: "owner",
  installationId: 4242,
  accountLogin: "acme",
  accountType: "Organization",
  repositorySelection: "selected",
};

beforeEach(() => {
  updates.length = 0;
  inserts.length = 0;
  existing = null;
});

describe("upsertGithubConnection", () => {
  it("insère quand l'installation est inconnue", async () => {
    const id = await upsertGithubConnection(PARAMS);
    expect(id).toBe("new-connection");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ user_id: "owner", installation_id: 4242 });
  });

  it("met à jour la ligne de son propre détenteur", async () => {
    existing = { id: "conn-1", user_id: "owner" };
    const id = await upsertGithubConnection(PARAMS);
    expect(id).toBe("conn-1");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ account_login: "acme" });
    // Et surtout : plus de `user_id` dans le payload, même pour le bon compte.
    expect(updates[0].payload).not.toHaveProperty("user_id");
  });

  it("lève, sans rien écrire, quand la ligne appartient à quelqu'un d'autre", async () => {
    existing = { id: "conn-1", user_id: "victime" };
    await expect(upsertGithubConnection(PARAMS)).rejects.toBeInstanceOf(
      GithubInstallationOwnedByAnotherUserError,
    );
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("ne dit pas à qui appartient l'installation", async () => {
    existing = { id: "conn-1", user_id: "victime" };
    const err = await upsertGithubConnection(PARAMS).catch((e: Error) => e);
    expect((err as Error).message).not.toContain("victime");
    expect((err as Error).message).not.toContain("conn-1");
  });
});
