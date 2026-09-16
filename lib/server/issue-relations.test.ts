import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRow } from "@/lib/server/issue-events";
import type { IssueRelationType, RelationEndpointType } from "@/lib/types";

const getProjectAccess = vi.fn();
const scheduleCycleBlockerPull = vi.fn();
const dispatchWebhooksForEvents = vi.fn();

vi.mock("@/lib/server/project-access", () => ({ getProjectAccess }));
vi.mock("@/lib/server/cycles", () => ({ scheduleCycleBlockerPull }));
vi.mock("@/lib/server/webhooks", () => ({ dispatchWebhooksForEvents }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { addIssueRelation, removeIssueRelation, findIssueRelation, listIssueRelations } =
  await import("./issue-relations");

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const service = {
  from: vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let operation = "select";
    let values: Row[] = [];
    let columns: string[] | undefined;
    const project = (rows: Row[]) => {
      const selected = columns;
      return selected
        ? rows.map((row) => Object.fromEntries(selected.map((key) => [key, row[key]])))
        : rows;
    };
    const execute = () => {
      const rows = tables[table] ?? [];
      const matches = rows.filter((row) => filters.every((filter) => filter(row)));
      if (operation === "insert") {
        if (table === "issue_relations" && rows.some((row) =>
          ["project_id", "source_id", "target_id", "type"].every((key) => row[key] === values[0][key])
        )) {
          return { data: null, error: { code: "23505", message: "Duplicate relation" } };
        }
        const inserted = values.map((value) => ({ id: `${table}-${rows.length + 1}`, ...value }));
        tables[table] = [...rows, ...inserted];
        return { data: project(inserted), error: null };
      }
      if (operation === "delete") {
        tables[table] = rows.filter((row) => !matches.includes(row));
      }
      return { data: project(matches), error: null };
    };
    const query = {
      select: (column?: string) => {
        if (column && column !== "*") columns = column.split(",").map((key) => key.trim());
        return query;
      },
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return query;
      },
      is: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return query;
      },
      insert: (input: Row | Row[]) => {
        operation = "insert";
        values = Array.isArray(input) ? input : [input];
        return query;
      },
      delete: () => {
        operation = "delete";
        return query;
      },
      single: async () => {
        const result = execute();
        return { ...result, data: result.data?.[0] ?? null };
      },
      maybeSingle: async () => query.single(),
      then: (resolve: (result: ReturnType<typeof execute>) => unknown) =>
        Promise.resolve(execute()).then(resolve),
    };
    return query;
  }),
};

const projectId = "project-1";
const actorId = "actor-1";
const lowId = "00000000-0000-4000-8000-000000000001";
const highId = "00000000-0000-4000-8000-000000000002";
const pairs: Array<[RelationEndpointType, RelationEndpointType]> = [
  ["objective", "objective"],
  ["issue", "objective"],
  ["objective", "issue"],
  ["issue", "issue"],
];
const types: IssueRelationType[] = ["blocks", "blocked_by", "related"];
const inverse = (type: IssueRelationType): IssueRelationType =>
  type === "blocks" ? "blocked_by" : type === "blocked_by" ? "blocks" : "related";
const tableFor = (type: RelationEndpointType) => type === "issue" ? "issues" : "objectives";
const seed = (id: string, type: RelationEndpointType, overrides: Row = {}) => {
  tables[tableFor(type)].push({ id, project_id: projectId, deleted_at: null, ...overrides });
};
const event = (
  id: string,
  endpoint: RelationEndpointType,
  type: string,
  field: IssueRelationType,
  otherId: string,
): EventRow => ({
  ...(endpoint === "issue" ? { issue_id: id } : { objective_id: id }),
  actor_id: actorId,
  type,
  field,
  to_value: otherId,
});
const events = () => tables.issue_events.map(({ id: _id, ...row }) => row);

beforeEach(() => {
  vi.clearAllMocks();
  for (const table of ["issues", "objectives", "issue_relations", "issue_events"]) tables[table] = [];
  getProjectAccess.mockResolvedValue({ role: "owner" });
});

