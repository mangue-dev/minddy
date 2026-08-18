import { toast } from "mangue-ui";
import type { QueryClient } from "@tanstack/react-query";

import { createIssueApi } from "@/lib/issues-api";
import { insertIssueEverywhere, mergeServerIssue } from "@/lib/optimistic/issue-writes";
import { snapshotIssue } from "@/lib/undo/undo-core";
import type { UndoAction } from "@/lib/undo/undo-core";
import type { CreateIssueInput } from "@/lib/types";

/**
 * CREATE WITHOUT OPTIMISTIC CARD — the Smart-fill path (MIN-260).
 *
 * The three surfaces that create a ticket (the project board, the aggregate board
 *, the global dialog) first place a card, then POST: it is this
 * which makes creation instantaneous, and the ticket already carries everything we just
 * wrote.
 *
 * With Smart-fill, no — and that's the only thing that changes. The server fills
 * the ticket BEFORE inserting it, so for a few seconds the line does not exist
 *; an optimistic map would show exactly what the feature is not showing — a no-priority, no-effort, no-category ticket, which is rewriting itself before your eyes. We therefore show nothing, the dialog poses its toast
 * ("it will appear in a few seconds"), and the card arrives complete: by
 * this response, or by direct, to the first of the two (`insertIssueEverywhere`
 * duplicates by id, the two paths can therefore win without stepping on each other
 * above).
 *
 * Nothing is entered in the pending write register (`issueWrites`): it only serves to protect a card already on the screen from a GET older than it, and
 * here there is no carte.
 *
 * Failure is SAYED. With no card to remove, this toast is all that separates
 * the user from a ticket they believe is coming and will never exist.
 */
export function createIssueDeferred({
  queryClient,
  projectId,
  input,
  record,
}: {
  queryClient: QueryClient;
  projectId: string;
  input: CreateIssueInput;
  record: (action: UndoAction) => void;
}): void {
  void createIssueApi(projectId, input).then(
    (issue) => {
      insertIssueEverywhere(queryClient, projectId, issue);
      mergeServerIssue(queryClient, projectId, issue);
      record({
        kind: "create",
        projectId,
        issueId: issue.id,
        snapshot: snapshotIssue(issue),
      });
    },
    (err) => toast.error((err as Error).message),
  );
}
