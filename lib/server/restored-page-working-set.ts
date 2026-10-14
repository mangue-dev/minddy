import "server-only";

import { appTabRoute } from "@/lib/app-tab-location";
import { isAppTabId, reconcileAppTabs, type AppTab } from "@/lib/app-tabs";
import type { RestoredPageBootstrapRecord } from "@/lib/restored-page-bootstrap-types";
import type { AuthedResult } from "./api-auth";
import { listAppTabs } from "./app-tabs";
import { getPage } from "./pages";

type Authorized = Extract<AuthedResult, { ok: true }>;
export type RestoredPageDestination = { projectId: string; pageId: string };
type Read = () => Promise<RestoredPageBootstrapRecord | null>;

/** Canonical rows select a finite working set; each reader still authorizes it. */
export function restoredPageDestinations(rows: readonly AppTab[], ownerId: string): RestoredPageDestination[] {
  const destinations: RestoredPageDestination[] = [];
  for (const tab of reconcileAppTabs(rows, ownerId)) {
    const route = appTabRoute(tab.href);
    if (!route.projectId || !route.pageId || !isAppTabId(route.projectId) || !isAppTabId(route.pageId)) continue;
    if (route.projectId !== route.projectId.toLowerCase() || route.pageId !== route.pageId.toLowerCase()) continue;
    if (destinations.some((value) => value.projectId === route.projectId && value.pageId === route.pageId)) continue;
    destinations.push({ projectId: route.projectId, pageId: route.pageId });
    if (destinations.length === 2) break;
  }
  return destinations;
}

/** Independent results stream as they settle, with only two readers admitted. */
export function boundedRestoredPageReads(reads: readonly Read[]): Promise<RestoredPageBootstrapRecord | null>[] {
  const settlements: ((value: RestoredPageBootstrapRecord | null) => void)[] = [];
  const records = reads.map(() => new Promise<RestoredPageBootstrapRecord | null>((resolve) => { settlements.push(resolve); }));
  let cursor = 0;
  const work = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= reads.length) return;
      try { settlements[index](await reads[index]()); }
      catch {
        // Optional bootstrap failure leaves the ordinary protected read intact.
        console.error("[restored-page-bootstrap] resource_failed");
        settlements[index](null);
      }
    }
  };
  for (let index = 0; index < Math.min(2, reads.length); index++) void work();
  return records;
}

/** Two explicit bodies only; shared collections keep their ordinary read path. */
export async function startRestoredPageWorkingSet(auth: Authorized): Promise<{
  records: Promise<RestoredPageBootstrapRecord | null>[];
} | null> {
  let rows: AppTab[];
  try { rows = await listAppTabs(auth.supabase, auth.user.id); }
  catch { console.error("[restored-page-bootstrap] tabs_unavailable"); return null; }
  const destinations = restoredPageDestinations(rows, auth.user.id);
  if (!destinations.length) return null;
  const ownerId = auth.user.id;
  const reads: Read[] = destinations.map(({ projectId, pageId }) => async () => {
    const result = await getPage(pageId, ownerId);
    if (!result.ok || result.page.project_id !== projectId || result.page.id !== pageId || result.page.deleted_at !== null ||
        !Number.isSafeInteger(result.page.version) || result.page.version <= 0) return null;
    return { kind: "page", ownerId, projectId, pageId, complete: true, data: result.page };
  });
  return { records: boundedRestoredPageReads(reads) };
}
