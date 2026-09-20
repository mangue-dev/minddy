import { appTabRoute, normalizeAppTabLocation } from "./app-tab-location";

export const APP_TAB_METADATA_BATCH_SIZE = 100;
export interface AppTabMetadata {
  pages: { id: string; project_id: string; title: string; icon: string | null }[];
  objectives: { id: string; project_id: string; name: string; color: string | null }[];
  pullRequests: { id: string; number: number; title: string | null }[];
  routines: { id: string; title: string }[];
}

export function appTabMetadataLocations(hrefs: string[]): string[] {
  return [...new Set(hrefs.map(normalizeAppTabLocation).filter((href): href is string => {
    if (!href) return false;
    const route = appTabRoute(href);
    return !!(route.pageId || route.objectiveId || route.prId || route.routineId);
  }))].sort();
}
