import { describe, expect, it, vi } from "vitest";

/**
 * `last_activity_at` A DEUX LECTEURS, ET UN SEUL ÉCRIVAIN QUAND LE RUN TRAVAILLE.
 *
 * Les deux lecteurs vivent dans [drain.ts](drain.ts) et portent sur des
 * populations DISJOINTES : le reaper d'inactivité ne regarde que les runs au repos
 * (il coupe leur microVM), le chien de garde des microVM ne regarde que les runs
 * `running` (il constate la mort de leur boucle).
 *
 * D'où la règle que ce test garde : le heartbeat du client et le steer ne
 * rafraîchissent cette horloge QUE sur un run au repos. Sur un run qui travaille,
 * leur bump n'apportait rien au premier lecteur — et il aveuglait le second. La
 * conversation ouverte dans un onglet bat toutes les 45 s, le chien de garde ne
 * sonde qu'après trois minutes de silence : un tour dont le process était mort
 * restait donc `running` pour toujours tant que quelqu'un le regardait,
 * c'est-à-dire exactement quand on le regardait le plus. Impossible à arrêter,
 * impossible à guider, supprimé à la main en production.
 */

const h = vi.hoisted(() => ({
  /** Les contraintes posées sur l'UPDATE, dans l'ordre où le code les écrit. */
  filters: [] as Array<{ op: string; column: string; value: unknown }>,
  updated: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        h.updated = fields;
        const chain = {
          eq: (column: string, value: unknown) => {
            h.filters.push({ op: "eq", column, value });
            return chain;
          },
          neq: (column: string, value: unknown) => {
            h.filters.push({ op: "neq", column, value });
            return Promise.resolve({});
          },
        };
        return chain;
      },
    }),
  }),
}));

const { bumpRunActivity } = await import("./runs");

describe("bumpRunActivity", () => {
  it("ne touche pas à l'horloge d'un run qui TRAVAILLE", async () => {
    await bumpRunActivity("run-1");
    expect(h.updated).toHaveProperty("last_activity_at");
    expect(h.filters).toEqual([
      { op: "eq", column: "id", value: "run-1" },
      // La garde qui rend l'horloge lisible par le chien de garde : sur un run
      // `running`, son seul écrivain est la boucle elle-même (sa sauvegarde
      // périodique de checkpoint, cf. control-plane.ts).
      { op: "neq", column: "status", value: "running" },
    ]);
  });
});
