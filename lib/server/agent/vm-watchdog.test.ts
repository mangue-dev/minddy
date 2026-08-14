import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-224 — le chien de garde ne PRÉSUME pas, il constate.
 *
 * CE QU'IL REMPLACE, et pourquoi le remplacement n'est pas cosmétique.
 * Le balayeur par présomption (retiré en MIN-225) déclarait mort tout run
 * `running` silencieux depuis vingt
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
  /** Le stamp est refusé : quelqu'un a conclu le run entre-temps. */
  stampRefused: false,
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
  /** Ce que le ledger répond ; `null` = la lecture a échoué. */
  ledgerSpend: null as number | null,
  /** L'ordre des deux gestes de facturation, pour garder « le compute d'abord ». */
  order: [] as string[],
}));

vi.mock("@/lib/server/usage", () => ({
  recordSandboxUsage: vi.fn(async (params: Record<string, unknown>) => {
    h.order.push("compute");
    h.compute.push(params);
  }),
}));

vi.mock("@/lib/server/ai-usage", () => ({
  spentFromLedger: vi.fn(async () => {
    h.order.push("ledger");
    return h.ledgerSpend;
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
    return h.stampRefused ? null : ({ id: runId } as never);
  }),
  notifyAgentRun: vi.fn(async (_run: unknown, type: string) => {
    h.notifications.push(type);
  }),
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
  last_activity_at: new Date(Date.now() - STARTED_MS_AGO).toISOString(),
  cost_usd: 0,
};

/** Une date vieille de `ms`, au format de la base. */
const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
  h.alive = null;
  h.stampRefused = false;
  h.probes.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.notifications.length = 0;
  h.revoked.length = 0;
  h.updates.length = 0;
  h.compute.length = 0;
  h.order.length = 0;
  h.ledgerSpend = null;
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

  it("sur un process MORT : la ligne repose, et le fil le dit", async () => {
    h.alive = false;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(1);
    expect(h.stamped[0].fields).toMatchObject({
      status: "completed",
      loop_command_id: null,
    });
    expect(h.events[0]).toMatchObject({ runId: "run-1", type: "error" });
    expect(h.events[0].payload.code).toBe("turnLost");
    expect(h.notifications).toEqual(["agent_failed"]);
  });

  /**
   * LE FAUX POSITIF QU'ON A LU EN PRODUCTION (run de la PR 51). Le stamp ne peut
   * échouer que d'une façon — sa garde `status in ('running')` ne matche plus,
   * c'est-à-dire que quelqu'un vient de conclure ce run. Le tour ne s'est alors
   * pas arrêté : il a FINI. Annoncer sa perte avant de le savoir écrivait un
   * message d'échec sous une conversation qui s'était bien terminée.
   */
  it("ne raconte RIEN quand la conclusion lui a été soufflée entre-temps", async () => {
    h.alive = false;
    h.stampRefused = true;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
    expect(h.events).toEqual([]);
    expect(h.notifications).toEqual([]);
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

  /**
   * MIN-286 — la ligne du run disait « gratuit » un tour qui ne l'était pas.
   *
   * `cost_usd` n'est écrite que par les sorties SAINES : un tour dont le process
   * meurt la laissait à sa valeur d'avant le tour, donc à zéro sur un premier
   * tour. Mesuré en production pendant la fenêtre d'observation d'opencode :
   * trois runs moissonnés, 0 sur la ligne, 0,159 $ au ledger. La facture et les
   * plafonds étaient saufs (ils lisent déjà le ledger) ; ce qui mentait, c'est ce
   * qu'un humain relit après l'incident.
   */
  it("recolle `cost_usd` au ledger sur un run moissonné", async () => {
    h.alive = false;
    h.ledgerSpend = 0.0678;
    await reapDeadVmRuns(fakeService());
    expect(h.updates).toContainEqual({ cost_usd: 0.0678 });
    // Le compute de la microVM AVANT la relecture, sans quoi la somme relue
    // n'emporterait pas la ligne qu'on vient d'écrire.
    expect(h.order).toEqual(["compute", "ledger"]);
  });

  it("ne fait jamais RECULER la dépense affichée", async () => {
    // Ledger et colonne sont deux minorants : le plus grand est le plus vrai. Un
    // ledger en retard (une ligne pas encore écrite) ne doit pas effacer ce que la
    // colonne portait déjà.
    h.alive = false;
    h.rows = [{ ...ROW, cost_usd: 0.5 }];
    h.ledgerSpend = 0.01;
    await reapDeadVmRuns(fakeService());
    expect(h.updates).not.toContainEqual({ cost_usd: 0.01 });
  });

  it("ne touche pas à la colonne quand le ledger ne répond pas", async () => {
    // `spentFromLedger` rend `null`, jamais 0, précisément pour qu'on ne confonde
    // pas « lecture ratée » avec « ce run n'a rien dépensé ».
    h.alive = false;
    h.ledgerSpend = null;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(1);
    expect(h.updates.some((u) => "cost_usd" in u)).toBe(false);
  });

  it("ne facture rien sur un process VIVANT", async () => {
    h.alive = true;
    await reapDeadVmRuns(fakeService());
    expect(h.compute).toHaveLength(0);
  });

  it("sans identifiant de commande, il n'interroge rien — mais il finit par conclure", async () => {
    // `startVmLoop` écrit cet identifiant à la fin de l'amorçage (~22 s). Une ligne
    // qui ne l'a toujours pas au bout d'un quart d'heure est une fonction morte
    // entre le claim et le lancement : il n'y a pas de process à sonder, et il n'y
    // en aura jamais. C'est le cas que l'ancienne requête ne regardait même pas —
    // le run restait `running` pour toujours.
    h.rows = [{ ...ROW, loop_command_id: null }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(h.probes).toHaveLength(0);
    expect(reaped).toBe(1);
    expect(h.stamped[0].fields).toMatchObject({ status: "completed" });
  });

  it("laisse un amorçage EN COURS tranquille", async () => {
    // Vingt secondes de vie : la boucle est peut-être en train de démarrer. Le
    // délai se compte sur `started_at` (posé au claim) et non sur le silence — un
    // run re-queué avec un délai devant lui arrive au claim avec une horloge
    // d'activité déjà vieille, et le compter là le tuerait en plein réveil.
    h.rows = [{ ...ROW, loop_command_id: null, started_at: agoIso(20_000) }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
  });

  it("l'ignorance ne dure pas TOUJOURS : au bout de deux heures, elle vaut décès", async () => {
    // Une microVM détruite répond « introuvable » à chaque passage, donc `null`,
    // donc rien : le run restait `running` jusqu'à ce qu'un humain le supprime en
    // base. Ce qui manquait n'est pas un verdict plus audacieux, c'est une borne.
    h.alive = null;
    h.rows = [{ ...ROW, started_at: agoIso(3 * 60 * 60_000), last_activity_at: agoIso(3 * 60 * 60_000) }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(1);
    expect(h.events[0].payload.code).toBe("turnLost");
  });

  it("mais elle dure assez pour un tour qui travaille en silence", async () => {
    // Une heure sans un signe, la plateforme injoignable : un round unique peut
    // durer ça (un `npm test` qui n'en finit pas). On attend.
    h.alive = null;
    h.rows = [{ ...ROW, started_at: agoIso(60 * 60_000), last_activity_at: agoIso(60 * 60_000) }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
  });
});
