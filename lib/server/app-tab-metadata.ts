import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAppTabLocation, rawAppTabRoute } from "@/lib/app-tab-location";
import { isUuid, projectSegmentCode, refMatches, shortCodeRange } from "@/lib/app-urls";
import { APP_TAB_METADATA_BATCH_SIZE, type AppTabMetadata } from "@/lib/app-tab-metadata";
import { decodeRoutineTitle } from "@/lib/server/routine-content";
import { decodePageProjection } from "@/lib/server/page-content";
import { decodeObjective } from "@/lib/server/objective-store";
import type { ObjectiveStatus } from "@/lib/objective-validation";
import { decodeIssue } from "@/lib/server/issue-store";
import { decodePullRequestContentRow } from "@/lib/server/agent/pull-request-content";

export function parseAppTabMetadataLocations(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > APP_TAB_METADATA_BATCH_SIZE) return null;
  const hrefs = raw.map(normalizeAppTabLocation);
  return hrefs.some((href) => href === null) ? null : [...new Set(hrefs as string[])];
}

/** Authenticated RLS reads only; resolving a tab label never contacts a forge. */
export async function readAppTabMetadata(client: SupabaseClient, hrefs: string[]): Promise<AppTabMetadata> {
  // As written: tabs carry short codes (lib/app-urls.ts), resolved here by an
  // indexed id range under RLS, or legacy full ids.
  const routes = hrefs.map(rawAppTabRoute);
  const refs = (key: "pageId" | "objectiveId" | "prId" | "routineId" | "familyId") =>
    [...new Set(routes.map((route) => route[key]).filter((ref): ref is string => !!ref && (isUuid(ref) || !!shortCodeRange(ref))))];
  async function read<T>(table: string, columns: string, selectedRefs: string[]): Promise<T[]> {
    if (!selectedRefs.length) return [];
    const ids = selectedRefs.filter(isUuid);
    const ranges = selectedRefs.map(shortCodeRange).filter((range) => range !== null);
    const query = client.from(table).select(columns);
    const { data, error } = ranges.length
      ? await query.or([
        ...(ids.length ? [`id.in.(${ids.join(",")})`] : []),
        ...ranges.map((range) => `and(id.gte.${range.from},id.lte.${range.to})`),
      ].join(","))
      : await query.in("id", ids);
    if (error) throw new Error("Application tab labels could not be loaded");
    return data as T[];
  }
  const [pages, objectives, pullRequests, routines, issues] = await Promise.all([
    read<Record<string, unknown>>("pages", "id,project_id,title,icon,encrypted_content,encryption_version", refs("pageId")),
    read<Record<string, unknown>>("objectives", "id,project_id,name,description,color,status,encrypted_content,encryption_version", refs("objectiveId")),
    read<AppTabMetadata["pullRequests"][number]>("pull_requests", "id,number,title", refs("prId")),
    read<AppTabMetadata["routines"][number]>("agent_routines",
      "id,project_id,title,encrypted_content,encryption_version", refs("routineId")),
    read<Record<string, unknown>>("issues", "id,project_id,number,title,description,plan,remote_url,automation_override,encrypted_content,encryption_version", refs("familyId")),
  ]);
  // A valid id from a different project must not relabel a malformed URL.
  const inRoute = (projectId: unknown, id: unknown, key: "pageId" | "objectiveId" | "familyId") =>
    routes.some((route) => !!route.projectId && !!route[key] &&
      refMatches(String(projectId), projectSegmentCode(route.projectId)) && refMatches(String(id), route[key]));
  const visiblePages = pages.filter((page) => inRoute(page.project_id, page.id, "pageId"));
  const visibleObjectives = objectives.filter((objective) => inRoute(objective.project_id, objective.id, "objectiveId"));
  const visibleIssues = issues.filter((issue) => inRoute(issue.project_id, issue.id, "familyId"));
  return {
    pages: await Promise.all(visiblePages.map(async (row) => {
      const decoded = await decodePageProjection(row);
      return { id: decoded.id as string, project_id: decoded.project_id as string,
        title: decoded.title as string, icon: decoded.icon as string | null };
    })),
    objectives: await Promise.all(visibleObjectives.map(async (row) => {
      const decoded = await decodeObjective(row);
      return { id: decoded.id as string, project_id: decoded.project_id as string,
        name: decoded.name as string, color: decoded.color as string | null,
        status: decoded.status as ObjectiveStatus };
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
