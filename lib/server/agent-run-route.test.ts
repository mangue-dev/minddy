import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RENOMMER et SUPPRIMER une conversation de l'agent.
 *
 * Jusqu'ici la route n'avait qu'un GET : il n'existait AUCUN chemin de
 * suppression d'un run — ni bouton ni verbe. Une conversation dont la boucle
 * meurt reste `running`, ne s'arrête pas, ne se guide pas, et la seule issue était
 * un `delete` à la main en production. D'où le point de ce fichier : ce qui se
 * passe AVANT le `delete`, et qu'on ne peut plus faire après.
 */

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const getRun = vi.fn();
const requestInterrupt = vi.fn(async () => {});
const stopSandboxByName = vi.fn(async () => {});
const revokeRunKey = vi.fn(async () => {});
const h = vi.hoisted(() => ({
  updated: [] as Array<Record<string, unknown>>,
  deleted: [] as string[],
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/server/agent/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/agent/runs")>()),
  getRun: (...args: unknown[]) => getRun(...args),
  requestInterrupt: (...args: unknown[]) => requestInterrupt(...(args as [])),
}));
vi.mock("@/lib/server/agent/sandbox", () => ({
  stopSandboxByName: (...args: unknown[]) => stopSandboxByName(...(args as [])),
}));
vi.mock("@/lib/server/agent/run-key", () => ({
  revokeRunKey: (...args: unknown[]) => revokeRunKey(...(args as [])),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        h.updated.push(fields);
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({
        eq: async (_column: string, value: string) => {
          h.deleted.push(value);
          return { error: null };
        },
      }),
    }),
  }),
}));

const { GET, PATCH, DELETE } = await import("@/app/api/agent-runs/[runId]/route");

const RUN = "11111111-2222-4333-8444-555555555555";
const params = Promise.resolve({ runId: RUN });

const patch = (body: unknown) =>
  PATCH(
    new Request("https://minddy.app/api/agent-runs/x", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as never,
    { params },
  );

const get = () =>
  GET(new Request("https://minddy.app/api/agent-runs/x") as never, { params });

const del = () =>
  DELETE(
    new Request("https://minddy.app/api/agent-runs/x", { method: "DELETE" }) as never,
    { params },
  );

beforeEach(() => {
  h.updated.length = 0;
  h.deleted.length = 0;
  requestInterrupt.mockClear();
  stopSandboxByName.mockClear();
  revokeRunKey.mockClear();
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  getProjectAccess.mockResolvedValue({ isMember: true });
  getRun.mockResolvedValue({
    id: RUN,
    project_id: "proj-1",
    // MIN-332 : la conversation appartient à qui l'a eue, et les trois ancrages
    // qui en feraient un geste du PROJET sont vides — c'est le cas ordinaire.
    created_by: "user-1",
    routine_id: null,
    chain_id: null,
    pull_request_id: null,
    status: "running",
    sandbox_id: "agent-run-1",
    provider_key_id: "hash-1",
    title: "Vieux titre",
  });
});

/**
 * MIN-332 — la conversation appartient à qui l'a eue.
 *
 * Ces trois verbes lisaient le run EN CLÉ SERVICE et ne demandaient que
 * l'appartenance au projet : la policy `agent_runs_select`, seule à porter la
 * règle, ne gardait rien ici. Un membre ordinaire lisait donc le prompt d'un
 * coéquipier, le renommait, le supprimait.
 */
describe("visibilité — un run personnel n'est pas celui du projet", () => {
  const asTeammate = () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-2" } });
  };

  it("404 sur la LECTURE d'une conversation d'un autre membre", async () => {
    asTeammate();
    const res = await get();
    expect(res.status).toBe(404);
  });

  it("404 sur le RENOMMAGE, et rien n'est écrit", async () => {
    asTeammate();
    const res = await patch({ title: "x" });
    expect(res.status).toBe(404);
    expect(h.updated).toHaveLength(0);
  });

  it("404 sur la SUPPRESSION, et la microVM n'est pas coupée", async () => {
    asTeammate();
    const res = await del();
    expect(res.status).toBe(404);
    expect(h.deleted).toHaveLength(0);
    expect(stopSandboxByName).not.toHaveBeenCalled();
  });

  it("mais un PASSAGE DE ROUTINE reste lisible par tout membre", async () => {
    // La routine est un objet du PROJET : son `created_by` est le porteur de la
    // règle, pas un acteur. La réserver à lui rendrait ses exécutions invisibles
    // à l'équipe qui les a mises en place.
    asTeammate();
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: "routine-1",
      chain_id: null,
      pull_request_id: null,
      status: "completed",
    });
    const res = await get();
    expect(res.status).toBe(200);
  });

  it("et une session de RELECTURE de PR aussi — son sujet est public", async () => {
    asTeammate();
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: null,
      chain_id: null,
      pull_request_id: "pr-1",
      status: "completed",
    });
    const res = await get();
    expect(res.status).toBe(200);
  });
});

