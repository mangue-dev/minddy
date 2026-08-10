import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LA NAISSANCE D'UN TICKET EST ÉCRITE AVANT LA RÉPONSE.
 *
 * Ce fichier ne tient qu'une règle, et elle a coûté deux symptômes en prod :
 *
 *  - « a créé le ticket » arrivait APRÈS « a assigné » ou « a lié » dans la
 *    timeline — parce que ces écritures-là, elles, se font avant la réponse ;
 *  - et parfois n'arrivait pas du tout : une écriture d'après la réponse est
 *    best-effort, et quand elle tombe, le ticket n'a plus AUCUNE activité.
 *
 * Les deux se corrigent au même endroit : l'événement `created` s'écrit sur le
 * chemin synchrone. D'où la forme des assertions — on n'exécute JAMAIS les
 * rappels d'`after()` ici. Tout ce que le test voit dans `issue_events` a donc,
 * par construction, été écrit avant que la fonction ne rende la main.
 */

interface Row extends Record<string, unknown> {}

let eventRows: Row[] = [];
let categoryLinkRows: Row[] = [];
/** L'ordre des écritures, tel qu'il aboutit dans la timeline. */
let writeLog: string[] = [];
/** Rappels programmés par `after()` — capturés, jamais joués. */
let afterCallbacks: (() => unknown)[] = [];

vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));

const insertedIssue = (row: Row): Row => ({
  ...row,
  id: (row.id as string) ?? "issue-1",
  created_at: "2026-08-10T10:00:00+00:00",
  status: row.status ?? "backlog",
  priority: row.priority ?? "none",
  assignee_id: row.assignee_id ?? null,
  parent_id: row.parent_id ?? null,
});

function table(name: string) {
  const query: Record<string, unknown> = {};
  let inserted: Row[] = [];
  query.select = () => query;
  query.eq = () => query;
  query.is = () => query;
  query.in = () => query;
  query.insert = (rows: Row | Row[]) => {
    inserted = Array.isArray(rows) ? rows : [rows];
    if (name === "issues") {
      inserted = inserted.map(insertedIssue);
    } else if (name === "issue_events") {
      writeLog.push(...inserted.map((r) => `event:${r.type}${r.field ? `/${r.field}` : ""}`));
      eventRows.push(...inserted);
    } else if (name === "issue_categories") {
      categoryLinkRows.push(...inserted);
    }
    return query;
  };
  // Le parent d'un sous-ticket : la seule lecture de `issues` du chemin testé.
  query.maybeSingle = async () => ({
    data:
      name === "issues"
        ? { id: "parent-1", project_id: "project-1", parent_id: null, objective_id: null }
        : null,
    error: null,
  });
  query.single = async () => ({ data: inserted[0] ?? null, error: null });
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(name),
    rpc: async () => ({ data: 42, error: null }),
  }),
}));

vi.mock("@/lib/server/entitlements", () => ({
  ensureIssueLimit: async () => {},
  canUseSmartAssign: async () => false,
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: async () => null }));
vi.mock("@/lib/server/attachments", () => ({
  parseResourcesInput: () => [],
  copyResourcesToProject: async () => [],
  insertAttachments: async () => {},
}));
/** Ce que Smart-fill répond, quand un test l'appelle. */
let smartFillPatch: Record<string, unknown> = {};
vi.mock("@/lib/server/smart-fill", () => ({ runSmartFill: async () => smartFillPatch }));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: async () => {} }));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: async () => {} }));
vi.mock("@/lib/server/description-mentions", () => ({
  notifyDescriptionMentions: async () => {},
}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
// Les webhooks partent dans leur propre `after()` — hors sujet ici.
vi.mock("@/lib/server/webhooks", () => ({ dispatchWebhooksForEvents: () => {} }));

// Smart Assign écrit AVANT la réponse (cas déterministe) : c'est contre lui que
// se mesure l'ordre. Il ne s'exécute que sur un ticket né sans assigné, hors
// triage — ce que fait le cas nominal ci-dessous.
vi.mock("@/lib/server/smart-assign", () => ({
  isSmartAssignEligibleStatus: () => true,
  applySmartAssign: async () => {
    writeLog.push("smart-assign");
    return "member-2";
  },
}));

const { createIssueForProject } = await import("@/lib/server/create-issue");

const create = (input: Record<string, unknown> = {}) =>
  createIssueForProject({
    projectId: "project-1",
    actorId: "member-1",
    input: { title: "Un ticket", ...input },
  });

beforeEach(() => {
  eventRows = [];
  categoryLinkRows = [];
  writeLog = [];
  afterCallbacks = [];
  smartFillPatch = {};
});

describe("createIssueForProject — activité de naissance", () => {
  it("écrit l'événement `created` avant de rendre la main", async () => {
    const result = await create();

    expect(result.ok).toBe(true);
    // Rien d'après-réponse n'a encore tourné : ce qui est là a été écrit à temps.
    expect(afterCallbacks.length).toBeGreaterThan(0);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]).toMatchObject({
      issue_id: "issue-1",
      actor_id: "member-1",
      type: "created",
    });
  });

  it("écrit `created` AVANT l'affectation de Smart Assign", async () => {
    await create();

    expect(writeLog).toEqual(["event:created", "smart-assign"]);
  });

  it("annonce le sous-ticket au parent, dans le même geste", async () => {
    await create({ parent_id: "parent-1" });

    expect(eventRows.map((r) => [r.issue_id, r.type])).toEqual([
      ["issue-1", "created"],
      ["parent-1", "sub_issue_added"],
    ]);
  });

  it("dit ce que Smart-fill a posé, après la création", async () => {
    // Smart-fill remplit un champ laissé vide — l'événement suit le `created`.
    smartFillPatch = { priority: "high" };

    await create({ smart_fill: true });

    expect(eventRows.map((r) => [r.type, r.field, r.via_smart_fill ?? false])).toEqual([
      ["created", undefined, false],
      ["updated", "smart_fill", true],
    ]);
  });
});
