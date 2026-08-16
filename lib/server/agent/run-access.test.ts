import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-332 — LA règle de visibilité d'un run, et le seul endroit qui la porte.
 *
 * Elle vivait en RLS et nulle part ailleurs, alors que quatre chemins la
 * contournent : les routes (clé service), `agent_run_messages` (policy jamais
 * resserrée), le trigger de diffusion et l'autorisation du topic temps réel.
 *
 * Ce fichier tient le prédicat. Les deux migrations jumelles
 * (20261217090000 / 20261217091000) le redisent en SQL : si l'un des deux
 * change, l'autre doit changer dans le même geste.
 */

const getProjectAccess = vi.fn();
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));

const { canReadAgentRun, canReadConversationRecord, isSharedRun } = await import(
  "@/lib/server/agent/run-access"
);

const ME = "user-1";
const run = (over: Partial<Parameters<typeof canReadAgentRun>[1]> = {}) => ({
  project_id: "proj-1",
  created_by: ME,
  routine_id: null,
  chain_id: null,
  pull_request_id: null,
  ...over,
});

beforeEach(() => {
  // Membre du projet : c'est le décor de TOUS les cas ci-dessous, sinon on ne
  // testerait que le contrôle d'appartenance, qui n'a jamais été le problème.
  getProjectAccess.mockResolvedValue({ isOwner: false, isMember: true });
});

describe("isSharedRun — ce qui n'est écrit à la première personne par personne", () => {
  it("une conversation ordinaire n'est pas partagée, même ancrée à un ticket", () => {
    // Le ticket est public ; ce qu'on a demandé à Numo dessus ne l'est pas.
    expect(isSharedRun(run())).toBe(false);
  });

  it("un passage de ROUTINE l'est", () => {
    expect(isSharedRun(run({ routine_id: "r-1" }))).toBe(true);
  });

  it("une étape d'AUTOMATISATION l'est", () => {
    // Son `created_by` est le porteur de la chaîne, pas un acteur : la réserver à
    // lui rendrait invisible à tous le travail que le projet a déclenché.
    expect(isSharedRun(run({ chain_id: "c-1" }))).toBe(true);
  });

  it("une session de RELECTURE de PR l'est", () => {
    expect(isSharedRun(run({ pull_request_id: "pr-1" }))).toBe(true);
  });
});

describe("canReadAgentRun", () => {
  it("fait primer la visibilite explicite sur les anciens ancrages", async () => {
    expect(
      await canReadAgentRun(
        "user-2",
        run({
          pull_request_id: "pr-1",
          conversation: { owner_id: ME, visibility: "private" },
        }),
      ),
    ).toBe(false);
    expect(
      canReadConversationRecord("user-2", { owner_id: ME, visibility: "project" }),
    ).toBe(true);
  });

  it("son créateur la lit", async () => {
    expect(await canReadAgentRun(ME, run())).toBe(true);
  });

  it("un COÉQUIPIER du même projet ne la lit pas", async () => {
    expect(await canReadAgentRun("user-2", run())).toBe(false);
  });

  it("un coéquipier lit en revanche les runs du projet", async () => {
    expect(await canReadAgentRun("user-2", run({ routine_id: "r-1" }))).toBe(true);
    expect(await canReadAgentRun("user-2", run({ chain_id: "c-1" }))).toBe(true);
    expect(await canReadAgentRun("user-2", run({ pull_request_id: "pr-1" }))).toBe(true);
  });

  it("hors du projet, rien — pas même son propre run", async () => {
    // Un run dont on serait créateur dans un projet qu'on a quitté : le contrôle
    // d'appartenance passe D'ABORD, il n'est pas remplacé par celui de création.
    getProjectAccess.mockResolvedValue(null);
    expect(await canReadAgentRun(ME, run())).toBe(false);
    expect(await canReadAgentRun(ME, run({ routine_id: "r-1" }))).toBe(false);
  });

  it("un run sans créateur (compte supprimé) n'est à personne", async () => {
    expect(await canReadAgentRun(ME, run({ created_by: null }))).toBe(false);
  });
});
