import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { isPersistableKey, wasRestoredBeforeMount } from "./query-provider";
import {
  agentRunDiffQueryKey,
  agentRunDiffStatQueryKey,
  agentRunQueryKey,
  allAgentSessionsQueryKey,
  issueAgentRunsQueryKey,
} from "./use-agent-runs";
import { agentActivityQueryKey } from "@/components/agent/agent-activity-context";

// The persistence filter decides what goes to disk (MIN-89). A false positive
// either saturates localStorage with the palette index or restores a completed
// agent run as active after reload.
describe("isPersistableKey", () => {
  it("persists content caches", () => {
    expect(isPersistableKey(["projects"])).toBe(true);
    expect(isPersistableKey(["issues", "p1"])).toBe(true);
    expect(isPersistableKey(["me", "board"])).toBe(true);
    expect(isPersistableKey(["me", "summary"])).toBe(true);
    expect(isPersistableKey(["comments", "i1"])).toBe(true);
  });

  it("excludes the palette index because it can saturate the quota alone", () => {
    expect(isPersistableKey(["me", "search-index"])).toBe(false);
  });

  // The keys below come from lib/use-agent-runs.ts. A guessed exclusion
  // (agent-runs instead of agent-sessions, for example) filters nothing while
  // appearing to work. Importing the real keys keeps the contract honest.
  it("excludes agent streams because they expire within seconds", () => {
    expect(isPersistableKey(issueAgentRunsQueryKey("i1"))).toBe(false);
    expect(isPersistableKey(agentRunQueryKey("r1"))).toBe(false);
    expect(isPersistableKey(["agent-run-events", "r1"])).toBe(false);
    expect(isPersistableKey(agentRunDiffQueryKey("r1"))).toBe(false);
    // DISTINCT segment of ["agent-run-diff"]: the comparison is done segment
    // per segment, so the diff prefix didn't catch it (MIN-303).
    expect(isPersistableKey(agentRunDiffStatQueryKey("r1"))).toBe(false);
    expect(isPersistableKey(allAgentSessionsQueryKey)).toBe(false);
  });

  // The activity poll runs every 4 s while an agent is working. It used to be
  // serialized on every tick because the filter targeted a key that no query
  // used (MIN-303). Import the key instead of copying it.
  it("excludes agent activity polling under its real key", () => {
    expect(isPersistableKey(agentActivityQueryKey("p1"))).toBe(false);
    expect(isPersistableKey(agentActivityQueryKey(null))).toBe(false);
  });

  it("excludes pull requests and their comments", () => {
    expect(isPersistableKey(["pull-requests", "all"])).toBe(false);
    expect(isPersistableKey(["pr-comments", "r1"])).toBe(false);
    expect(isPersistableKey(["pr-review-comments", "r1"])).toBe(false);
  });

  it("excludes billing so entitlements and quotas restart from the server", () => {
    expect(isPersistableKey(["billing", "status"])).toBe(false);
    expect(isPersistableKey(["billing", "usage"])).toBe(false);
  });

  it("excludes the deployment SHA so the update banner stays dismissed after reload", () => {
    expect(isPersistableKey(["version"])).toBe(false);
  });

  // A page body can reach 1 MB while the quota is roughly 5 MB. The list has
  // no bodies and must remain persistent because it paints the tree on reload.
  it("excludes page bodies but preserves page lists", () => {
    expect(isPersistableKey(["page", "pg1"])).toBe(false);
    expect(isPersistableKey(["pages", "p1"])).toBe(true);
  });

  it("does not confuse a prefix with a neighboring key", () => {
    // ["me","board"] shares its first segment with ["me","search-index"]:
    // the filter should compare the entire prefix, not just key[0].
    expect(isPersistableKey(["me", "cycle"])).toBe(true);
    expect(isPersistableKey(["me", "scratchpad"])).toBe(true);
    // A name that starts the same without being the same segment remains persistent.
    expect(isPersistableKey(["agent-reads"])).toBe(true);
  });
});

describe("wasRestoredBeforeMount", () => {
  it("selects only persistable data written before the provider mounted", () => {
    const client = new QueryClient();
    client.setQueryData(["projects"], [{ id: "p1" }], { updatedAt: 1_000 });
    client.setQueryData(["issues", "p1"], [], { updatedAt: 2_000 });
    client.setQueryData(["billing", "status"], { planId: "free" }, { updatedAt: 1_000 });

    const queries = client.getQueryCache().getAll();
    expect(
      queries.filter((query) => wasRestoredBeforeMount(query, 1_500)).map((query) => query.queryKey),
    ).toEqual([["projects"]]);

    client.clear();
  });

  it("ignores empty queries", () => {
    const client = new QueryClient();
    const observer = client.getQueryCache().build(client, {
      queryKey: ["projects"],
      queryFn: async () => [],
    });

    expect(wasRestoredBeforeMount(observer, Date.now())).toBe(false);
    client.clear();
  });
});
