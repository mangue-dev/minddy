import "server-only";

import {
  DATABASE_PROPERTY_TYPES,
  type DatabasePropertyType,
  type DatabaseValues,
  isDatabaseSchema,
  isDatabasePropertyValue,
} from "@/lib/page-databases";
import { getServiceClient } from "@/lib/supabase-service";
import { getPage, type PageResult } from "@/lib/server/pages";
import { recordPageEvent } from "@/lib/server/page-activity";
import { afterOrNow } from "@/lib/server/after-safe";
import { insertNotifications } from "@/lib/server/notifications";
import type { DatabaseConversionPreview } from "@/lib/page-database-conversion";
import type { Page } from "@/lib/pages";
import { isDeepStrictEqual } from "node:util";
import { decodePage } from "./page-content";
import { commitPageContentBatch, type PageContentEdit } from "./page-content-batch";
import { convertProtectedPageDatabase } from "./page-database-conversion-protected";

type StoredPage = Page & { content_revision: number; encryption_version: number;
  database_revision: number };

async function databaseChildren(projectId: string, parentId: string,
  actorId: string): Promise<StoredPage[]> {
  const service = getServiceClient();
  const children: StoredPage[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await service.from("pages").select("*")
      .eq("project_id", projectId).eq("parent_id", parentId)
      .order("id", { ascending: true }).range(offset, offset + 199);
    if (error) throw new Error("Unable to read database entries");
    children.push(...await Promise.all((data ?? []).map(async (row) =>
      await decodePage(row, actorId) as StoredPage)));
    if (!data || data.length < 200) break;
  }
  return children;
}

function retainedValues(values: DatabaseValues,
  previous: NonNullable<Page["database_schema"]>,
  next: NonNullable<Page["database_schema"]>) {
  const result = { ...values };
  for (const property of previous) {
    const replacement = next.find((item) => item.id === property.id);
    if (!replacement) { delete result[property.id]; continue; }
    if (replacement.type !== property.type) {
      throw new Error("Property types cannot change through a schema edit");
    }
    if (property.type === "select") {
      const current = result[property.id];
      if (typeof current === "string" &&
          !replacement.options?.some((option) => option.id === current)) {
        delete result[property.id];
      }
    } else if (property.type === "multi_select") {
      const current = result[property.id];
      if (Array.isArray(current)) {
        const ids = new Set(replacement.options?.map((option) => option.id));
        result[property.id] = current.filter((id) => ids.has(id));
      }
    }
  }
  return result;
}

async function updateProtectedPageDatabase(projectId: string,
  actorId: string, page: StoredPage, body: Record<string, unknown>,
  kind: "human" | "agent", mcpKeyId: string | null):
  Promise<"updated" | "conflict" | "not_found"> {
  if (body.operation === "schema") {
    if (page.database_revision !== body.revision) return "conflict";
    const nextSchema = body.schema as NonNullable<Page["database_schema"]>;
    const previous = page.database_schema ?? [];
    const children = await databaseChildren(projectId, page.id, actorId);
    const edits: PageContentEdit[] = [{ previous: page, next: { ...page,
      database_schema: nextSchema,
      database_title_name: body.titleName === undefined
        ? page.database_title_name : body.titleName as string | null,
      database_revision: page.database_revision + 1 } }];
    for (const child of children) {
      const values = retainedValues(child.property_values ?? {}, previous, nextSchema);
      if (!isDeepStrictEqual(values, child.property_values)) {
        edits.push({ previous: child, next: { ...child,
          property_values: values } });
      }
    }
    return commitPageContentBatch({ projectId, actorId, parentId: page.id,
      expected: [page, ...children], edits,
      expectedChildren: children.map((child) => child.id), kind, mcpKeyId });
  }
  const parent = await getPage(page.parent_id!, actorId);
  if (!parent.ok || parent.page.project_id !== projectId) return "not_found";
  const property = parent.page.database_schema?.find((item) =>
    item.id === body.propertyId);
  if (!property || property.type === "created_at" ||
      !isDatabasePropertyValue(property, body.value) ||
      !isDeepStrictEqual(page.property_values?.[property.id] ?? null,
        body.expected)) return "conflict";
  const next = { ...page, property_values: { ...page.property_values,
    [property.id]: body.value } } as StoredPage;
  return commitPageContentBatch({ projectId, actorId,
    parentId: parent.page.id,
    expected: [parent.page as StoredPage, page],
    edits: [{ previous: page, next }], kind, mcpKeyId });
}

