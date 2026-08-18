import { describe, expect, it } from "vitest";
import { getUserStats } from "@/lib/server/stats";
import { canonicalSql, readBaseline } from "@/test/sql-migrations";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LES DURÉES PAR EFFORT SONT DES MÉDIANES, DES DEUX CÔTÉS DU RPC.
 *
 * La mesure vit en deux morceaux — la fonction SQL `get_cycle_stats` qui la
 * calcule, et le mapping qui la lit ici — et chacun est juste tout seul : une
 * moyenne côté base reste une moyenne parfaitement valide, et un lecteur de
 * `median_seconds` reste un lecteur parfaitement valide. La faute n'existerait
 * qu'ENTRE les deux, et elle ne se verrait pas : des barres plausibles, un
 * libellé « médiane », et des moyennes derrière. D'où les deux moitiés testées
 * ici, la SQL comprise.
 */

/** Sortie brute du RPC cycles, avec les seules clés que le mapping lit. */
type RawEffort = Record<string, unknown>;

function fakeSupabase(byEffort: RawEffort[]) {
  const cycleStats = {
    avg_completion_offset_days: -1.5,
    completion_offset_sample: 4,
    avg_issues_per_cycle: 6,
    cycle_count: 2,
    by_effort: byEffort,
  };
  // La requête « charge actuelle » : chaînable, et thenable au bout puisque
  // getUserStats l'attend directement dans son Promise.all.
  const workload = {
    select: () => workload,
    is: () => workload,
    eq: () => workload,
    not: () => workload,
    then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return {
    rpc: async (name: string) =>
      name === "get_cycle_stats"
        ? { data: cycleStats, error: null }
        : { data: { totals: {}, per_project: [], days: [] }, error: null },
    from: () => workload,
  } as unknown as SupabaseClient;
}

const call = (byEffort: RawEffort[]) =>
  getUserStats(fakeSupabase(byEffort), { tz: "Europe/Paris", userId: "user-1" });

describe("getUserStats — durées par effort", () => {
  it("lit les médianes du RPC, dans l'ordre xs→xl", async () => {
    const stats = await call([
      { effort: "l", median_seconds: "172800", sample: 3 },
      { effort: "xs", median_seconds: 1800, sample: 12 },
      { effort: "m", median_seconds: 43200, sample: 7 },
    ]);

    expect(stats.cycles.byEffort).toEqual([
      { effort: "xs", medianSeconds: 1800, sample: 12 },
      { effort: "m", medianSeconds: 43200, sample: 7 },
      { effort: "l", medianSeconds: 172800, sample: 3 },
    ]);
  });

  it("écarte un effort sans échantillon", async () => {
    const stats = await call([
      { effort: "s", median_seconds: 0, sample: 0 },
      { effort: "m", median_seconds: 3600, sample: 1 },
    ]);

    expect(stats.cycles.byEffort.map((e) => e.effort)).toEqual(["m"]);
  });

  it("ne retombe PAS sur l'ancienne moyenne quand la migration n'est pas passée", async () => {
    // Fonction d'avant la migration : elle ne rend que `avg_seconds`. Afficher
    // cette valeur sous le libellé « médiane » serait un chiffre faux et muet ;
    // la section s'efface le temps que la base rattrape le code.
    const stats = await call([{ effort: "m", avg_seconds: 999_999, sample: 9 }]);

    expect(stats.cycles.byEffort).toEqual([]);
  });

  it("garde les moyennes des deux autres mesures, qui n'ont pas cette traîne", async () => {
    const stats = await call([]);

    expect(stats.cycles.avgCompletionOffsetDays).toBe(-1.5);
    expect(stats.cycles.avgIssuesPerCycle).toBe(6);
  });
});

describe("get_cycle_stats (SQL) — l'autre moitié du contrat", () => {
  const sql = canonicalSql(readBaseline());

  it("agrège les durées par percentile_cont(0.5), pas par avg", () => {
    expect(sql).toContain("percentile_cont(0.5) within group (order by secs)");
    expect(sql).not.toContain("avg(secs)");
  });

  it("expose la clé median_seconds que le mapping lit", () => {
    expect(sql).toContain("'median_seconds'");
    expect(sql).not.toContain("'avg_seconds'");
  });
});
