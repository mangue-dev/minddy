import "server-only";
import { databaseArchiveFiles } from "./database-export";
import type { ImportPage } from "@/lib/database-import/types";

import {
  pageDatabaseDocument,
  type DatabaseDocumentPage,
} from "@/lib/page-database-document";
import { databaseDocumentNames } from "./page-database-document";
import { pageHref } from "@/lib/pages-navigation";

import { zipSync, strToU8 } from "fflate";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { pageToMarkdownServer } from "@/lib/server/pages-projection";
import { descendantIds } from "@/lib/pages";
import {
  exportPagePaths,
  exportPagesToFiles,
  relativePath,
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
const LIST_BATCH = 500;

interface PageRow extends DatabaseDocumentPage {
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
    .select(
      "id, project_id, parent_id, title, icon, content, position, database_schema, database_title_name, property_values, created_at",
    )
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!root) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await getProjectAccess(actorId, root.project_id as string))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const rootRow = root as unknown as PageRow;
  if (!branch && rootRow.database_schema == null) {
    const context: DatabaseDocumentPage[] = [rootRow];
    if (rootRow.parent_id) {
      const { data: parent } = await service
        .from("pages")
        .select("id, parent_id, title, database_schema")
        .eq("id", rootRow.parent_id)
        .eq("project_id", root.project_id)
        .maybeSingle();
      if (parent) context.push(parent as DatabaseDocumentPage);
    }
    const names = await databaseDocumentNames(context);
    const markdown = await pageToMarkdownServer({
      title: rootRow.title,
      icon: rootRow.icon,
      content: pageDatabaseDocument(rootRow, context, names, (id) =>
        pageHref(root.project_id, id),
      ) as never,
    });
    return {
      ok: true,
      fileName: `${pageFileSlug(rootRow.title)}.md`,
      contentType: "text/markdown; charset=utf-8",
      body: strToU8(markdown),
    };
  }

  // Paginate the project outline so PostgREST cannot silently truncate a branch.
  // Bodies are fetched separately and only for the requested branch.
  const all: Omit<PageRow, "content">[] = [];
  for (let offset = 0; ; offset += LIST_BATCH) {
    const { data: skeleton, error } = await service
      .from("pages")
      .select(
        "id, parent_id, title, icon, position, database_schema, database_title_name, property_values, created_at",
      )
      .eq("project_id", root.project_id as string)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + LIST_BATCH - 1);
    if (error) {
      console.error("[pages-export] list failed:", error.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    all.push(...((skeleton ?? []) as unknown as Omit<PageRow, "content">[]));
    if (!skeleton || skeleton.length < LIST_BATCH) break;
  }
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

  const context = all.filter(
    (page) => inBranch.has(page.id) || page.id === rootRow.parent_id,
  );
  const names = await databaseDocumentNames(context);
  const archivePaths = exportPagePaths(branchPages);
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
        content: pageDatabaseDocument(
          { ...page, content: bodies.get(page.id) },
          context,
          names,
          (id) =>
            relativePath(archivePaths.get(page.id)!, archivePaths.get(id)!)
              .split("/")
              .map(encodeURIComponent)
              .join("/"),
        ) as never,
      }),
    });
  }

  const files = exportPagesToFiles(pages);
  let body: Uint8Array;
  if (branchPages.some((page) => page.database_schema != null)) {
    const nativePages: ImportPage[] = branchPages.map((page) => ({
      id: page.id,
      parent_id: page.id === rootRow.id ? null : page.parent_id,
      title: page.title,
      icon: page.icon,
      content: bodies.get(page.id) ?? null,
      database_schema: page.database_schema ?? null,
      database_title_name: page.database_title_name ?? null,
      property_values: page.property_values ?? {},
      created_at: page.created_at,
      position: page.position,
    }));
    try {
      body = zipSync(
        await databaseArchiveFiles(
          nativePages,
          archivePaths,
          names,
          Object.fromEntries(
            files.map((file) => [file.path, strToU8(file.markdown)]),
          ),
          root.project_id,
        ),
        { level: 6 },
      );
    } catch (error) {
      console.error("[pages-export] database archive failed:", error);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  } else body = zipArchive(files);
  return {
    ok: true,
    fileName: `${pageFileSlug(rootRow.title)}.zip`,
    contentType: "application/zip",
    body,
  };
}

/** The files, packaged. Isolated so that the test reads the produced archive. */
export function zipArchive(files: ExportedFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) entries[file.path] = strToU8(file.markdown);
  return zipSync(entries, { level: 0 });
}
