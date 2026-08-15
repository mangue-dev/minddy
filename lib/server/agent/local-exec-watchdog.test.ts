import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-355 — LE CHIEN DE GARDE ET LES RUNS QU'ON NE PEUT PAS INTERROGER.
 *
 * `reapDeadVmRuns` ne présume rien : il DEMANDE à la plateforme si le process vit.
 * Un run local n'a ni microVM ni commande — il n'y a personne à qui poser la
 * question, jamais. Il tombait donc dans la branche « jamais lancé », dont les
 * quinze minutes ne sont fondées que parce qu'un amorçage de microVM dure vingt
 * secondes : trois minutes de silence sur un run vieux d'un quart d'heure
 * suffisaient à le déclarer mort, publier « l'agent s'est arrêté » et facturer du
 * compute que personne n'a consommé.
 *
 * Les deux moitiés du correctif sont ici : la BORNE (celle du cas cloud
 * indéterminé, deux heures) et la FACTURE (aucune — il n'y a pas eu de microVM).
 */

const h = vi.hoisted(() => ({
  /** Les runs sondés auprès de la plateforme. Un run local n'y apparaît jamais. */
  probed: [] as string[],
  stamped: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  events: [] as Array<{ runId: string; type: string }>,
  computeLines: [] as Array<{ runId: string; durationMs: number }>,
  revokedKeys: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("./sandbox", () => ({
  isLoopCommandAlive: vi.fn(async (sandboxId: string) => {
    h.probed.push(sandboxId);
    return null; // « on ne sait pas » — le cas que ce test met sous tension.
  }),
  stopSandboxByName: vi.fn(async () => {}),
}));

vi.mock("./runs", () => ({
  stampRun: vi.fn(async (id: string, fields: Record<string, unknown>) => {
    h.stamped.push({ id, fields });
    return { id };
  }),
  appendEvent: vi.fn(async (runId: string, type: string) => {
    h.events.push({ runId, type });
  }),
  notifyAgentRun: vi.fn(async () => {}),
  claimRun: vi.fn(async () => null),
}));

vi.mock("@/lib/server/usage", () => ({
  recordSandboxUsage: vi.fn(async (line: { runId: string; durationMs: number }) => {
    h.computeLines.push({ runId: line.runId, durationMs: line.durationMs });
  }),
}));

vi.mock("@/lib/server/ai-usage", () => ({
  spentFromLedger: vi.fn(async () => 0),
}));

vi.mock("./run-key", () => ({
  revokeRunKey: vi.fn(async (id: string) => {
    h.revokedKeys.push(id);
  }),
}));

vi.mock("./execute", () => ({ executeAgentRun: vi.fn(async () => {}) }));
vi.mock("./deployment", () => ({ currentDeploymentScope: () => null }));
vi.mock("./pr-landing", () => ({ SANDBOX_USAGE_SEQ_BASE: 900_000 }));

import { reapDeadVmRuns } from "./drain";

const MINUTE = 60_000;
const RUN_ID = "11111111-2222-4333-8444-555555555555";

/** Une ligne de run local, silencieuse et lancée depuis `agedMinutes`. */
function localRow(agedMinutes: number) {
  const at = new Date(Date.now() - agedMinutes * MINUTE).toISOString();
  return {
    id: RUN_ID,
    sandbox_id: null,
    loop_command_id: null,
    local_exec: true,
    created_by: "user-1",
    project_id: "proj-1",
    issue_id: "issue-1",
    provider_key_id: "key-1",
    run_id: RUN_ID,
    routine_id: null,
    continuations: 0,
    started_at: at,
    last_activity_at: at,
    cost_usd: 0,
  };
}

/** Le strict nécessaire du client Supabase : une lecture, puis des écritures. */
function fakeService(rows: unknown[]): SupabaseClient {
  const write = {
    update: (fields: Record<string, unknown>) => {
      h.updates.push(fields);
      return { eq: () => ({ eq: () => ({}) }) };
    },
    select: () => ({
      eq: () => ({
        lt: () => ({ limit: async () => ({ data: rows }) }),
      }),
    }),
  };
  return { from: () => write } as unknown as SupabaseClient;
}

beforeEach(() => {
  h.probed.length = 0;
  h.stamped.length = 0;
  h.events.length = 0;
  h.computeLines.length = 0;
  h.revokedKeys.length = 0;
  h.updates.length = 0;
});

describe("un run qui joue sur la machine de l'utilisateur", () => {
  it("survit à vingt minutes de silence — le quart d'heure ne le vise plus", async () => {
    // Le cas ordinaire qu'on cassait : un Mac qui dort, un tour qui pense. Le
    // harness écrit `last_activity_at` toutes les deux minutes, mais rien ne
    // garantit qu'une machine réponde en continu — et il n'y a personne à sonder.
    const { reaped } = await reapDeadVmRuns(fakeService([localRow(20)]));
    expect(reaped).toBe(0);
    expect(h.stamped).toEqual([]);
    expect(h.events).toEqual([]);
    // Et on n'a interrogé personne : il n'y a ni microVM ni commande.
    expect(h.probed).toEqual([]);
  });

  it("est conclu au-delà de la borne, comme un run cloud dont l'API se tait", async () => {
    const { reaped } = await reapDeadVmRuns(fakeService([localRow(180)]));
    expect(reaped).toBe(1);
    expect(h.stamped[0]?.fields.status).toBe("completed");
    // Le fil le DIT — c'est ce qui distingue « l'agent s'est arrêté et voilà
    // pourquoi » d'une conversation qui ne répond plus.
    expect(h.events).toEqual([{ runId: RUN_ID, type: "error" }]);
    // La clé du modèle, elle, est bien révoquée : elle, elle existait.
    expect(h.revokedKeys).toEqual(["key-1"]);
  });

  it("ne facture AUCUNE minute de microVM — il n'y en a pas eu", async () => {
    await reapDeadVmRuns(fakeService([localRow(180)]));
    expect(h.computeLines).toEqual([]);
  });

  it("laisse intacte la borne d'amorçage d'une microVM sans commande", async () => {
    // La branche « jamais lancé » garde son sens là où elle en a un : une fonction
    // morte entre le claim et le lancement, dont l'amorçage dure vingt secondes.
    const cloud = { ...localRow(20), local_exec: false };
    await reapDeadVmRuns(fakeService([cloud]));
    expect(h.stamped[0]?.fields.status).toBe("completed");
    expect(h.computeLines).toHaveLength(1);
  });
});
