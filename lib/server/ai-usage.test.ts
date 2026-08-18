import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-131 — who pays what, in the ledger `ai_usage`.
 *
 * The rule produces: everyone pays HIS usage. The fallback on the project owner
 * still exists (without it, a background pass does not count in the budget of
 * anyone while it is the owner's budget which authorizes it — MIN-87), but it
 * must be ASKED. What we keep here are the three possible outcomes of a
 * writing, the first of which is the regression never to be seen again: a member
 * acting on the project of another pays himself, whatever happens.
 *
 * The substitution, when it takes place, is read in `billed_reason` — otherwise we
 * cannot audit the ledger or respond to “why did I pay that?” .
 */

// Customer service is the only contact with the outside world: we replace it
// by a double which serves the owners and captures the inserted lines.
const inserted: Record<string, unknown>[] = [];
let projects: { id: string; owner_id: string | null }[] = [];

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: projects.filter((p) => ids.includes(p.id)),
            }),
          }),
        };
      }
      return {
        insert: async (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
          return { error: null };
        },
      };
    },
  }),
}));

import { recordAiUsage, newRunId } from "./ai-usage";

const OWNER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  inserted.length = 0;
  projects = [];
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("imputation des lignes ai_usage", () => {
  it("impute au MEMBRE qui agit, jamais au owner du projet où il agit", async () => {
    // The project belongs to someone else — and the member knows it for his or her
    // budget: it's his that authorized the call, it's his that pays.
    const projectId = "aaaaaaaa-0001-4000-8000-000000000000";
    projects = [{ id: projectId, owner_id: OWNER }];

    await recordAiUsage({
      runId: newRunId(),
      feature: "numo_chat",
      billTo: { userId: MEMBER },
      projectId,
      cost: 0.02,
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0].user_id).toBe(MEMBER);
    expect(inserted[0].billed_reason).toBe("trigger");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("impute au owner quand le repli est DEMANDÉ, et l'écrit dans billed_reason", async () => {
    const projectId = "aaaaaaaa-0002-4000-8000-000000000000";
    projects = [{ id: projectId, owner_id: OWNER }];

    await recordAiUsage({
      runId: newRunId(),
      feature: "feedback_classify",
      billTo: { projectOwner: projectId },
      projectId,
      cost: 0.0001,
    });

    expect(inserted[0].user_id).toBe(OWNER);
    // Imputed, but recognizable as a fallback: the substitution is visible.
    expect(inserted[0].billed_reason).toBe("project_owner");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("n'impute à personne SANS BRUIT : un repli sans owner logue et se marque", async () => {
    const projectId = "aaaaaaaa-0003-4000-8000-000000000000";
    projects = []; // project deleted / not found

    await recordAiUsage({
      runId: newRunId(),
      feature: "embedding",
      billTo: { projectOwner: projectId },
      projectId,
      cost: 0.00002,
    });

    expect(inserted[0].user_id).toBeNull();
    expect(inserted[0].billed_reason).toBe("unattributed");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain(projectId);
  });

  it("logue aussi quand l'appelant déclare lui-même n'avoir pas de payeur", async () => {
    await recordAiUsage({
      runId: newRunId(),
      feature: "sandbox_compute",
      billTo: { unattributed: "run sans created_by" },
      cost: 0.5,
    });

    expect(inserted[0].user_id).toBeNull();
    expect(inserted[0].billed_reason).toBe("unattributed");
    expect(String(errorSpy.mock.calls[0][0])).toContain("run sans created_by");
  });

  it("n'impute à personne EN SILENCE quand la plateforme offre l'appel", async () => {
    // MIN-150 — the landing dictation demo runs without account: there is no
    // no one to blame, and this is not an anomaly. Confuse the two
    // would mean getting used to seeing this error in the logs.
    await recordAiUsage({
      runId: newRunId(),
      feature: "transcription",
      billTo: { platform: "landing voice demo" },
      cost: 0.0015,
    });

    expect(inserted[0].user_id).toBeNull();
    expect(inserted[0].billed_reason).toBe("platform");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("tranche ligne par ligne dans un lot mixte", async () => {
    // The same insert can carry lines from different origins: the
    // resolution is per line, not per batch — a fallback does not rub off on its
    // voisines.
    const projectId = "aaaaaaaa-0004-4000-8000-000000000000";
    projects = [{ id: projectId, owner_id: OWNER }];
    const runId = newRunId();

    await recordAiUsage([
      { runId, seq: 0, feature: "numo_chat", billTo: { userId: MEMBER }, projectId },
      { runId, seq: 1, feature: "embedding", billTo: { projectOwner: projectId }, projectId },
    ]);

    expect(inserted.map((r) => [r.user_id, r.billed_reason])).toEqual([
      [MEMBER, "trigger"],
      [OWNER, "project_owner"],
    ]);
  });
});
