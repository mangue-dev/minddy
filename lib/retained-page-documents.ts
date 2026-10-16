const SMALL_PAGE_NODES = 200;
const SMALL_PAGE_TEXT = 25_000;
const TEXT_NODES = new Set(["doc", "paragraph", "text", "heading", "bulletList", "orderedList",
  "listItem", "taskList", "taskItem", "blockquote", "hardBreak", "horizontalRule", "codeBlock", "mention"]);

/** Unknown, database, embedded and large bodies retain the existing two-unit cost. */
export function retainedPageDocumentCost(value: unknown): 1 | 2 {
  if (!value || typeof value !== "object") return 2;
  const page = value as { database_schema?: unknown; content?: unknown };
  if (page.database_schema !== null || !page.content || typeof page.content !== "object") return 2;
  if ((page.content as { type?: unknown }).type !== "doc") return 2;
  const pending: unknown[] = [page.content];
  let nodes = 0, text = 0, attributesVisited = 0;
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || ++nodes > SMALL_PAGE_NODES) return 2;
    const node = value as { type?: unknown; text?: unknown; content?: unknown; attrs?: unknown; marks?: unknown };
    if (typeof node.type !== "string" || !TEXT_NODES.has(node.type)) return 2;
    if (node.text !== undefined) {
      if (typeof node.text !== "string" || (text += node.text.length) > SMALL_PAGE_TEXT) return 2;
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content) || node.content.length + nodes > SMALL_PAGE_NODES) return 2;
      pending.push(...node.content);
    }
    const attributes = [node.attrs, node.marks];
    while (attributes.length) {
      const attribute = attributes.pop();
      if (++attributesVisited > 1000) return 2;
      if (typeof attribute === "string") {
        if ((text += attribute.length) > SMALL_PAGE_TEXT) return 2;
      } else if (attribute && typeof attribute === "object") {
        for (const key in attribute) {
          if (attributes.length >= 1000) return 2;
          if (Object.prototype.hasOwnProperty.call(attribute, key)) attributes.push((attribute as Record<string, unknown>)[key]);
        }
      }
    }
  }
  return 1;
}

/** Keep one eligible previous document plus the active surface, never a large inactive body. */
export function retainPageDocuments(previous: readonly string[], active: string | null, eligible: ReadonlySet<string>): string[] {
  const retained = [...new Set(previous)].filter((id) => id !== active && eligible.has(id));
  return active ? [...retained.slice(-1), active] : retained.slice(-2);
}
