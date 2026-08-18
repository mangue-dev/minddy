import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Restarting the orb draw. We only mock what COMES OUT of the process — the
 * base —, and we look at what goes in.
 *
 * What the test holds: the draw is done IN the code, not in the base. The
 * default value of a column only applies to insertion, and PostgREST
 * cannot write `set orb_seed = gen_random_uuid()`: a restart which
 * would not send a seed would write `null`, i.e. would put the orb back to sa
 * original color — the exact opposite of the requested gesture.
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
  it("writes a seed drawn here and returns the one that was stored", async () => {
    const seed = await regenerateProjectOrbSeed(PROJECT);

    expect(seed).toMatch(UUID_RE);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ fields: { orb_seed: seed }, id: PROJECT });
  });

  it("draws a NEW seed on every call", async () => {
    // Without that, “New Orb” wouldn’t change anything the second time around — and the
    // button would click in the void without saying anything.
    const first = await regenerateProjectOrbSeed(PROJECT);
    const second = await regenerateProjectOrbSeed(PROJECT);
    expect(second).not.toBe(first);
  });

  it("throws when the database rejects — the route then returns 500", async () => {
    updateError = { message: "permission denied" };
    await expect(regenerateProjectOrbSeed(PROJECT)).rejects.toThrow(
      "permission denied",
    );
  });
});
