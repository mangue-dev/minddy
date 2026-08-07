import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-224 — le chien de garde ne PRÉSUME pas, il constate.
 *
 * CE QU'IL REMPLACE, et pourquoi le remplacement n'est pas cosmétique.
 * `requeueStuckRuns` déclarait mort tout run `running` silencieux depuis vingt
 * minutes, puis lui volait son claim. C'était tenable tant qu'un chunk durait
 * cinq minutes. Un tour qui vit dans la microVM peut travailler des heures sans
 * écrire un event — un `npm test` qui dure, un modèle qui réfléchit — et le vieux
 * balayeur le tuerait en pleine santé, pour relancer une SECONDE boucle sur la
 * même microVM. Le second checkpoint écraserait le premier.
 *
 * Le nouveau demande à la plateforme si le process vit. Trois réponses, et les
 * deux qui ne sont pas « mort » ne font RIEN. C'est ça que ces tests gardent : un
 * chien de garde qui conclut sur un silence de l'API est pire que pas de chien de
 * garde du tout.
 */

const h = vi.hoisted(() => ({
  /** Ce que la plateforme répond : true vivant, false mort, null « on ne sait pas ». */
  alive: null as boolean | null,
  probes: [] as Array<{ sandbox: string; command: string }>,
  events: [] as Array<{ runId: string; type: string; payload: Record<string, unknown> }>,
  stamped: [] as Array<{ runId: string; fields: Record<string, unknown> }>,
  notifications: [] as string[],
  revoked: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  /** Les lignes de compute écrites — la moitié de la facture que personne
   *  d'autre ne tient sur ce chemin. */
  compute: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/usage", () => ({
  recordSandboxUsage: vi.fn(async (params: Record<string, unknown>) => {
    h.compute.push(params);
  }),
}));

vi.mock("./sandbox", () => ({
  isLoopCommandAlive: vi.fn(async (sandbox: string, command: string) => {
    h.probes.push({ sandbox, command });
    return h.alive;
  }),
  stopSandboxByName: vi.fn(async () => {}),
}));

vi.mock("./runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runs")>()),
  appendEvent: vi.fn(async (runId: string, type: string, payload: Record<string, unknown>) => {
    h.events.push({ runId, type, payload });
  }),
  stampRun: vi.fn(async (runId: string, fields: Record<string, unknown>) => {
    h.stamped.push({ runId, fields });
    return { id: runId } as never;
  }),
  notifyAgentRun: vi.fn(async (_run: unknown, type: string) => {
    h.notifications.push(type);
  }),
  requeueStuckRuns: vi.fn(async () => {}),
  claimRun: vi.fn(async () => null),
}));

vi.mock("./run-key", () => ({
  revokeRunKey: vi.fn(async (hash: string) => {
    h.revoked.push(hash);
  }),
}));

vi.mock("./execute", () => ({ executeAgentRun: vi.fn(async () => "completed") }));

const { reapDeadVmRuns } = await import("./drain");

/** Client Supabase minimal : le SELECT du chien de garde et l'UPDATE de la clé. */
function fakeService() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    lt: () => builder,
    limit: async () => ({ data: h.rows }),
    update: (fields: Record<string, unknown>) => {
      h.updates.push(fields);
      return { eq: async () => ({}) };
    },
  };
  return { from: () => builder } as never;
}

/** Le tour a démarré il y a une heure — c'est ce que la microVM a coûté. */
const STARTED_MS_AGO = 60 * 60_000;

const ROW = {
  id: "run-1",
  sandbox_id: "agent-run-1",
  loop_command_id: "cmd-42",
  created_by: "user-1",
  project_id: "proj-1",
  issue_id: "issue-1",
  provider_key_id: "hash-1",
  run_id: "ledger-run-1",
  routine_id: null,
  continuations: 0,
  started_at: new Date(Date.now() - STARTED_MS_AGO).toISOString(),
};

beforeEach(() => {
  h.alive = null;
  h.probes.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.notifications.length = 0;
  h.revoked.length = 0;
  h.updates.length = 0;
  h.compute.length = 0;
  h.rows = [{ ...ROW }];
});