describe("PATCH — renommer", () => {
  it("écrit le titre du run", async () => {
    const res = await patch({ title: "  Migration Electron  " });
    expect(res.status).toBe(200);
    expect(h.updated).toEqual([{ title: "Migration Electron" }]);
  });

  it("un titre VIDE efface le sien — c'est le chemin de retour", async () => {
    // La conversation retombe alors sur le titre de son ticket (cf.
    // `agentSessionTitle`). Interdire l'effacement rendrait un renommage
    // malheureux définitif.
    await patch({ title: "   " });
    expect(h.updated).toEqual([{ title: null }]);
  });

  it("refuse un corps sans titre — on ne devine pas un effacement", async () => {
    const res = await patch({});
    expect(res.status).toBe(400);
    expect(h.updated).toHaveLength(0);
  });

  it("404 pour qui n'est pas membre du projet — pas 403", async () => {
    // Dire « interdit » apprendrait déjà qu'un run porte cet identifiant.
    getProjectAccess.mockResolvedValue(null);
    const res = await patch({ title: "x" });
    expect(res.status).toBe(404);
    expect(h.updated).toHaveLength(0);
  });
});

describe("DELETE — supprimer", () => {
  it("coupe la microVM et révoque la clé AVANT de supprimer la ligne", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    // L'ordre est tout : après le `delete`, on n'a plus ni le nom de la sandbox ni
    // le hash de la clé. La microVM tournerait jusqu'au bout de sa session (24 h
    // facturées) et la clé resterait valide, sans plus rien en base pour dire
    // lesquelles.
    expect(stopSandboxByName).toHaveBeenCalledWith("agent-run-1");
    expect(revokeRunKey).toHaveBeenCalledWith("hash-1");
    expect(h.deleted).toEqual([RUN]);
  });

  it("supprime une conversation qui TRAVAILLE — c'est le cas qui l'a fait écrire", async () => {
    // Une boucle morte laisse un run `running` qu'on ne peut ni arrêter ni guider.
    // Refuser de le supprimer ne laisserait que la base pour issue.
    await del();
    expect(requestInterrupt).toHaveBeenCalledWith(RUN);
    expect(h.deleted).toEqual([RUN]);
  });

  it("ne demande pas d'interruption à une conversation au repos", async () => {
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: null,
      chain_id: null,
      pull_request_id: null,
      status: "completed",
      sandbox_id: null,
      provider_key_id: null,
    });
    await del();
    expect(requestInterrupt).not.toHaveBeenCalled();
    expect(stopSandboxByName).not.toHaveBeenCalled();
    expect(h.deleted).toEqual([RUN]);
  });

  it("404 pour qui n'est pas membre — et rien n'est supprimé", async () => {
    getProjectAccess.mockResolvedValue(null);
    const res = await del();
    expect(res.status).toBe(404);
    expect(h.deleted).toHaveLength(0);
    expect(stopSandboxByName).not.toHaveBeenCalled();
  });
});
