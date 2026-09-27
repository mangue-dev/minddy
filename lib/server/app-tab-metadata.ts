import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appTabRoute, normalizeAppTabLocation } from "@/lib/app-tab-location";
import { APP_TAB_METADATA_BATCH_SIZE, type AppTabMetadata } from "@/lib/app-tab-metadata";
import { decodeRoutineTitle } from "@/lib/server/routine-content";
import { decodePageProjection } from "@/lib/server/page-content";
import { decodeObjective } from "@/lib/server/objective-store";
import { decodeIssue } from "@/lib/server/issue-store";
import { decodePullRequestContentRow } from "@/lib/server/agent/pull-request-content";

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
    read<Record<string, unknown>>("pages", "id,project_id,title,icon,encrypted_content,encryption_version", ids("pageId")),
    read<Record<string, unknown>>("objectives", "id,project_id,name,description,color,encrypted_content,encryption_version", ids("objectiveId")),
    read<AppTabMetadata["pullRequests"][number]>("pull_requests", "id,number,title", ids("prId")),
    read<AppTabMetadata["routines"][number]>("agent_routines",
      "id,project_id,title,encrypted_content,encryption_version", ids("routineId")),
    read<Record<string, unknown>>("issues", "id,project_id,number,title,description,plan,remote_url,automation_override,encrypted_content,encryption_version", ids("familyId")),
  ]);
  // A valid UUID from a different project must not relabel a malformed URL.
  const visiblePages = pages.filter((page) => routes.some((route) => route.projectId === page.project_id && route.pageId === page.id));
  const visibleObjectives = objectives.filter((objective) => routes.some((route) => route.projectId === objective.project_id && route.objectiveId === objective.id));
  const visibleIssues = issues.filter((issue) => routes.some((route) => route.projectId === issue.project_id && route.familyId === issue.id));
  return {
    pages: await Promise.all(visiblePages.map(async (row) => {
      const decoded = await decodePageProjection(row);
      return { id: decoded.id as string, project_id: decoded.project_id as string,
        title: decoded.title as string, icon: decoded.icon as string | null };
    })),
    objectives: await Promise.all(visibleObjectives.map(async (row) => {
      const decoded = await decodeObjective(row);
      return { id: decoded.id as string, project_id: decoded.project_id as string,
        name: decoded.name as string, color: decoded.color as string | null };
    })),
    pullRequests: await Promise.all(pullRequests.map((row) => decodePullRequestContentRow(row))),
    routines: await Promise.all(routines.map(async (row) => ({ id: row.id,
      title: await decodeRoutineTitle(row as unknown as Record<string,unknown>) }))),
    issues: await Promise.all(visibleIssues.map(async (row) => {
      const decoded = await decodeIssue(row);
      return { id: decoded.id as string, project_id: decoded.project_id as string,
        number: decoded.number as number, title: decoded.title as string };
    })),
  };
}
