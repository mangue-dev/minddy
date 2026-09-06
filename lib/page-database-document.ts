import type { JSONContent } from "@tiptap/core";
import type { DatabaseProperty, DatabaseValues } from "./page-databases";
import { databasePropertyValue, databaseValueText } from "./page-databases";

export interface DatabaseDocumentPage {
  id: string;
  parent_id: string | null;
  title: string;
  content?: unknown;
  created_at?: string;
  database_schema?: DatabaseProperty[] | null;
  property_values?: DatabaseValues;
}

/** Project database data into ordinary blocks for publication, print, and export. */
export function pageDatabaseDocument(
  page: DatabaseDocumentPage,
  visiblePages: readonly DatabaseDocumentPage[],
  names: ReadonlyMap<string, string>,
  href?: (pageId: string) => string,
): JSONContent | null {
  const paragraph = (text: string): JSONContent => ({
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  });
  const values = (entry: DatabaseDocumentPage, schema: DatabaseProperty[]) =>
    schema.flatMap((property) => {
      const value = databasePropertyValue(entry, property);
      if (
        value == null ||
        value === "" ||
        (Array.isArray(value) && !value.length)
      )
        return [];
      const text =
        typeof value === "boolean"
          ? value
            ? "☑"
            : "☐"
          : databaseValueText(value, names, property);
      return [paragraph(`${property.name}: ${text}`)];
    });
  if (page.database_schema != null) {
    const entries = visiblePages.filter((entry) => entry.parent_id === page.id);
    return {
      type: "doc",
      content: entries.length
        ? [
            {
              type: "bulletList",
              content: entries.map((entry) => ({
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: entry.title || "Untitled",
                        ...(href
                          ? {
                              marks: [
                                {
                                  type: "link",
                                  attrs: { href: href(entry.id) },
                                },
                              ],
                            }
                          : {}),
                      },
                    ],
                  },
                  ...values(entry, page.database_schema!),
                ],
              })),
            },
          ]
        : [],
    };
  }
  const schema = visiblePages.find(
    (parent) => parent.id === page.parent_id,
  )?.database_schema;
  if (!schema) return (page.content as JSONContent | null) ?? null;
  const body = (page.content as JSONContent | null)?.content ?? [];
  return { type: "doc", content: [...values(page, schema), ...body] };
}
