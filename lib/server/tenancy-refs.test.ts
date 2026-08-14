import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UNE RÉFÉRENCE SORTANTE RESTE CHEZ ELLE (MIN-339).
 *
 * `issues` porte cinq colonnes qui pointent ailleurs — objectif, doublon,
 * assigné, cycle, forçage d'automatisation — et les cœurs d'écriture tournent
 * en clé service, RLS contournée. Rien, dans la base, n'oblige ces `uuid` à
 * désigner quelque chose du même projet : c'est ici que ça se joue.
 *
 * Chaque cas vérifie DEUX choses, et la seconde est la vraie : l'appel est
 * refusé, **et l'UPDATE n'a pas eu lieu**. Un refus rendu après l'écriture
 * n'aurait rien refusé du tout — d'où `updateLog`, qui n'enregistre que les
 * écritures réellement parties vers la base.
 */

interface Row extends Record<string, unknown> {}

let db: Record<string, Row[]> = {};
/** Les UPDATE réellement partis (table + valeurs), dans l'ordre. */
let updateLog: Array<{ table: string; values: Row }> = [];
/** Les INSERT réellement partis. */
let insertLog: Array<{ table: string; rows: Row[] }> = [];

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let columns = "";
  let mode: "select" | "update" | "insert" = "select";
  let payload: Row[] = [];

  const matching = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));

  /** La jointure `projects(...)` que lit l'instantané d'avant de update-issue. */
  const hydrate = (row: Row | undefined) => {
    if (!row) return null;
    if (table === "issues" && columns.includes("projects(")) {
      const project = (db.projects ?? []).find((p) => p.id === row.project_id);
      return { ...row, projects: project ?? null };
    }
    return { ...row };
  };

  const run = () => {
    if (mode === "update") {
      const matched = matching();
      updateLog.push({ table, values: payload[0] });
      matched.forEach((r) => Object.assign(r, payload[0]));
      return { data: hydrate(matched[0]), error: null };
    }
    if (mode === "insert") {
      const rows = payload.map((r, i) => ({
        id: (r.id as string) ?? `${table}-new-${i}`,
        created_at: "2026-08-14T10:00:00+00:00",
        ...r,
      }));
      insertLog.push({ table, rows });
      (db[table] ??= []).push(...rows);
      return { data: rows[0], error: null };
    }
    return { data: hydrate(matching()[0]), error: null };
  };

  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: (cols?: string) => {
      if (typeof cols === "string") columns = cols;
      return q;
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return q;
    },
    not: () => q,
    or: () => q,
    order: () => q,
    limit: () => q,
    range: () => q,
    update: (values: Row) => {
      mode = "update";
      payload = [values];
      return q;
    },
    insert: (values: Row | Row[]) => {
      mode = "insert";
      payload = Array.isArray(values) ? values : [values];
      return q;
    },
    maybeSingle: async () => run(),
    single: async () => run(),
    then: (onFulfilled: (value: unknown) => unknown) => {
      const result = mode === "select" ? { data: matching(), error: null } : run();
      return Promise.resolve(result).then(onFulfilled);
    },
  });
  return q;
}

const service = {
  from: (table: string) => makeQuery(table),
  rpc: async () => ({ data: 7, error: null }),
  auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
};

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

