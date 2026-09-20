import { describe, expect, it } from "vitest";
import { keysForProjectEvent, projectScopeKeys, type BroadcastChange } from "./realtime-keys";

describe("tab label freshness", () => {
  it.each(["pages", "objectives", "pull_requests", "agent_routines"])("refreshes narrow metadata after a remote %s change", (table) => {
    const change: BroadcastChange = { table, schema: "public", operation: "UPDATE", record: { id: "row" }, old_record: null };
    expect(keysForProjectEvent(change, "project")).toContainEqual({ key: ["app-tab-metadata"], refetch: "active" });
  });
  it("reconciles metadata after a realtime reconnect", () => {
    expect(projectScopeKeys("project")).toContainEqual(["app-tab-metadata"]);
  });
});
