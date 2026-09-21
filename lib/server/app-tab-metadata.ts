import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appTabRoute, normalizeAppTabLocation } from "@/lib/app-tab-location";
import { APP_TAB_METADATA_BATCH_SIZE, type AppTabMetadata } from "@/lib/app-tab-metadata";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAppTabMetadataLocations(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > APP_TAB_METADATA_BATCH_SIZE) return null;
  const hrefs = raw.map(normalizeAppTabLocation);
  return hrefs.some((href) => href === null) ? null : [...new Set(hrefs as string[])];
}

/** Authenticated RLS reads only; resolving a tab label never contacts a forge. */
export async function readAppTabMetadata(client: SupabaseClient, hrefs: string[]): Promise<AppTabMetadata> {
  const routes = hrefs.map(appTabRoute);
  const ids = (key: "pageId" | "objectiveId" | "prId" | "routineId" | "familyId") =>
    [...new Set(routes.map((route) => route[key]).filter((id): id is string => !!id && UUID.test(id)))];
  async function read<T>(table: string, columns: string, selectedIds: string[]): Promise<T[]> {
    if (!selectedIds.length) return [];
    const { data, error } = await client.from(table).select(columns).in("id", selectedIds);
    if (error) throw new Error("Application tab labels could not be loaded");
    return data as T[];
  }
  const [pages, objectives, pullRequests, routines, issues] = await Promise.all([
    read<AppTabMetadata["pages"][number]>("pages", "id,project_id,title,icon", ids("pageId")),
    read<AppTabMetadata["objectives"][number]>("objectives", "id,project_id,name,color", ids("objectiveId")),
    read<AppTabMetadata["pullRequests"][number]>("pull_requests", "id,number,title", ids("prId")),
    read<AppTabMetadata["routines"][number]>("agent_routines", "id,title", ids("routineId")),
    read<AppTabMetadata["issues"][number]>("issues", "id,project_id,number,title", ids("familyId")),
  ]);
  // A valid UUID from a different project must not relabel a malformed URL.
  return {
    pages: pages.filter((page) => routes.some((route) => route.projectId === page.project_id && route.pageId === page.id)),
    objectives: objectives.filter((objective) => routes.some((route) => route.projectId === objective.project_id && route.objectiveId === objective.id)),
    pullRequests,
    routines,
    issues: issues.filter((issue) => routes.some((route) => route.projectId === issue.project_id && route.familyId === issue.id)),
  };
}
