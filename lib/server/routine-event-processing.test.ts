import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineEventRow } from "./routine-event-processing";

const h = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, owner: true, start: vi.fn(), execute: vi.fn(), claims: [] as string[] }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: async () => h.owner ? { isOwner: true } : null }));
vi.mock("@/lib/server/routine-content", () => ({ decodeRoutine: async (row: unknown) => row }));
vi.mock("@/lib/server/issue-store", () => ({ decodeIssue: async (row: unknown) => row }));
vi.mock("@/lib/server/page-content", () => ({ decodePage: async (row: unknown) => row }));
vi.mock("@/lib/server/routine-occurrences", () => ({ startRoutineOccurrence: h.start }));
vi.mock("@/lib/server/numo/turns", () => ({ executeNumoTurn: h.execute }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  from: (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let patch: Record<string, unknown> | null = null, cap = Infinity;
    const q: Record<string, unknown> = {};
    q.select = q.order = () => q;
    q.eq = q.is = (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; };
    q.neq = (key: string, value: unknown) => { filters.push(row => row[key] !== value); return q; };
    q.in = (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; };
    q.lte = (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return q; };
    q.limit = (n: number) => { cap = n; return q; };
    q.update = (values: Record<string, unknown>) => { patch = values; return q; };
    const apply = () => { const rows = (h.tables[table] ?? []).filter(row => filters.every(f => f(row))).slice(0, cap); if (patch) rows.forEach(row => Object.assign(row, patch)); return rows; };
    q.maybeSingle = async () => ({ data: apply()[0] ?? null, error: null });
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: apply(), error: null }).then(resolve);
    return q;
  },
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    if (name === "claim_routine_events") {
      const e = h.tables.routine_events.find(row => !row.processed_at && !row.claimed);
      if (e) e.claimed = true;
      return { data: e ? [e] : [], error: null };
    }
    if (name === "arm_routine_event") {
      const e = h.tables.routine_events.find(row => row.id === args.p_event_id)!;
      if (!h.tables.routine_armings.some(row => row.event_id === e.id && row.routine_id === args.p_routine_id)) h.tables.routine_armings.push({ id: randomUUID(), routine_id: args.p_routine_id, revision: args.p_revision, event_id: e.id, project_id: e.project_id, subject_type: e.subject_type, subject_id: e.subject_id, state: "armed", request_id: randomUUID(), attempts: 0, retry_at: new Date(Date.now()+Number(args.p_delay_minutes)*60_000).toISOString() });
    }
    if (name === "claim_routine_arming") {
      const a = h.tables.routine_armings.find(row => row.id === args.p_id)!;
      if (String(a.retry_at)>new Date().toISOString() || !["armed","reserved"].includes(a.state as string)) return { data: null, error: null };
      Object.assign(a,{state:"reserved",lease_token:randomUUID(),attempts:Number(a.attempts)+1}); h.claims.push(String(a.request_id));
      return { data: [{...a}], error: null };
    }
    return { data: null, error: null };
  },
}) }));
const { processRoutineEvents, eventMatchesTrigger } = await import("./routine-event-processing");
const project = randomUUID(), subject = randomUUID(), routine = randomUUID(), database = randomUUID(), property = randomUUID();
function emit(id: number, event = "issue.status_changed", after: Record<string, unknown> = { status: "triage" }) {
  h.tables.routine_events.push({ id, project_id: project, subject_id: subject, subject_type: "issue", event, before_state: {}, after_state: after, cause_routine_id: null, cause_routine_ids: [], lease_token: String(id), attempts: 1 });
}
beforeEach(() => {
  h.tables = { agent_routines: [{ id: routine,project_id:project,owner_id:"owner",enabled:true,deleted_at:null,trigger_revision:1,trigger_type:"event",trigger:{type:"event",event:"issue.status_changed",status:"triage",conditions:{field:"assignee",operator:"present"}} }],routine_events:[],routine_armings:[],issues:[{id:subject,project_id:project,status:"triage",assignee_id:null,deleted_at:null}],issue_categories:[],pages:[] };
  h.owner=true; h.claims=[]; h.start.mockReset().mockResolvedValue({turn:{id:"turn"}}); h.execute.mockReset().mockResolvedValue({});
});
describe("durable routine orchestration", () => {
  it("bounds fan-out admissions, finishes the event and lets the Numo drain execute queued turns", async () => {
    h.tables.issues[0].assignee_id = "person";
    const first = h.tables.agent_routines[0];
    h.tables.agent_routines = Array.from({ length: 7 }, (_, i) => ({ ...first, id: i ? randomUUID() : routine }));
    // An inline model call would never return within the event-processing tick.
    h.execute.mockImplementation(() => new Promise(() => {}));
    emit(1);
    await processRoutineEvents(2);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.tables.routine_events[0].processed_at).toBeTruthy();
    expect(h.tables.routine_events[0].lease_until).toBeNull();
    expect(h.tables.routine_armings).toHaveLength(7);
    expect(h.tables.routine_armings.filter(a => a.state === "armed")).toHaveLength(5);
    const deferred = h.tables.routine_armings[2].request_id;
    await processRoutineEvents(2);
    expect(h.start).toHaveBeenCalledTimes(4);
    expect(h.start).toHaveBeenNthCalledWith(3, expect.objectContaining({ requestId: deferred }));
  });

  it("shares the admission allowance across new events, quota failures and retries", async () => {
    h.tables.issues[0].assignee_id = "person";
    const first = h.tables.agent_routines[0];
    h.tables.agent_routines = Array.from({ length: 4 }, (_, i) => ({ ...first, id: i ? randomUUID() : routine }));
    h.start.mockRejectedValue(new Error("usage_budget_exceeded"));
    emit(1);
    await processRoutineEvents(1);
    expect(h.start).toHaveBeenCalledTimes(1);
    h.tables.routine_armings[0].retry_at = new Date(0).toISOString();
    emit(2, "issue.updated", { status: "triage", assignee: "person" });
    await processRoutineEvents(1);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.claims[1]).toBe(h.claims[0]);
    expect(h.tables.routine_armings[0].state).toBe("reserved");
  });

  it("cancels deferred status armings even after the admission allowance is spent", async () => {
    h.tables.issues[0].assignee_id = "person";
    const first = h.tables.agent_routines[0];
    h.tables.agent_routines = Array.from({ length: 4 }, (_, i) => ({ ...first, id: i ? randomUUID() : routine }));
    emit(1);
    emit(2, "issue.status_changed", { status: "backlog" });
    await processRoutineEvents(2);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.tables.routine_events.every(e => e.processed_at)).toBe(true);
    expect(h.tables.routine_armings.filter(a => a.state === "cancelled")).toHaveLength(2);
    expect(h.tables.routine_armings.every(a => ["consumed", "cancelled"].includes(a.state as string))).toBe(true);
  });

  it("keeps an unmatched item armed and consumes it once after a later edit", async () => {
    emit(1); await processRoutineEvents();
    expect(h.tables.routine_armings[0].state).toBe("armed"); expect(h.start).not.toHaveBeenCalled();
    h.tables.issues[0].assignee_id="person"; h.tables.routine_armings[0].retry_at=new Date(0).toISOString();
    emit(2,"issue.updated",{status:"triage",assignee:"person"}); await processRoutineEvents();
    await processRoutineEvents();
    expect(h.start).toHaveBeenCalledTimes(1); expect(h.tables.routine_armings[0].state).toBe("consumed");
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({origin:"event",provenance:expect.objectContaining({subjectId:subject,eventId:"1"})}));
  });
  it("cancels waiting status entries on exit and rearms a subsequent entry", async () => {
    emit(1); await processRoutineEvents();
    emit(2,"issue.status_changed",{status:"backlog"}); await processRoutineEvents();
    expect(h.tables.routine_armings[0].state).toBe("cancelled");
    emit(3); await processRoutineEvents();
    expect(h.tables.routine_armings[1].state).toBe("armed");
  });
  it("preserves delayed admission when missing conditions are reevaluated", async () => {
    (h.tables.agent_routines[0].trigger as Record<string,unknown>).delayMinutes=30;
    emit(1); await processRoutineEvents();
    expect(Date.parse(h.tables.routine_armings[0].retry_at as string)-Date.now()).toBeGreaterThan(29*60_000);
    h.tables.issues[0].assignee_id="person";
    emit(2,"issue.updated",{status:"triage",assignee:"person"}); await processRoutineEvents();
    expect(h.start).not.toHaveBeenCalled();
  });
  it("retries the same reserved identity after quota admission fails", async () => {
    h.tables.issues[0].assignee_id="person"; emit(1);
    h.start.mockRejectedValueOnce(new Error("usage_budget_exceeded")); await processRoutineEvents();
    const a=h.tables.routine_armings[0]; expect(a.error_code).toBe("quota"); expect(a.state).toBe("reserved");
    a.retry_at=new Date(0).toISOString(); await processRoutineEvents();
    expect(h.claims[0]).toBe(h.claims[1]); expect(h.start).toHaveBeenCalledTimes(2); expect(a.state).toBe("consumed");
  });
  it("refuses changed ownership and invalidates stale revisions", async () => {
    emit(1); await processRoutineEvents();
    h.owner=false; h.tables.routine_armings[0].retry_at=new Date(0).toISOString(); await processRoutineEvents();
    expect(h.tables.routine_armings[0].state).toBe("cancelled"); expect(h.start).not.toHaveBeenCalled();
  });
  it("does not rearm causal writes but still processes independent changes", async () => {
    h.tables.issues[0].assignee_id="person";emit(1);h.tables.routine_events[0].cause_routine_ids=[routine];
    await processRoutineEvents(); expect(h.tables.routine_armings).toHaveLength(0);
    emit(2);await processRoutineEvents();expect(h.start).toHaveBeenCalledTimes(1);
  });
  it("waits for typed database values and reports an invalidated schema", async () => {
    Object.assign(h.tables.agent_routines[0],{trigger_type:"database",trigger:{type:"database",databaseId:database,conditions:{field:"property",propertyId:property,operator:"present"}}});
    h.tables.pages=[{id:subject,project_id:project,parent_id:database,property_values:{},deleted_at:null},{id:database,project_id:project,database_schema:[{id:property,name:"Score",type:"number"}],deleted_at:null}];
    emit(1,"page.arrived",{parent_id:database});h.tables.routine_events[0].subject_type="page";await processRoutineEvents();
    expect(h.tables.routine_armings[0].state).toBe("armed");
    h.tables.pages[1].database_schema=[];h.tables.routine_armings[0].retry_at=new Date(0).toISOString();await processRoutineEvents();
    expect(h.tables.routine_armings[0].error_code).toBe("invalidConditionReference");expect(h.start).not.toHaveBeenCalled();
  });
  it("only follows the configured issue for comment triggers", () => {
    const e={event:"issue.comment_added",subject_id:subject} as RoutineEventRow;
    expect(eventMatchesTrigger({type:"event",event:"issue.comment_added",issueId:subject},e)).toBe(true);
    expect(eventMatchesTrigger({type:"event",event:"issue.comment_added",issueId:randomUUID()},e)).toBe(false);
  });
});


it("reevaluates conditions after a quota reservation before admitting its first turn", async () => {
  h.tables.issues[0].assignee_id="owner";
  h.start.mockRejectedValueOnce(new Error("usage_budget_exceeded"));
  emit(1, "issue.status_changed", { status: "triage", assignee: "owner" });
  await processRoutineEvents();
  const arming = h.tables.routine_armings[0];
  expect(arming.state).toBe("reserved");
  arming.retry_at = "2000-01-01T00:00:00Z";
  h.tables.issues[0].assignee_id=null;
  emit(2, "issue.updated", { status: "triage", assignee: null });
  await processRoutineEvents();
  expect(h.start).toHaveBeenCalledTimes(1);
  arming.retry_at = "2000-01-01T00:00:00Z";
  h.tables.issues[0].assignee_id="owner";
  emit(3, "issue.updated", { status: "triage", assignee: "owner" });
  await processRoutineEvents();
  expect(h.start).toHaveBeenCalledTimes(2);
  expect(h.claims[0]).toBe(h.claims[1]);
  expect(arming.state).toBe("consumed");
});
