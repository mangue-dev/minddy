import "server-only";

import {
  DATABASE_PROPERTY_TYPES,
  type DatabasePropertyType,
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

/** Validate the request before the transactional database guard checks its current state. */
export async function updatePageDatabase(
  projectId: string,
  pageId: string,
  actorId: string,
  input: unknown,
  kind: "human" | "agent" = "human",
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
      !("expected" in body)
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
  const { data, error } = await service.rpc("update_page_database_guarded", {
    p_project_id: projectId,
    p_page_id: pageId,
    p_actor_id: actorId,
    p_input: { ...body, kind },
  });
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
  const { data, error } = await service.rpc("convert_page_database_guarded", {
    p_project_id: projectId, p_page_id: pageId, p_actor_id: actorId,
    p_input: { ...body, kind: "human" },
  });
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
    await recordPageEvent(service, { pageId, actorId, kind: "human", type: "page_updated" });
  });
  return getPage(pageId, actorId);
}