describe.each(pairs)("%s to %s relations", (sourceType, targetType) => {
  it.each(types)("records both perspectives for %s add/remove without duplicate side effects", async (type) => {
    seed(highId, sourceType);
    seed(lowId, targetType);
    const input = { projectId, actorId, sourceId: highId, targetId: lowId, sourceType, targetType, type };
    const added = await addIssueRelation(input);
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error("Relation was not created");
    expect(events()).toHaveLength(2);
    expect(events()).toEqual(expect.arrayContaining([
      event(highId, sourceType, "relation_added", type, lowId),
      event(lowId, targetType, "relation_added", inverse(type), highId),
    ]));
    const shouldPull = sourceType === "issue" && targetType === "issue" && type !== "related";
    expect(scheduleCycleBlockerPull).toHaveBeenCalledTimes(shouldPull ? 1 : 0);
    if (shouldPull) {
      expect(scheduleCycleBlockerPull).toHaveBeenCalledWith({
        blockerId: type === "blocks" ? highId : lowId,
        blockedId: type === "blocks" ? lowId : highId,
        actorId,
        viaAssistant: false,
        mcpKeyId: null,
      });
    }
    const issueEvents = events().filter((row) => row.issue_id);
    expect(dispatchWebhooksForEvents).toHaveBeenCalledTimes(issueEvents.length > 0 ? 1 : 0);
    if (issueEvents.length) expect(dispatchWebhooksForEvents).toHaveBeenCalledWith(service, issueEvents);

    expect(await addIssueRelation(input)).toEqual(added);
    expect(await addIssueRelation({
      ...input,
      sourceId: lowId,
      targetId: highId,
      sourceType: targetType,
      targetType: sourceType,
      type: inverse(type),
    })).toEqual(added);
    expect(tables.issue_relations).toHaveLength(1);
    expect(events()).toHaveLength(2);
    expect(scheduleCycleBlockerPull).toHaveBeenCalledTimes(shouldPull ? 1 : 0);
    expect(dispatchWebhooksForEvents).toHaveBeenCalledTimes(issueEvents.length > 0 ? 1 : 0);
    expect(await findIssueRelation(projectId, { id: highId, type: sourceType }, type, { id: lowId, type: targetType })).toEqual(added.relation);
    expect(await findIssueRelation("other-project", { id: highId, type: sourceType }, type, { id: lowId, type: targetType })).toBeNull();

    vi.clearAllMocks();
    const removed = await removeIssueRelation({ relationId: added.relation.id, actorId });
    expect(removed).toEqual(added);
    expect(tables.issue_relations).toEqual([]);
    expect(events().slice(2)).toHaveLength(2);
    expect(events().slice(2)).toEqual(expect.arrayContaining([
      event(highId, sourceType, "relation_removed", type, lowId),
      event(lowId, targetType, "relation_removed", inverse(type), highId),
    ]));
    expect(scheduleCycleBlockerPull).not.toHaveBeenCalled();
    expect(await removeIssueRelation({ relationId: added.relation.id, actorId })).toEqual({ ok: false, status: 404, errorKey: "relationNotFound" });
    expect(events()).toHaveLength(4);
    expect(dispatchWebhooksForEvents).toHaveBeenCalledTimes(issueEvents.length > 0 ? 1 : 0);
  });

  it.each(types)("preserves assistant and MCP attribution for %s", async (type) => {
    seed(lowId, sourceType);
    seed(highId, targetType);
    const added = await addIssueRelation({ projectId, actorId, sourceId: lowId, targetId: highId, sourceType, targetType, type, viaAssistant: true, mcpKeyId: "key-1" });
    if (!added.ok) throw new Error("Relation was not created");
    await removeIssueRelation({ relationId: added.relation.id, actorId, viaAssistant: true, mcpKeyId: "key-1" });
    expect(events()).toHaveLength(4);
    for (const row of events()) {
      expect(row).toMatchObject({ actor_id: actorId, via_assistant: true, via_mcp: true, api_key_id: "key-1" });
      expect([row.issue_id, row.objective_id].filter(Boolean)).toHaveLength(1);
    }
  });

  describe.each(["source", "target"])("%s endpoint validation", (side) => {
    it.each(types.flatMap((type) =>
      ["missing", "trashed", "foreign", "wrong-kind"].map((condition) => ({ type, condition }))
    ))("rejects a $condition endpoint for $type before writes", async ({ type, condition }) => {
      const badId = side === "source" ? lowId : highId;
      const badType = side === "source" ? sourceType : targetType;
      seed(side === "source" ? highId : lowId, side === "source" ? targetType : sourceType);
      if (condition !== "missing") {
        seed(badId, condition === "wrong-kind" ? (badType === "issue" ? "objective" : "issue") : badType, {
          ...(condition === "trashed" ? { deleted_at: "2026-09-17T00:00:00Z" } : {}),
          ...(condition === "foreign" ? { project_id: "other-project" } : {}),
        });
      }
      expect(await addIssueRelation({ projectId, actorId, sourceId: lowId, targetId: highId, sourceType, targetType, type })).toEqual({ ok: false, status: 404, errorKey: "issueNotFound" });
      expect(tables.issue_relations).toEqual([]);
      expect(events()).toEqual([]);
      expect(scheduleCycleBlockerPull).not.toHaveBeenCalled();
      expect(dispatchWebhooksForEvents).not.toHaveBeenCalled();
    });
  });
});