describe("reapDeadVmRuns", () => {
  it("ne touche à RIEN quand le process vit, si silencieux soit-il", async () => {
    h.alive = true;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(h.probes).toEqual([{ sandbox: "agent-run-1", command: "cmd-42" }]);
    expect(reaped).toBe(0);
    expect(h.stamped).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  it("ne touche à RIEN quand la plateforme ne sait pas répondre", async () => {
    // microVM introuvable, session expirée, API en panne. Conclure ici remettrait
    // au repos des tours en pleine santé, sur la seule foi d'un silence.
    h.alive = null;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
    expect(h.stamped).toHaveLength(0);
  });

  it("sur un process MORT : le fil parle D'ABORD, puis la ligne repose", async () => {
    h.alive = false;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(1);
    // L'ordre compte : si le stamp échoue derrière, l'utilisateur aura quand même
    // lu pourquoi son tour s'est arrêté.
    expect(h.events[0]).toMatchObject({ runId: "run-1", type: "error" });
    expect(h.events[0].payload.code).toBe("turnLost");
    expect(h.stamped[0].fields).toMatchObject({
      status: "completed",
      loop_command_id: null,
    });
    expect(h.notifications).toEqual(["agent_failed"]);
  });

  it("NE TOUCHE PAS au checkpoint — c'est de lui que le tour suivant repart", async () => {
    // La boucle en sauvegarde un toutes les cinq minutes, à une frontière de round
    // sûre. L'écraser (ou l'effacer, comme le vieux balayeur au bout de ses
    // tentatives) perdrait tout ce que le tour avait compris.
    h.alive = false;
    await reapDeadVmRuns(fakeService());
    expect(Object.keys(h.stamped[0].fields)).not.toContain("checkpoint");
  });

  it("révoque la clé du run mort", async () => {
    h.alive = false;
    await reapDeadVmRuns(fakeService());
    expect(h.revoked).toEqual(["hash-1"]);
    expect(h.updates).toContainEqual({ provider_key_id: null });
  });

  it("FACTURE le compute de la microVM — sinon il disparaît en silence", async () => {
    // Dans la nouvelle forme, le wall-clock est tenu par la boucle et remonté
    // dans son rapport de fin de tour ; la fonction ne facture plus rien de son
    // côté. Un tour dont le process meurt ne rend jamais ce rapport : sans cette
    // ligne, le réveil, le clone et les heures de VM sortent de tous les
    // compteurs, et personne ne s'en apercevrait avant la facture Vercel.
    h.alive = false;
    await reapDeadVmRuns(fakeService());
    expect(h.compute).toHaveLength(1);
    expect(h.compute[0]).toMatchObject({
      // L'identifiant du LEDGER, pas celui de la ligne — c'est sous lui que la
      // dépense d'un run repris se compte.
      runId: "ledger-run-1",
      feature: "sandbox_compute",
      projectId: "proj-1",
      billTo: { userId: "user-1" },
    });
    expect(h.compute[0].durationMs as number).toBeGreaterThanOrEqual(STARTED_MS_AGO);
  });

  it("range le compute d'une ROUTINE avec elle, pas sous « Agents »", async () => {
    h.alive = false;
    h.rows = [{ ...ROW, routine_id: "routine-1" }];
    await reapDeadVmRuns(fakeService());
    expect(h.compute[0]).toMatchObject({ feature: "routine_compute" });
  });

  it("ne facture rien sans date de départ — mieux vaut zéro qu'un chiffre inventé", async () => {
    h.alive = false;
    h.rows = [{ ...ROW, started_at: null }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    // Le run est bien mis au repos : le métrage est un à-côté, jamais un
    // prérequis de la conclusion.
    expect(reaped).toBe(1);
    expect(h.compute).toHaveLength(0);
  });

  it("ne facture rien sur un process VIVANT", async () => {
    h.alive = true;
    await reapDeadVmRuns(fakeService());
    expect(h.compute).toHaveLength(0);
  });

  it("ignore une ligne sans identifiant de commande — rien à interroger", async () => {
    h.alive = false;
    h.rows = [{ ...ROW, loop_command_id: null }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(h.probes).toHaveLength(0);
    expect(reaped).toBe(0);
  });
});
