import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-131 — qui paye quoi, dans le ledger `ai_usage`.
 *
 * La règle produit : chacun paye SON usage. Le repli sur le owner du projet
 * existe toujours (sans lui, une passe de fond ne compte dans le budget de
 * personne alors que c'est le budget du owner qui l'autorise — MIN-87), mais il
 * doit se DEMANDER. Ce qu'on garde ici, ce sont les trois issues possibles d'une
 * écriture, dont la première est la régression à ne jamais revoir : un membre
 * agissant sur le projet d'un autre paye lui-même, quoi qu'il arrive.
 *
 * La substitution, quand elle a lieu, se lit dans `billed_reason` — sans quoi on
 * ne peut ni auditer le ledger ni répondre à « pourquoi ai-je payé ça ? ».
 */

// Le service client est le seul contact avec le monde extérieur : on le remplace
// par un double qui sert les owners et capture les lignes insérées.
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
    // Le projet appartient à quelqu'un d'autre — et le membre le sait pour son
    // budget : c'est le sien qui a autorisé l'appel, c'est le sien qui paye.
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
    // Imputé, mais reconnaissable comme un repli : la substitution est visible.
    expect(inserted[0].billed_reason).toBe("project_owner");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("n'impute à personne SANS BRUIT : un repli sans owner logue et se marque", async () => {
    const projectId = "aaaaaaaa-0003-4000-8000-000000000000";
    projects = []; // projet supprimé / introuvable

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
    // MIN-150 — la démo de dictée de la landing tourne sans compte : il n'y a
    // personne à qui imputer, et ce n'est pas une anomalie. Confondre les deux
    // reviendrait à s'habituer à voir cette erreur-là dans les journaux.
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
    // Un même insert peut porter des lignes de provenances différentes : la
    // résolution est par ligne, pas par lot — un repli ne déteint pas sur ses
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