describe("relation access and legacy compatibility", () => {
  it("denies project access before checking or inserting endpoints", async () => {
    getProjectAccess.mockResolvedValue(null);
    expect(await addIssueRelation({ projectId, actorId, sourceId: lowId, targetId: highId, type: "related" })).toEqual({ ok: false, status: 404, errorKey: "issueNotFound" });
    expect(getProjectAccess).toHaveBeenCalledWith(actorId, projectId);
    expect(service.from).not.toHaveBeenCalled();
  });

  it("checks the stored project before deleting a relation", async () => {
    tables.issue_relations = [{ id: "relation-1", project_id: "other-project", source_id: lowId, target_id: highId, source_type: "objective", target_type: "issue", type: "blocks" }];
    getProjectAccess.mockResolvedValue(null);
    expect(await removeIssueRelation({ relationId: "relation-1", actorId })).toEqual({ ok: false, status: 404, errorKey: "relationNotFound" });
    expect(getProjectAccess).toHaveBeenCalledWith(actorId, "other-project");
    expect(tables.issue_relations).toHaveLength(1);
    expect(events()).toEqual([]);
  });

  it("lists only relations from the requested project", async () => {
    const local = { id: "local", project_id: projectId, source_id: lowId, target_id: highId, source_type: "objective", target_type: "objective", type: "related" };
    tables.issue_relations = [local, { ...local, id: "foreign", project_id: "other-project" }];
    const { project_id: _projectId, ...expected } = local;
    expect(await listIssueRelations(service as never, projectId)).toEqual({ relations: [expected] });
  });

  it.each(types)("keeps implicit issue endpoints and legacy rows working for %s", async (type) => {
    seed(lowId, "issue");
    seed(highId, "issue");
    const added = await addIssueRelation({ projectId, actorId, sourceId: lowId, targetId: highId, type });
    if (!added.ok) throw new Error("Relation was not created");
    expect(events()).toEqual(expect.arrayContaining([
      event(lowId, "issue", "relation_added", type, highId),
      event(highId, "issue", "relation_added", inverse(type), lowId),
    ]));
    delete tables.issue_relations[0].source_type;
    delete tables.issue_relations[0].target_type;
    await removeIssueRelation({ relationId: added.relation.id, actorId });
    expect(events().slice(2)).toEqual(expect.arrayContaining([
      event(lowId, "issue", "relation_removed", type, highId),
      event(highId, "issue", "relation_removed", inverse(type), lowId),
    ]));
  });
});
