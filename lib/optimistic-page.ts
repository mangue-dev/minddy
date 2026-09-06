import type { CreatePageInput } from "./pages-api";
import { isPosition, positionAtEnd, type Page } from "./pages";

/** Build the page shown while its creation request is still in flight. */
export function buildOptimisticPage(
  projectId: string,
  input: CreatePageInput,
  existing: readonly Pick<Page, "parent_id" | "position">[],
): Page {
  const parentId = typeof input.parent_id === "string" ? input.parent_id : null;
  const now = new Date().toISOString();

  return {
    id: input.id ?? crypto.randomUUID(),
    project_id: projectId,
    database_schema: input.database_schema ?? null,
    database_revision: 0,
    database_title_name: null,
    property_values: {},
    parent_id: parentId,
    title: input.title ?? "",
    icon: input.icon ?? null,
    content: input.content ?? { type: "doc", content: [] },
    version: 1,
    position: isPosition(input.position) ? input.position : positionAtEnd(
      existing.filter((page) => (page.parent_id ?? null) === parentId),
    ),
    favorite: false,
    created_by: null,
    updated_by: null,
    updated_kind: "human",
    updated_api_key_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    deleted_by: null,
    deleted_root_id: null,
    parent_block_removed: false,
  };
}
