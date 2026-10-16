import { hashKey, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createNavigationWorkingSet, navigationWorkingSetQueryHashes, NAVIGATION_WORKING_SET_QUERY_LIMIT } from "./navigation-working-set";

describe("navigation working set metadata", () => {
  it("unions independent leases, replaces exact keys and isolates accounts without creating queries", () => {
    const client = new QueryClient(), other = new QueryClient();
    const first = createNavigationWorkingSet(client), second = createNavigationWorkingSet(client), foreign = createNavigationWorkingSet(other);
    try {
      first.replace([["issues", "project"], ["feedback", { status: "open", project: "project" }]]);
      second.replace([["issues", "project"], ["pages", "project"]]);
      foreign.replace([["issues", "foreign"]]);
      expect(navigationWorkingSetQueryHashes(client)).toEqual(new Set([
        hashKey(["issues", "project"]), hashKey(["feedback", { project: "project", status: "open" }]), hashKey(["pages", "project"]),
      ]));
      first.replace([["objectives", "project"]]);
      expect(navigationWorkingSetQueryHashes(client)).toEqual(new Set([
        hashKey(["objectives", "project"]), hashKey(["issues", "project"]), hashKey(["pages", "project"]),
      ]));
      first.dispose(); first.replace([["late", "retired"]]);
      expect(navigationWorkingSetQueryHashes(client)).toEqual(new Set([hashKey(["issues", "project"]), hashKey(["pages", "project"])]));
      second.dispose();
      expect(navigationWorkingSetQueryHashes(client).size).toBe(0);
      expect(navigationWorkingSetQueryHashes(other)).toEqual(new Set([hashKey(["issues", "foreign"])]));
      expect(client.getQueryCache().getAll()).toHaveLength(0);
      expect(other.getQueryCache().getAll()).toHaveLength(0);
    } finally { first.dispose(); second.dispose(); foreign.dispose(); client.clear(); other.clear(); }
  });

  it("bounds unique preferences and returns an isolated snapshot", () => {
    const client = new QueryClient(), owner = createNavigationWorkingSet(client);
    try {
      owner.replace(Array.from({ length: NAVIGATION_WORKING_SET_QUERY_LIMIT + 20 }, (_, index) => ["issues", `project-${index}`]));
      const snapshot = navigationWorkingSetQueryHashes(client);
      expect(snapshot.size).toBe(NAVIGATION_WORKING_SET_QUERY_LIMIT);
      (snapshot as Set<string>).clear();
      expect(navigationWorkingSetQueryHashes(client).size).toBe(NAVIGATION_WORKING_SET_QUERY_LIMIT);
      owner.replace([]);
      expect(navigationWorkingSetQueryHashes(client).size).toBe(0);
    } finally { owner.dispose(); client.clear(); }
  });
});
