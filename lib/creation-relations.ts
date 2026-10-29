"use client";

import { toast } from "sonner";
import { addIssueRelationApi } from "./issue-relations-api";
import { updateIssueApi } from "./issues-api";
import type { PendingRelationInput, RelationEndpointType } from "./types";

/** All creation paths, including deferred Smart Fill, save links after the POST.
 * A link failure must never roll back an entity that already exists or invite
 * the user to create it again. Report it and continue saving the other links.
 * The existing relation realtime subscription refreshes the project caches. */
export async function saveCreationRelations(
  projectId: string,
  sourceId: string,
  sourceType: RelationEndpointType,
  relations: PendingRelationInput[] = [],
): Promise<void> {
  for (const relation of relations) {
    try {
      // A hierarchy link is a parent change, not a stored relation (MIN-804):
      // the target becomes this issue's sub-issue, or its parent.
      if (relation.type === "parent_of") {
        await updateIssueApi(relation.target_id, { parent_id: sourceId });
        continue;
      }
      if (relation.type === "sub_issue_of") {
        await updateIssueApi(sourceId, { parent_id: relation.target_id });
        continue;
      }
      await addIssueRelationApi(projectId, {
        source_id: sourceId,
        source_type: sourceType,
        target_id: relation.target_id,
        target_type: relation.target_type,
        type: relation.type,
      });
    } catch (err) {
      toast.error((err as Error).message, { description: relation.target_label });
    }
  }
}
