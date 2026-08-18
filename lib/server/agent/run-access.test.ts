import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-332 — THE visibility rule of a run, and the only place that carries it.
 *
 * She lived in RLS and nowhere else, while four paths circumvent the
 *: the roads (service key), `agent_run_messages` (policy never
 * tightened), the broadcast trigger and the authorization of the real-time topic.
 *
 * This file holds the predicate. The two twin migrations
 * (20261217090000 / 20261217091000) say it again in SQL: if one of the two
 * changes, the other must change in the same gesture.
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
  // Project member: this is the setting for ALL cases below, otherwise we cannot
  // would only test the membership check, which was never the problem.
  getProjectAccess.mockResolvedValue({ isOwner: false, isMember: true });
});

describe("isSharedRun — ce qui n'est écrit à la première personne par personne", () => {
  it("une conversation ordinaire n'est pas partagée, même ancrée à un ticket", () => {
    // The ticket is public; what Numo was asked above is not.
    expect(isSharedRun(run())).toBe(false);
  });

  it("un passage de ROUTINE l'est", () => {
    expect(isSharedRun(run({ routine_id: "r-1" }))).toBe(true);
  });

  it("une étape d'AUTOMATISATION l'est", () => {
    // Its `created_by` is the bearer of the chain, not an actor: reserve it for
    // would make the work that the project has triggered invisible to all.
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
    // A run that we would create in a project that we left: control
    // membership comes FIRST, it is not replaced by creation.
    getProjectAccess.mockResolvedValue(null);
    expect(await canReadAgentRun(ME, run())).toBe(false);
    expect(await canReadAgentRun(ME, run({ routine_id: "r-1" }))).toBe(false);
  });

  it("un run sans créateur (compte supprimé) n'est à personne", async () => {
    expect(await canReadAgentRun(ME, run({ created_by: null }))).toBe(false);
  });
});
