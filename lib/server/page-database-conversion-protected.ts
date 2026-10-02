import "server-only";

import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { getBlindIndexKeys } from "./encryption/registry";
import { blindIndex } from "./encryption/store";
import { decodePage } from "./page-content";
import { commitPageContentBatch, type PageContentEdit } from "./page-content-batch";
import type { Page } from "@/lib/pages";
import type { DatabaseProperty, DatabasePropertyType, DatabaseValue,
  DatabaseSelectOption } from "@/lib/page-databases";
import type { DatabaseConversionPreview } from "@/lib/page-database-conversion";

type StoredPage = Page & { content_revision: number; encryption_version: number;
  database_revision: number };

function convertCell(source: DatabaseProperty,
  target: DatabasePropertyType, cell: DatabaseValue | undefined):
  { value: DatabaseValue; compatible: boolean } {
  if (source.type === target) return { value: cell ?? null, compatible: true };
  if (cell == null || cell === "" || Array.isArray(cell) && cell.length === 0) {
    return { value: null, compatible: true };
  }
  if (target === "people" || target === "created_at" || source.type === "people") {
    return { value: null, compatible: false };
  }
  let label: string;
  if (source.type === "select" || source.type === "multi_select") {
    const options = new Map(source.options?.map((option) => [option.id, option.name]));
    const ids: unknown[] = source.type === "select" ? [cell] :
      Array.isArray(cell) ? cell : [];
    if (source.type === "multi_select" && !Array.isArray(cell) || ids.some((id) =>
      typeof id !== "string" || !options.has(id)) ||
      new Set(ids).size !== ids.length) {
      return { value: null, compatible: false };
    }
    const validIds = ids as string[];
    if (target === "select" || target === "multi_select") {
      if (target === "multi_select") {
        return { value: validIds, compatible: true };
      }
      return validIds.length === 1
        ? { value: validIds[0] as string, compatible: true }
        : { value: null, compatible: false };
    }
    if (source.type === "multi_select" && target !== "text" && ids.length !== 1) {
      return { value: null, compatible: false };
    }
    label = validIds.map((id) => options.get(id)).join(", ");
  } else label = String(cell);
  if (target === "text") {
    return label.length <= 2000 ? { value: label, compatible: true } :
      { value: null, compatible: false };
  }
  if (target === "select" || target === "multi_select") {
    const trimmed = label.trim();
    return trimmed.length >= 1 && trimmed.length <= 80
      ? { value: trimmed, compatible: true }
      : { value: null, compatible: false };
  }
  if (target === "number") {
    if (source.type === "checkbox") return { value: cell === true ? 1 : 0,
      compatible: true };
    const normalized = label.replace(",", ".").trim();
    const number = Number(normalized);
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized) &&
      Number.isFinite(number)
      ? { value: number, compatible: true }
      : { value: null, compatible: false };
  }
  if (target === "checkbox") {
    const normalized = label.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") {
      return { value: normalized === "true", compatible: true };
    }
    if (source.type === "number" && (cell === 0 || cell === 1)) {
      return { value: cell === 1, compatible: true };
    }
    return { value: null, compatible: false };
  }
  if (target === "date") {
    const candidate = source.type === "created_at" ? label.slice(0, 10) : label;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(candidate)
      ? new Date(`${candidate}T00:00:00.000Z`) : null;
    return date && Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === candidate
      ? { value: candidate, compatible: true }
      : { value: null, compatible: false };
  }
  return { value: null, compatible: false };
}

async function children(projectId: string, parentId: string, actorId: string):
  Promise<StoredPage[]> {
  const service = getServiceClient();
  const rows: StoredPage[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await service.from("pages").select("*")
      .eq("project_id", projectId).eq("parent_id", parentId)
      .order("id", { ascending: true }).range(offset, offset + 199);
    if (error) throw new Error("Unable to read database entries");
    rows.push(...await Promise.all((data ?? []).map(async (row) =>
      await decodePage(row, actorId) as StoredPage)));
    if (!data || data.length < 200) break;
  }
  return rows;
}