/** Validate the request before the transactional database guard checks its current state. */
export async function updatePageDatabase(
  projectId: string,
  pageId: string,
  actorId: string,
  input: unknown,
  kind: "human" | "agent" = "human",
  mcpKeyId: string | null = null,
): Promise<PageResult<Page>> {
  const loaded = await getPage(pageId, actorId);
  if (!loaded.ok) return loaded;
  if (loaded.page.project_id !== projectId)
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  const invalid = {
    ok: false,
    status: 400,
    errorKey: "pageDatabaseInvalid",
  } as const;
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const body = input as Record<string, unknown>;
  if (body.operation === "schema") {
    if (
      !loaded.page.database_schema ||
      !isDatabaseSchema(body.schema) ||
      (body.titleName !== undefined &&
        body.titleName !== null &&
        (typeof body.titleName !== "string" ||
          !body.titleName.trim() ||
          body.titleName.length > 80)) ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0
    )
      return invalid;
  } else if (body.operation === "value") {
    if (
      !loaded.page.parent_id ||
      typeof body.propertyId !== "string" ||
      body.expected === undefined
    )
      return invalid;
    const parent = await getPage(loaded.page.parent_id, actorId);
    if (!parent.ok) return parent;
    const property = parent.page.database_schema?.find(
      (p) => p.id === body.propertyId,
    );
    if (!property || !isDatabasePropertyValue(property, body.value))
      return invalid;
  } else return invalid;

  const service = getServiceClient();
  const protectedPage = Number((loaded.page as StoredPage).encryption_version ?? 0) > 0;
  if (protectedPage && body.operation === "schema" &&
      (body.schema as NonNullable<Page["database_schema"]>).some((item) =>
        loaded.page.database_schema?.some((old) =>
          old.id === item.id && old.type !== item.type))) return invalid;
  let data: { status?: string } | null = null;
  let error: { code?: string; message: string } | null = null;
  if (protectedPage) {
    try {
      data = { status: await updateProtectedPageDatabase(projectId, actorId,
        loaded.page as StoredPage, body, kind, mcpKeyId) };
    } catch (cause) {
      error = { message: cause instanceof Error ? cause.message : "Unknown error" };
    }
  } else ({ data, error } = await service.rpc("update_page_database_guarded", {
    p_project_id: projectId,
    p_page_id: pageId,
    p_actor_id: actorId,
    p_input: { ...body, kind, mcpKeyId: kind === "agent" ? mcpKeyId : null },
  }));
  if (error) {
    if (error.code?.startsWith("22")) return invalid;
    console.error("[page-databases] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (data?.status === "conflict")
    return { ok: false, status: 409, errorKey: "pageDatabaseStale" };
  if (data?.status !== "updated")
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  afterOrNow(async () => {
    await recordPageEvent(service, {
      pageId,
      actorId,
      kind,
      mcpKeyId: kind === "agent" ? mcpKeyId : null,
      type: "page_updated",
    });
    if (body.operation !== "value" || !loaded.page.parent_id) return;
    const parent = await getPage(loaded.page.parent_id, actorId);
    if (!parent.ok) return;
    const property = parent.page.database_schema?.find(
      (p) => p.id === body.propertyId,
    );
    if (property?.type !== "people") return;
    const ids = Array.isArray(body.value)
      ? (body.value as string[])
      : typeof body.value === "string"
        ? [body.value]
        : [];
    const previous = Array.isArray(body.expected)
      ? body.expected
      : [body.expected];
    await insertNotifications(
      service,
      ids
        .filter((id) => id !== actorId && !previous.includes(id))
        .map((userId) => ({
          user_id: userId,
          project_id: projectId,
          type: "page_mention" as const,
          issue_id: null,
          page_id: pageId,
          block_id: null,
          actor_id: actorId,
        })),
    );
  });
  return getPage(pageId, actorId);
}

/** Preview or apply a conversion under the same lock used for database cell edits. */
export async function convertPageDatabase(
  projectId: string,
  pageId: string,
  actorId: string,
  input: unknown,
  kind: "human" | "agent" = "human",
  mcpKeyId: string | null = null,
): Promise<PageResult<Page | DatabaseConversionPreview>> {
  const loaded = await getPage(pageId, actorId);
  if (!loaded.ok) return loaded;
  if (loaded.page.project_id !== projectId)
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  const invalid = { ok: false, status: 400, errorKey: "pageDatabaseInvalid" } as const;
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid;
  const body = input as Record<string, unknown>;
  if (
    body.operation !== "convert" ||
    typeof body.propertyId !== "string" ||
    !loaded.page.database_schema?.some((p) => p.id === body.propertyId) ||
    !DATABASE_PROPERTY_TYPES.includes(body.targetType as DatabasePropertyType) ||
    !Number.isSafeInteger(body.revision) || (body.revision as number) < 0 ||
    typeof body.preview !== "boolean" ||
    (!body.preview && (typeof body.token !== "string" || !/^[0-9a-f]{32}$/.test(body.token))) ||
    (body.confirmLoss !== undefined && typeof body.confirmLoss !== "boolean") ||
    (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80))
  ) return invalid;
  const service = getServiceClient();
  const protectedPage = Number((loaded.page as StoredPage).encryption_version ?? 0) > 0;
  let data: Record<string, unknown> | DatabaseConversionPreview | null = null;
  let error: { code?: string; message: string } | null = null;
  if (protectedPage) {
    try {
      const result = await convertProtectedPageDatabase({ projectId,
        page: loaded.page as StoredPage, actorId, body, kind, mcpKeyId });
      data = result.status === "preview" ? result.preview : result;
    } catch (cause) {
      error = { message: cause instanceof Error ? cause.message : "Unknown error" };
    }
  } else ({ data, error } = await service.rpc("convert_page_database_guarded", {
    p_project_id: projectId, p_page_id: pageId, p_actor_id: actorId,
    p_input: { ...body, kind, mcpKeyId: kind === "agent" ? mcpKeyId : null },
  }));
  if (error) {
    if (error.code?.startsWith("22")) return invalid;
    console.error("[page-databases] conversion failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (data?.status === "conflict")
    return { ok: false, status: 409, errorKey: "pageDatabaseStale" };
  if (data?.status === "preview") return { ok: true, page: data as DatabaseConversionPreview };
  if (data?.status !== "updated") return { ok: false, status: 404, errorKey: "pageNotFound" };
  afterOrNow(async () => {
    await recordPageEvent(service, { pageId, actorId, kind, mcpKeyId: kind === "agent" ? mcpKeyId : null, type: "page_updated" });
  });
  const result = await getPage(pageId, actorId);
  if (!result.ok || !data.values) return result;
  return { ok: true, page: { ...result.page, conversion_values: data.values } as Page };
}
