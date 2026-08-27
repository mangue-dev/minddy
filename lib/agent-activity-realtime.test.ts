import { describe, expect, it } from "vitest";

import {
  agentActivityPollInterval,
} from "@/components/agent/agent-activity-context";
import {
  keysForProjectEvent,
  keysForUserEvent,
  projectScopeKeys,
  USER_SCOPE_KEYS,
  type BroadcastChange,
} from "./realtime-keys";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function change(table: string): BroadcastChange {
  return {
    operation: "UPDATE",
    table,
    schema: "public",
    record: { issue_id: "22222222-2222-4222-8222-222222222222" },
    old_record: null,
  };
}

function hasAgentActivityKey(keys: readonly (readonly unknown[])[]): boolean {
  return keys.some((key) => key.length === 1 && key[0] === "agent-active-issues");
}

describe("agent activity refresh policy", () => {
  it("does not poll an idle board and keeps the active-work backstop", () => {
    expect(agentActivityPollInterval(undefined)).toBe(false);
    expect(agentActivityPollInterval([])).toBe(false);
    expect(agentActivityPollInterval(["issue-1"])).toBe(4000);
  });

  it("refreshes board activity for personal and project agent-run events", () => {
    expect(
      hasAgentActivityKey(keysForUserEvent(change("agent_runs")).map(({ key }) => key)),
    ).toBe(true);
    expect(
      hasAgentActivityKey(
        keysForProjectEvent(change("agent_runs"), PROJECT).map(({ key }) => key),
      ),
    ).toBe(true);
  });

  it("refreshes board activity when a pull request changes", () => {
    expect(
      hasAgentActivityKey(
        keysForProjectEvent(change("pull_requests"), PROJECT).map(({ key }) => key),
      ),
    ).toBe(true);
  });

  it("includes board activity in user and project reconnect catch-up", () => {
    expect(hasAgentActivityKey(USER_SCOPE_KEYS)).toBe(true);
    expect(hasAgentActivityKey(projectScopeKeys(PROJECT))).toBe(true);
  });
});