/** Preview and apply a type conversion with a keyed snapshot token. */
export async function convertProtectedPageDatabase({
  projectId, page, actorId, body, kind, mcpKeyId,
}: { projectId: string; page: StoredPage; actorId: string;
  body: Record<string, unknown>; kind: "human" | "agent";
  mcpKeyId: string | null }): Promise<
  { status: "preview"; preview: DatabaseConversionPreview } |
  { status: "updated" | "conflict" | "not_found"; values?: Record<string, DatabaseValue> }
> {
  const propertyId = body.propertyId as string;
  const source = page.database_schema?.find((item) => item.id === propertyId);
  if (!source) return { status: "not_found" };
  if (page.database_revision !== body.revision) return { status: "conflict" };
  const target = body.targetType as DatabasePropertyType;
  const name = typeof body.name === "string" ? body.name.trim() : source.name;
  const entries = await children(projectId, page.id, actorId);
  const snapshot = JSON.stringify([page.id, page.database_revision, propertyId,
    target, name, entries.map((entry) => [entry.id,
      entry.property_values?.[propertyId] ?? null, entry.created_at])]);
  const scope = { kind: "project" as const, id: projectId };
  const key = await getBlindIndexKeys().byVersion(scope, 1);
  let token: string;
  try {
    token = blindIndex(snapshot, { scope, table: "pages",
      column: "database_conversion_preview" }, key.bytes).slice(0, 32);
  } finally { key.bytes.fill(0); }
  if (!body.preview && body.token !== token) return { status: "conflict" };

  const choices: DatabaseSelectOption[] =
    (source.type === "select" || source.type === "multi_select") &&
    (target === "select" || target === "multi_select")
      ? [...source.options ?? []] : [];
  const values: Record<string, DatabaseValue> = {};
  let incompatibleCount = 0;
  for (const entry of entries) {
    const cell = source.type === "created_at" ? entry.created_at :
      entry.property_values?.[propertyId];
    const converted = convertCell(source, target, cell);
    if (!converted.compatible) incompatibleCount++;
    let value = converted.value;
    if ((target === "select" || target === "multi_select") &&
        source.type !== "select" && source.type !== "multi_select" &&
        typeof value === "string") {
      const labelValue = value;
      let choice = choices.find((option) =>
        option.name.toLowerCase() === labelValue.toLowerCase());
      if (!choice && choices.length < 100) {
        const digest = createHash("md5")
          .update(`${token}:${labelValue.toLowerCase()}`).digest("hex");
        choice = { id: `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}`,
          name: labelValue, color: "#3b82f6" };
        choices.push(choice);
      }
      if (!choice) { value = null; incompatibleCount++; }
      else value = target === "select" ? choice.id : [choice.id];
    }
    values[entry.id] = value;
  }
  const replacement: DatabaseProperty = { ...source, name, type: target };
  if (target === "select" || target === "multi_select") replacement.options = choices;
  else delete replacement.options;
  const preview: DatabaseConversionPreview = { status: "preview",
    totalCount: entries.length, incompatibleCount, token,
    column: replacement, values };
  if (body.preview || incompatibleCount > 0 && body.confirmLoss !== true) {
    return { status: "preview", preview };
  }
  const nextSchema = page.database_schema!.map((item) =>
    item.id === propertyId ? replacement : item);
  const edits: PageContentEdit[] = [{ previous: page, next: { ...page,
    database_schema: nextSchema,
    database_revision: page.database_revision + 1 } }];
  if (source.type !== target) {
    for (const entry of entries) {
      const propertyValues = { ...entry.property_values };
      if (values[entry.id] == null || target === "created_at") {
        delete propertyValues[propertyId];
      } else propertyValues[propertyId] = values[entry.id];
      edits.push({ previous: entry, next: { ...entry, property_values: propertyValues } });
    }
  }
  const status = await commitPageContentBatch({ projectId, actorId,
    parentId: page.id, expected: [page, ...entries], edits,
    expectedChildren: entries.map((entry) => entry.id), kind, mcpKeyId });
  return { status, ...(status === "updated" ? { values } : {}) };
}
