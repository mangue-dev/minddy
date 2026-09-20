import type { Attachment, ResourceInput } from "./types";

/** Render already-uploaded resources while their attachment rows are created. */
export function optimisticAttachments(
  inputs: ResourceInput[],
  commentId: string,
  issueId: string,
  authorId: string,
  createdAt: string,
  projectId: string,
  pages: ReadonlyArray<{ id: string; title: string; icon: string | null }> = [],
): Attachment[] {
  return inputs.map((input, index) => ({
    id: `${commentId}:${index}`,
    project_id: projectId,
    issue_id: issueId,
    objective_id: null,
    comment_id: commentId,
    created_by: authorId,
    created_at: createdAt,
    storage_path: null,
    mime_type: input.kind === "link" ? "text/uri-list" : "application/vnd.minddy.page",
    size_bytes: 0,
    ...input,
    kind: input.kind ?? "file",
    ...(input.kind === "page" ? {
      page: pages.find((page) => page.id === input.page_id) ?? { id: input.page_id, title: input.file_name, icon: null },
    } : {}),
  }));
}
