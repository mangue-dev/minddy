import { numoToolCapability } from "./tool-policy";
import type { AssistantToolDef } from "./tools";

export const READ_ONLY_PROJECT_MESSAGE =
  "The user is a Reader in this project: it is read-only for them, so this " +
  "action is not available. Tell the user plainly; do not retry and do not " +
  "look for a workaround. The project owner can change their role.";

export const COMMENT_NOT_ALLOWED_MESSAGE =
  "The user is a Reader in this project and is not allowed to comment. Tell " +
  "the user plainly; do not retry. The project owner can allow comments.";

/**
 * The tools a turn bound to a project where the user is a Reader may use:
 * reads (personal and project), plus comments when the owner allowed them.
 */
export function readerToolSet<Tool extends AssistantToolDef>(
  tools: readonly Tool[],
  canComment: boolean,
): Tool[] {
  return tools.filter((tool) => {
    const capability = numoToolCapability(tool.function.name);
    return (
      capability === "personal" ||
      capability === "read" ||
      (canComment && capability === "comment")
    );
  });
}
