import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MIN-278 — le DÉBIT, qui est tout ce que ce module a de délicat.
 *
 * « Pas de bruit » est la quatrième condition du ticket, et c'est celle qu'on ne
 * remarque qu'en la subissant : une page se réenregistre une seconde après la
 * dernière frappe, donc un après-midi d'écriture fait mille lignes d'activité —
 * et un agent qui repasse dix fois sur la même page, dix notifications. Les deux
 * bornes vivent ici, et rien à l'écran ne les montre avant qu'elles ne cèdent.
 */

// Signatures explicites : sans elles, `mock.calls` est typé sur un tuple vide
// et lire `c[1]` ne compile pas (même remarque que notifications.test.ts).
const H = vi.hoisted(() => ({
  insertEvents: vi.fn<
    (service: unknown, rows: Array<Record<string, unknown>>) => Promise<void>
  >(async () => {}),
  insertNotifications: vi.fn<
    (
      service: unknown,
      rows: Array<Record<string, unknown>>,
      opts?: Record<string, unknown>
    ) => Promise<void>
  >(async () => {}),
}));

vi.mock("./issue-events", () => ({ insertEvents: H.insertEvents }));
vi.mock("./notifications", () => ({ insertNotifications: H.insertNotifications }));

const { recordPageEvent, notifyAgentPageWrite } = await import("./page-activity");

const PAGE = "page-1";
const PROJECT = "project-1";
const ACTOR = "user-1";

/** Faux PostgREST : la lecture de coalescence rend ce qu'on lui dit, et on
 *  garde les filtres posés — c'est leur EXACTITUDE qui décide de la borne. */
function stubService(existing: unknown[]) {
  const filters: Array<[string, unknown]> = [];
  const service = {
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      };
      query.filter = (column: string, op: string, value: unknown) => {
        filters.push([`${column}:${op}`, value]);
        return query;
      };
      query.gte = (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      };
      query.limit = () => Promise.resolve({ data: existing, error: null });
      return query;
    },
  } as unknown as SupabaseClient;
  return { service, filters };
}

beforeEach(() => {
  H.insertEvents.mockClear();
  H.insertNotifications.mockClear();
});

describe("recordPageEvent", () => {
  it("marque une écriture d'agent `via_assistant` — la ligne nomme Numo", async () => {
    const { service } = stubService([]);
    await recordPageEvent(service, {
      pageId: PAGE,
      actorId: ACTOR,
      kind: "agent",
      type: "page_updated",
    });
    // Sans ce drapeau, l'activité dirait « Clément a modifié cette page » d'un
    // texte que Clément n'a pas écrit : l'inverse de la règle d'identité.
    expect(H.insertEvents.mock.calls[0][1]).toEqual([
      {
        page_id: PAGE,
        actor_id: ACTOR,
        type: "page_updated",
        field: "agent",
        via_assistant: true,
      },
    ]);
  });

  it("n'écrit RIEN quand la même personne vient de modifier la page", async () => {
    const { service, filters } = stubService([{ id: "existing" }]);
    await recordPageEvent(service, {
      pageId: PAGE,
      actorId: ACTOR,
      kind: "human",
      type: "page_updated",
    });
    expect(H.insertEvents).not.toHaveBeenCalled();
    // La fenêtre est bornée à la PAGE, au TYPE, à la NATURE du geste et à
    // l'ACTEUR. Un filtre qui sauterait ferait taire les lignes d'un autre.
    expect(filters.map(([column]) => column)).toEqual([
      "page_id",
      "type",
      "field",
      "actor_id:eq",
      "created_at",
    ]);
  });

  it("écrit quand même si c'est l'AGENT qui recouvre l'écriture d'un humain", async () => {
    // La fenêtre ne recouvre jamais un changement de nature : « l'agent est
    // passé après moi » est exactement ce qu'on vient lire.
    const { service, filters } = stubService([]);
    await recordPageEvent(service, {
      pageId: PAGE,
      actorId: ACTOR,
      kind: "agent",
      type: "page_updated",
    });
    expect(filters).toContainEqual(["field", "agent"]);
    expect(H.insertEvents).toHaveBeenCalledTimes(1);
  });

  it("ne coalesce PAS la création, la corbeille ni la restauration", async () => {
    // Une ligne récente existe : elle ne doit rien avaler de ces trois-là — on
    // ne corbeille pas une page quarante fois de suite, et rater le geste
    // destructeur serait rater le seul qu'on vient chercher.
    for (const type of ["page_created", "page_trashed", "page_restored"] as const) {
      const { service } = stubService([{ id: "existing" }]);
      await recordPageEvent(service, { pageId: PAGE, actorId: ACTOR, kind: "human", type });
    }
    expect(H.insertEvents).toHaveBeenCalledTimes(3);
  });
});

describe("notifyAgentPageWrite", () => {
  it("prévient le lanceur, sans acteur, et déplace sa ligne non lue", async () => {
    const { service } = stubService([]);
    await notifyAgentPageWrite(service, {
      projectId: PROJECT,
      pageId: PAGE,
      actorId: ACTOR,
    });

    const [, rows, opts] = H.insertNotifications.mock.calls[0];
    expect(rows).toEqual([
      {
        user_id: ACTOR,
        project_id: PROJECT,
        type: "page_agent_edit",
        issue_id: null,
        page_id: PAGE,
        // `actor_id` NULL : l'acteur n'est pas une personne. Rempli, le
        // destinataire verrait son propre portrait sur une écriture d'agent.
        actor_id: null,
      },
    ]);
    // Dix passages sur la même page = une ligne, pas dix (MIN-278, « pas de
    // bruit »). La clause `page_id` d'`insertNotifications` la borne à celle-ci.
    expect(opts).toEqual({ replaceUnread: true });
  });
});