// Tout ce qui SORT du cœur : neutralisé, ce n'est pas le sujet.
vi.mock("@/lib/server/issue-events", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  insertEvents: async () => {},
}));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: async () => {} }));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: async () => {} }));
vi.mock("@/lib/server/description-mentions", () => ({
  notifyDescriptionMentions: async () => {},
}));
vi.mock("@/lib/server/page-links", () => ({ queuePageLinks: () => {} }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
vi.mock("@/lib/server/smart-assign", () => ({
  isSmartAssignEligibleStatus: () => false,
  applySmartAssign: async () => null,
}));
vi.mock("@/lib/server/cycles", () => ({ scheduleCycleCapture: () => {} }));
vi.mock("@/lib/server/feedback/status-sync", () => ({
  scheduleFeedbackStatusSync: () => {},
}));
vi.mock("@/lib/server/git/issue-push", () => ({ scheduleRemoteStatusPush: () => {} }));
vi.mock("@/lib/server/automations/hooks", () => ({ scheduleStatusAutomations: () => {} }));
vi.mock("@/lib/server/recurrence", () => ({ spawnNextOccurrence: async () => {} }));
vi.mock("@/lib/server/entitlements", () => ({ ensureIssueLimit: async () => {} }));
vi.mock("@/lib/server/attachments", () => ({
  parseResourcesInput: () => [],
  copyResourcesToProject: async () => [],
  insertAttachments: async () => {},
}));
vi.mock("@/lib/server/smart-fill", () => ({ runSmartFill: async () => ({}) }));

const { updateIssueFields } = await import("@/lib/server/update-issue");
const { createIssueForProject } = await import("@/lib/server/create-issue");
const { createObjective, updateObjective } = await import("@/lib/server/objectives");

const MINE = "project-mine";
const THEIRS = "project-theirs";
const ME = "user-me";
const MEMBER = "user-member";
const STRANGER = "user-stranger";

/**
 * Deux projets, deux locataires. Je suis membre du mien (le propriétaire est
 * quelqu'un d'autre : c'est ce qui permet de tester `automation_override`) et
 * je n'ai RIEN à voir avec l'autre.
 */
beforeEach(() => {
  updateLog = [];
  insertLog = [];
  db = {
    projects: [
      { id: MINE, name: "Le mien", owner_id: "user-owner", deleted_at: null },
      { id: THEIRS, name: "Le leur", owner_id: STRANGER, deleted_at: null },
    ],
    project_members: [
      { project_id: MINE, user_id: ME },
      { project_id: MINE, user_id: MEMBER },
      { project_id: THEIRS, user_id: STRANGER },
    ],
    issues: [
      {
        id: "issue-1",
        project_id: MINE,
        number: 1,
        title: "Mon ticket",
        status: "todo",
        assignee_id: null,
        objective_id: null,
        cycle_id: null,
        duplicate_of_id: null,
        automation_override: null,
        due_date: null,
        recurrence: null,
        plan: null,
        description: null,
        deleted_at: null,
      },
      {
        id: "issue-theirs",
        project_id: THEIRS,
        number: 1,
        title: "Leur ticket",
        status: "todo",
        deleted_at: null,
      },
    ],
    objectives: [
      { id: "objective-mine", project_id: MINE, name: "Le mien", deleted_at: null },
      { id: "objective-theirs", project_id: THEIRS, name: "Le leur", deleted_at: null },
    ],
    cycles: [
      { id: "cycle-mine", user_id: ME },
      { id: "cycle-theirs", user_id: STRANGER },
    ],
    issue_categories: [],
    issue_events: [],
  };
});

const patch = (input: Record<string, unknown>, actorId = ME) =>
  updateIssueFields({ issueId: "issue-1", actorId, input });

describe("updateIssueFields — références sortantes bornées au projet", () => {
  it("refuse un objectif d'un autre projet, sans rien écrire", async () => {
    const result = await patch({ objective_id: "objective-theirs" });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "objectiveNotFound" });
    expect(updateLog).toEqual([]);
  });

  it("accepte un objectif du projet du ticket", async () => {
    const result = await patch({ objective_id: "objective-mine" });

    expect(result.ok).toBe(true);
    expect(updateLog).toHaveLength(1);
    expect(updateLog[0].values).toMatchObject({ objective_id: "objective-mine" });
  });

  it("refuse un doublon pointant sur un ticket d'un autre projet", async () => {
    const result = await patch({
      status: "duplicate",
      duplicate_of_id: "issue-theirs",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      errorKey: "duplicateIssueNotFound",
    });
    expect(updateLog).toEqual([]);
  });

  it("refuse d'assigner quelqu'un qui n'est pas membre du projet", async () => {
    const result = await patch({ assignee_id: STRANGER });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "notAProjectMember" });
    expect(updateLog).toEqual([]);
  });

  it("accepte d'assigner un membre du projet", async () => {
    const result = await patch({ assignee_id: MEMBER });

    expect(result.ok).toBe(true);
    expect(updateLog[0].values).toMatchObject({ assignee_id: MEMBER });
  });

  it("refuse le cycle personnel de quelqu'un d'autre", async () => {
    const result = await patch({ cycle_id: "cycle-theirs" });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "invalidCycle" });
    expect(updateLog).toEqual([]);
  });

  it("accepte son propre cycle, et s'y affecte le ticket", async () => {
    const result = await patch({ cycle_id: "cycle-mine" });

    expect(result.ok).toBe(true);
    // Ranger un ticket dans son cycle l'assigne à soi (MIN-32).
    expect(updateLog[0].values).toMatchObject({ cycle_id: "cycle-mine", assignee_id: ME });
  });

  it("refuse un forçage d'automatisation à un simple membre", async () => {
    // C'est le budget, le plan et la clé BYOK du PROPRIÉTAIRE que les runs
    // consomment — 403, pas 400 : la charge est valide, le droit ne l'est pas.
    const result = await patch({ automation_override: { preset: "ship" } });

    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "ownerOnly" });
    expect(updateLog).toEqual([]);
  });

  it("laisse le propriétaire du projet forcer un préréglage", async () => {
    const result = await patch({ automation_override: { disabled: true } }, "user-owner");

    expect(result.ok).toBe(true);
    expect(updateLog[0].values).toMatchObject({ automation_override: { disabled: true } });
  });
});

describe("createIssueForProject — l'objectif à la création aussi", () => {
  it("refuse un objectif d'un autre projet, sans créer le ticket", async () => {
    const result = await createIssueForProject({
      projectId: MINE,
      actorId: ME,
      input: { title: "Un ticket", objective_id: "objective-theirs" },
    });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "objectiveNotFound" });
    expect(insertLog.filter((i) => i.table === "issues")).toEqual([]);
  });

  it("accepte un objectif du projet", async () => {
    const result = await createIssueForProject({
      projectId: MINE,
      actorId: ME,
      input: { title: "Un ticket", objective_id: "objective-mine" },
    });

    expect(result.ok).toBe(true);
    expect(insertLog.find((i) => i.table === "issues")?.rows[0]).toMatchObject({
      objective_id: "objective-mine",
    });
  });
});

describe("objectives — le responsable est membre du projet", () => {
  it("refuse un responsable étranger à la création", async () => {
    const result = await createObjective({
      projectId: MINE,
      actorId: ME,
      input: { name: "Un objectif", lead_user_id: STRANGER },
    });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "notAProjectMember" });
    expect(insertLog.filter((i) => i.table === "objectives")).toEqual([]);
  });

  it("refuse un responsable étranger à la mise à jour", async () => {
    const result = await updateObjective({
      objectiveId: "objective-mine",
      actorId: ME,
      input: { lead_user_id: STRANGER },
    });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "notAProjectMember" });
    expect(updateLog).toEqual([]);
  });

  it("accepte un membre du projet comme responsable", async () => {
    const result = await updateObjective({
      objectiveId: "objective-mine",
      actorId: ME,
      input: { lead_user_id: MEMBER },
    });

    expect(result.ok).toBe(true);
    expect(updateLog[0].values).toMatchObject({ lead_user_id: MEMBER });
  });
});
