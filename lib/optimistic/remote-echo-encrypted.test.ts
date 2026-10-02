import { beforeEach, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { adoptRemoteRow, remoteEchoOf, type RemoteChange } from "./remote-echo";
import { applyPendingIssues, applyPendingObjectives, issueWrites, objectiveWrites } from "./issue-writes";
import { GLOBAL_BOARD_KEY } from "./issue-writes";
import { SEARCH_INDEX_KEY } from "../use-search-index";
import type { Issue, Objective } from "../types";

beforeEach(() => { issueWrites.reset(); objectiveWrites.reset(); });

it.each(["INSERT", "UPDATE"] as const)("does not adopt protected %s broadcasts into content caches", (operation) => {
  const client = new QueryClient();
  const project = "project";
  const issue = { id: "issue", project_id: project, title: "Decoded issue", category_ids: [] } as unknown as Issue;
  const objective = { id: "objective", project_id: project, name: "Decoded objective" } as unknown as Objective;
  client.setQueryData(["issues", project], [issue]);
  client.setQueryData(["objectives", project], [objective]);
  client.setQueryData(GLOBAL_BOARD_KEY, { issues: [issue], objectives: { [project]: [objective] } });
  client.setQueryData(SEARCH_INDEX_KEY, { issues: [issue], objectives: [objective] });
  const before = client.getQueriesData({});
  for (const [table, id] of [["issues", issue.id], ["objectives", objective.id]]) {
    const change: RemoteChange = { operation, table,
      record: { id, project_id: project, title: null, name: null, description: null,
        encrypted_content: null, encryption_version: 1 }, old_record: null };
    adoptRemoteRow(client, project, remoteEchoOf(change));
  }
  expect(client.getQueriesData({})).toEqual(before);
  // An incomplete broadcast must not overlay the following decoded HTTP result.
  expect(applyPendingIssues([{ ...issue, title: "Fresh issue" }], 0, project))
    .toEqual([{ ...issue, title: "Fresh issue" }]);
  expect(applyPendingObjectives([{ ...objective, name: "Fresh objective" }], 0, project))
    .toEqual([{ ...objective, name: "Fresh objective" }]);
});

it.each(["issues", "objectives"])("still removes protected %s rows on trash and deletion", (table) => {
  for (const operation of ["UPDATE", "DELETE"] as const) {
    const row = { id: "entity", title: null, name: null, encryption_version: 1,
      ...(operation === "UPDATE" ? { deleted_at: "2026-09-30T00:00:00Z" } : {}) };
    expect(remoteEchoOf({ operation, table, record: operation === "UPDATE" ? row : null,
      old_record: row })).toEqual({ entity: table === "issues" ? "issue" : "objective",
      kind: "remove", id: "entity" });
  }
});
