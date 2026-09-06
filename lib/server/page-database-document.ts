import "server-only";
import { fetchAuthUsersById, toNamed } from "./auth-users";
import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import type { DatabaseDocumentPage } from "@/lib/page-database-document";

/** Resolve only people referenced by properties in the already authorized page set. */
export async function databaseDocumentNames(
  pages: readonly DatabaseDocumentPage[],
): Promise<Map<string, string>> {
  const schemas = new Map(pages.map((page) => [page.id, page.database_schema]));
  const ids = new Set<string>();
  for (const page of pages) {
    for (const property of schemas.get(page.parent_id ?? "") ?? []) {
      if (property.type !== "people") continue;
      const value = page.property_values?.[property.id];
      for (const id of Array.isArray(value)
        ? value
        : typeof value === "string"
          ? [value]
          : [])
        ids.add(id);
    }
  }
  if (!ids.size) return new Map();
  const users = await fetchAuthUsersById(getServiceClient(), [...ids]);
  return new Map(
    [...ids].map((id) => [
      id,
      displayName(toNamed(users.get(id)), "Former member"),
    ]),
  );
}
