import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import {
  MAX_DATABASE_VIEWS,
  normalizeDatabaseView,
  normalizeDatabaseViewName,
  type SavedDatabaseView,
} from "@/lib/page-databases";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import { shouldProtectPages } from "./page-content";
import { getStoredPage, pageWriteRefusal, type PageResult } from "./pages";

/**
 * Saved views of a page database (MIN-764): named sort, filter and hidden
 * columns, shared by every member of the project and ordered by `position`.
 * Rows are sealed in the page's project scope whenever page content
 * protection is active; a row written before activation stays readable and
 * is sealed by its next write.
 */

const TABLE = "page_database_views";
const COLUMNS = "id, page_id, project_id, name, view, position, encrypted_content, encryption_version";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

const codec = () => new EncryptedRowCodec(getEncryptedStore());
const rowScope = (projectId: string) => ({ kind: "project" as const, id: projectId });

async function decodeRow(row: Row, actorId: string | null): Promise<SavedDatabaseView | null> {
  const decoded = await codec().decode(row as StoredRow,
    { table: TABLE, scope: rowScope(row.project_id as string) },
    { actorId, reason: "repository_read" });
  const name = normalizeDatabaseViewName(decoded.name);
  const view = normalizeDatabaseView(decoded.view);
  if (!name || !view || typeof row.position !== "number") return null;
  return { id: row.id as string, name, position: row.position, view };
}

/** Seal a complete view row; content is always written whole. */
async function encodeRow(service: SupabaseClient, row: Row & { project_id: string }):
  Promise<Row> {
  const plain = { ...row, encrypted_content: null, encryption_version: 0,
    updated_at: new Date().toISOString() };
  if (!await shouldProtectPages(service)) return plain;
  return codec().encode(plain as StoredRow,
    { table: TABLE, scope: rowScope(row.project_id) });
}

/** The page must be a live database of the project, visible to the actor. */
async function databasePage(projectId: string, pageId: string, actorId: string):
  Promise<PageResult<null>> {
  const loaded = await getStoredPage(pageId, actorId);
  if (!loaded.ok) return loaded;
  if (loaded.page.project_id !== projectId || !loaded.page.database_schema)
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  return { ok: true, page: null };
}

async function readRows(service: SupabaseClient, projectId: string, pageId: string) {
  const { data, error } = await service.from("page_database_views").select(COLUMNS)
    .eq("page_id", pageId).eq("project_id", projectId)
    .order("position", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error(`Unable to read database views: ${error.message}`);
  return (data ?? []) as Row[];
}

const failure = (error: unknown): PageResult<never> => {
  console.error("[page-database-views]", error instanceof Error ? error.message : error);
  return { ok: false, status: 500, errorKey: "databaseError" };
};
const invalid = { ok: false, status: 400, errorKey: "pageDatabaseInvalid" } as const;
const notFound = { ok: false, status: 404, errorKey: "pageNotFound" } as const;

/** The views of a database, in strip order; empty for the default view. */
export async function listPageDatabaseViews(projectId: string, pageId: string,
  actorId: string): Promise<PageResult<SavedDatabaseView[]>> {
  const allowed = await databasePage(projectId, pageId, actorId);
  if (!allowed.ok) return allowed;
  try {
    const rows = await readRows(getServiceClient(), projectId, pageId);
    const views = await Promise.all(rows.map((row) => decodeRow(row, actorId)));
    return { ok: true, page: views.filter((view): view is SavedDatabaseView => view !== null) };
  } catch (error) {
    return failure(error);
  }
}

async function writable(projectId: string, pageId: string, actorId: string) {
  return await pageWriteRefusal(actorId, projectId, "pageNotFound") ??
    await databasePage(projectId, pageId, actorId);
}

/** Add a view at the end of the strip, or at `position` when given. */
export async function createPageDatabaseView(projectId: string, pageId: string,
  actorId: string, input: unknown): Promise<PageResult<SavedDatabaseView>> {
  const body = input && typeof input === "object" ? input as Row : {};
  const name = normalizeDatabaseViewName(body.name);
  const view = normalizeDatabaseView(body.view);
  if (!name || !view || (body.id !== undefined &&
      (typeof body.id !== "string" || !UUID.test(body.id)))) return invalid;
  const allowed = await writable(projectId, pageId, actorId);
  if (!allowed.ok) return allowed;
  const service = getServiceClient();
  try {
    const rows = await readRows(service, projectId, pageId);
    if (rows.length >= MAX_DATABASE_VIEWS) return invalid;
    const last = rows.at(-1)?.position as number | undefined;
    const position = typeof body.position === "number" && Number.isFinite(body.position)
      ? body.position : (last ?? 0) + 1;
    const id = (body.id as string | undefined) ?? crypto.randomUUID();
    const row = await encodeRow(service, { id, page_id: pageId, project_id: projectId,
      name, view, position, created_by: actorId, updated_by: actorId });
    const { error } = await service.from("page_database_views").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true, page: { id, name, position, view } };
  } catch (error) {
    return failure(error);
  }
}

