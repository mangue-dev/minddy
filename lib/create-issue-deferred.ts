import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";

import { createIssueApi } from "@/lib/issues-api";
import { fallbackIssueTitle } from "@/lib/issue-title-fallback";
import { buildOptimisticIssue } from "@/lib/optimistic-issue";
import {
  cachedProjectIssues,
  insertIssueEverywhere,
  issueWrites,
  mergeServerIssue,
  removeIssueEverywhere,
} from "@/lib/optimistic/issue-writes";
import {
  beginSmartFillReveal,
  endSmartFillReveal,
  landSmartFillReveal,
} from "@/lib/smart-fill-reveal";
import { snapshotIssue } from "@/lib/undo/undo-core";
import type { UndoAction } from "@/lib/undo/undo-core";
import type { CreateIssueInput, Issue } from "@/lib/types";

/**
 * A SMART FILL CREATION (MIN-260, MIN-1032): the card appears at once, empty,
 * and unveils what Smart Fill wrote once the server has filled the issue.
 *
 * The server fills the issue BEFORE inserting it, so for a few seconds the
 * row does not exist. The card is placed anyway, as on the other creation
 * paths: born with the id the server will keep (lib/optimistic-issue.ts), and
 * registered in the pending writes so a GET older than it cannot make it
 * disappear and the realtime echo of the insert is recognized as ours.
 *
 * It shows the issue as the author left it: the properties Smart Fill owns
 * are empty, and a missing title leaves the card showing the description,
 * muted, until Smart Fill has written one. The reveal store
 * (lib/smart-fill-reveal.ts) freezes that face until the filled row lands,
 * then the card sweeps to it (components/smart-fill-reveal.tsx).
 *
 * Failure is SAID: the card leaves and the toast explains why.
 */
export function createIssueDeferred({
  queryClient,
  projectId,
  input,
  record,
  userId = null,
}: {
  queryClient: QueryClient;
  projectId: string;
  input: CreateIssueInput;
  record: (action: UndoAction) => void;
  userId?: string | null;
}): Issue {
  const optimistic = buildOptimisticIssue(
    input,
    projectId,
    userId,
    cachedProjectIssues(queryClient, projectId),
  );
  const untitled = !optimistic.title.trim();
  // Other views (lists, the palette) read the cached row: an untitled one
  // carries the same fallback the server keeps when no model answers.
  const placeholder: Issue = untitled
    ? { ...optimistic, title: fallbackIssueTitle(input.description) ?? "" }
    : optimistic;
  // Registered BEFORE the insert (MIN-156), as on the plain creation path.
  const handle = issueWrites.begin({ kind: "insert", row: placeholder });
  beginSmartFillReveal(placeholder, untitled ? (input.description ?? null) : null);
  insertIssueEverywhere(queryClient, projectId, placeholder);
  void createIssueApi(projectId, { ...input, id: placeholder.id }).then(
    (issue) => {
      insertIssueEverywhere(queryClient, projectId, issue);
      mergeServerIssue(queryClient, projectId, issue);
      issueWrites.settle(handle, issue);
      landSmartFillReveal(issue);
      record({
        kind: "create",
        projectId,
        issueId: issue.id,
        snapshot: snapshotIssue(issue),
      });
    },
    (err) => {
      issueWrites.fail(handle);
      endSmartFillReveal(placeholder.id);
      removeIssueEverywhere(queryClient, projectId, placeholder.id);
      toast.error((err as Error).message);
    },
  );
  return placeholder;
}
