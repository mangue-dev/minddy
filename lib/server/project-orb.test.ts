import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La relance du tirage de l'orbe. On ne moque que ce qui SORT du process — la
 * base —, et on regarde ce qui part dedans.
 *
 * Ce que le test tient : le tirage se fait DANS le code, pas dans la base. La
 * valeur par défaut d'une colonne ne s'applique qu'à l'insertion, et PostgREST
 * ne sait pas écrire `set orb_seed = gen_random_uuid()` : une relance qui
 * n'enverrait pas de graine écrirait `null`, c'est-à-dire remettrait l'orbe à sa
 * couleur d'origine — l'exact contraire du geste demandé.
 */
const updates: Array<{ fields: Record<string, unknown>; id: string }> = [];
let updateError: { message: string } | null = null;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("projects");
      return {
        update: (fields: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            updates.push({ fields, id });
            return { error: updateError };
          },
        }),
      };
    },
  }),
}));

const { regenerateProjectOrbSeed } = await import("./project-orb");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  updates.length = 0;
  updateError = null;
});

describe("regenerateProjectOrbSeed", () => {
  it("écrit une graine tirée ici, et rend celle qui a été posée", async () => {
    const seed = await regenerateProjectOrbSeed(PROJECT);

    expect(seed).toMatch(UUID_RE);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ fields: { orb_seed: seed }, id: PROJECT });
  });

  it("tire une graine NEUVE à chaque appel", async () => {
    // Sans ça, « Nouvelle orbe » ne changerait rien la deuxième fois — et le
    // bouton se cliquerait dans le vide sans rien dire.
    const first = await regenerateProjectOrbSeed(PROJECT);
    const second = await regenerateProjectOrbSeed(PROJECT);
    expect(second).not.toBe(first);
  });

  it("lève quand la base refuse — la route répond alors 500", async () => {
    updateError = { message: "permission denied" };
    await expect(regenerateProjectOrbSeed(PROJECT)).rejects.toThrow(
      "permission denied",
    );
  });
});