/** Rename, reconfigure or move a view; the other fields stay as they are. */
export async function updatePageDatabaseView(projectId: string, pageId: string,
  viewId: string, actorId: string, input: unknown): Promise<PageResult<SavedDatabaseView>> {
  if (!UUID.test(viewId) || !input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const body = input as Row;
  const name = body.name === undefined ? undefined : normalizeDatabaseViewName(body.name);
  const view = body.view === undefined ? undefined : normalizeDatabaseView(body.view);
  const position = body.position === undefined ? undefined
    : typeof body.position === "number" && Number.isFinite(body.position) ? body.position : null;
  if (name === null || view === null || position === null ||
      (name === undefined && view === undefined && position === undefined)) return invalid;
  const allowed = await writable(projectId, pageId, actorId);
  if (!allowed.ok) return allowed;
  const service = getServiceClient();
  try {
    const { data, error } = await service.from("page_database_views").select(COLUMNS)
      .eq("id", viewId).eq("page_id", pageId).eq("project_id", projectId).maybeSingle();
    if (error) throw new Error(error.message);
    const current = data ? await decodeRow(data as Row, actorId) : null;
    if (!current) return notFound;
    const next = { ...current, ...(name !== undefined && { name }),
      ...(view !== undefined && { view }), ...(position !== undefined && { position }) };
    const row = await encodeRow(service, { page_id: pageId, project_id: projectId,
      id: viewId, name: next.name, view: next.view, position: next.position,
      updated_by: actorId });
    const { data: updated, error: updateError } = await service
      .from("page_database_views").update(row)
      .eq("id", viewId).eq("page_id", pageId).select("id");
    if (updateError) throw new Error(updateError.message);
    if (!updated?.length) return notFound;
    return { ok: true, page: next };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePageDatabaseView(projectId: string, pageId: string,
  viewId: string, actorId: string): Promise<PageResult<null>> {
  if (!UUID.test(viewId)) return invalid;
  const allowed = await writable(projectId, pageId, actorId);
  if (!allowed.ok) return allowed;
  const { data, error } = await getServiceClient().from("page_database_views")
    .delete().eq("id", viewId).eq("page_id", pageId).eq("project_id", projectId)
    .select("id");
  if (error) return failure(error);
  return data?.length ? { ok: true, page: null } : notFound;
}

/**
 * Give duplicated databases the views of their sources. The caller has
 * authorized the copy; each view is sealed again for its new row.
 */
export async function copyPageDatabaseViews(service: SupabaseClient,
  projectId: string, idMap: Map<string, string>, actorId: string): Promise<void> {
  const { data, error } = await service.from("page_database_views").select(COLUMNS)
    .eq("project_id", projectId).in("page_id", [...idMap.keys()]);
  if (error) throw new Error("Unable to read the database views to copy");
  if (!data?.length) return;
  const rows = await Promise.all((data as Row[]).map(async (row) => {
    const saved = await decodeRow(row, actorId);
    const target = idMap.get(row.page_id as string);
    return saved && target ? encodeRow(service, { id: crypto.randomUUID(),
      page_id: target, project_id: projectId, name: saved.name, view: saved.view,
      position: saved.position, created_by: actorId, updated_by: actorId }) : null;
  }));
  const copies = rows.filter((row): row is Row => row !== null);
  if (!copies.length) return;
  const { error: insertError } = await service.from("page_database_views").insert(copies);
  if (insertError) throw new Error("Unable to copy the database views");
}
