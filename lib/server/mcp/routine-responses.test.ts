import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { RoutineTrigger } from "@/lib/routine-triggers";
import type { ToolExtra, ToolResult } from "./tool-helpers";
import { registerMinddyTools } from "./tools";

const h = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/server/routines", () => ({
  createRoutine: h.create, updateRoutine: h.update, listRoutinesForUser: h.list,
}));
vi.mock("./tool-helpers", async importOriginal => ({
  ...await importOriginal<typeof import("./tool-helpers")>(),
  requireProject: async () => ({ userId: "owner", access: { project: { id: "project" } } }),
}));

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) { handlers.set(name, handler); },
} as unknown as McpServer);

beforeEach(() => vi.clearAllMocks());

const triggers: RoutineTrigger[] = [
  { type: "schedule" },
  { type: "event", event: "issue.status_changed", status: "triage", delayMinutes: 7,
    conditions: { operator: "or", children: [{ field: "priority", operator: "eq", value: "high" }, { field: "assignee", operator: "present" }] } },
  { type: "database", databaseId: "database", delayMinutes: 2,
    conditions: { field: "property", propertyId: "score", operator: "gte", value: 0 } },
];

describe("MCP routine response triggers", () => {
  it.each(triggers)("returns the complete $type trigger from list, create and update", async trigger => {
    const routine = { id: "routine", project_id: "project", title: "Review arrivals", prompt: "Review incoming work",
      trigger, timezone: "Europe/Paris", frequency: "daily", hour: 0, minute: 0, weekdays: null, days_of_month: null,
      max_spend_percent: 15, enabled: true, next_run_at: trigger.type === "schedule" ? "2026-10-13T08:00:00Z" : null,
      last_run_at: null, last_error: null };
    h.create.mockResolvedValue({ ok: true, routine });
    h.update.mockResolvedValue({ ok: true, routine });
    h.list.mockResolvedValue([routine, { ...routine, project_id: "other-project" }]);
    for (const name of ["minddy_list_routines", "minddy_create_routine", "minddy_update_routine"]) {
      const result = await handlers.get(name)!({ project_id: "project", routine_id: "routine", prompt: routine.prompt,
        timezone: routine.timezone, trigger }, {});
      expect(result.isError).not.toBe(true);
      const response = JSON.parse(result.content[0].text);
      const returned = response.routines ? response.routines[0] : response.routine;
      if (response.routines) expect(response.routines).toHaveLength(1);
      expect(returned.trigger).toEqual(trigger);
      expect(returned).toMatchObject({ id: routine.id, timezone: routine.timezone, frequency: routine.frequency,
        next_run_at: routine.next_run_at, max_spend_percent: routine.max_spend_percent });
    }
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ trigger }));
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ trigger }));
  });
});
