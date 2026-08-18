import "server-only";

import { zipSync, strToU8 } from "fflate";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { pageToMarkdownServer } from "@/lib/server/pages-projection";
import { descendantIds } from "@/lib/pages";
import {
  exportPagesToFiles,
  pageFileSlug,
  type ExportInputPage,
  type ExportedFile,
} from "@/lib/pages-export";

/**
 * Exporting a page (MIN-283), server side: read, project, package.
 *
 * Nothing new is written here on the FORM of markdown — the projection is
 * that of MIN-269, tested and bidirectional, mounted in a function
 * server by `lib/server/pages-projection.ts`. This module only does the
 * chain on a branch and render everything in the form that a browser knows
 * download.
 *
 * The BRANCH is bounded: a page and all its descendants, trash excluded.
 * A trashed page is no longer in the wiki; exporting it would bring out
 * in a file what the recycle bin removed from the screen.
 */

export type PageExportResult =
  | { ok: true; fileName: string; contentType: string; body: Uint8Array }
  | { ok: false; status: number; errorKey: "pageNotFound" | "databaseError" };

/** How many page bodies a read brings back at once (MIN-348). */
const BODY_BATCH = 50;

interface PageRow {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content: unknown;
  position: string;
}

/**
 * A single page → a `.md`. One branch → one `.zip`, one file per page.
 *
 * The ZIP is produced WITHOUT compression (`level: 0`): these are text files
 * of a few kilobytes, the archive only exists to carry a
 * tree structure, and a compression would cost function CPU for a gain
 * that no user sees.
 */
export async function exportPage({
  pageId,
  actorId,
  branch,
}: {
  pageId: string;
  actorId: string;
  branch: boolean;
}): Promise<PageExportResult> {
  const service = getServiceClient();
  const { data: root } = await service
    .from("pages")
    .select("id, project_id, parent_id, title, icon, content, position")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!root) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await getProjectAccess(actorId, root.project_id as string))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const rootRow = root as unknown as PageRow;
  if (!branch) {
    const markdown = await pageToMarkdownServer({
      title: rootRow.title,
      icon: rootRow.icon,
      content: (rootRow.content ?? null) as never,
    });
    return {
      ok: true,
      fileName: `${pageFileSlug(rootRow.title)}.md`,
      contentType: "text/markdown; charset=utf-8",
      body: strToU8(markdown),
    };
  }

  // Two readings, and this is the limit of the subject (MIN-348). The first does not take
  // that the SKELETON - enough to know who descends from whom -, because the
  // requested branch may be one page out of a thousand and there is no reason
  // to bring down the body of the nine hundred and ninety-nine others. There
  // second only fetches bodies from the branch, and in batches: this is
  // also what limits the size of ONE PostgREST response.
  const { data: skeleton, error } = await service
    .from("pages")
    .select("id, parent_id, title, icon, position")
    .eq("project_id", root.project_id as string)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) {
    console.error("[pages-export] list failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const all = (skeleton ?? []) as unknown as Omit<PageRow, "content">[];
  const inBranch = new Set([rootRow.id, ...descendantIds(all, rootRow.id)]);
  const branchPages = all.filter((p) => inBranch.has(p.id));

  const bodies = new Map<string, unknown>([[rootRow.id, rootRow.content]]);
  for (let i = 0; i < branchPages.length; i += BODY_BATCH) {
    const ids = branchPages
      .slice(i, i + BODY_BATCH)
      .map((p) => p.id)
      .filter((id) => id !== rootRow.id);
    if (ids.length === 0) continue;
    const { data: rows, error: bodyError } = await service
      .from("pages")
      .select("id, content")
      .in("id", ids);
    if (bodyError) {
      console.error("[pages-export] bodies failed:", bodyError.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    for (const row of (rows ?? []) as { id: string; content: unknown }[]) {
      bodies.set(row.id, row.content);
    }
  }

  const pages: ExportInputPage[] = [];
  for (const page of branchPages) {
    pages.push({
      id: page.id,
      // The root of the ARCHIVE is the exported page: its real parent has nothing
      // to do there, and keeping it would put all files one step too low.
      parent_id: page.id === rootRow.id ? null : page.parent_id,
      title: page.title,
      icon: page.icon,
      markdown: await pageToMarkdownServer({
        title: page.title,
        icon: page.icon,
        content: (bodies.get(page.id) ?? null) as never,
      }),
    });
  }

  const files = exportPagesToFiles(pages);
  return {
    ok: true,
    fileName: `${pageFileSlug(rootRow.title)}.zip`,
    contentType: "application/zip",
    body: zipArchive(files),
  };
}

/** The files, packaged. Isolated so that the test reads the produced archive. */
export function zipArchive(files: ExportedFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) entries[file.path] = strToU8(file.markdown);
  return zipSync(entries, { level: 0 });
}
