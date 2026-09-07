import "server-only";
import { randomUUID } from "node:crypto";
import { isPosition } from "@/lib/pages";
import { getServiceClient } from "@/lib/supabase-service";
import {
  isDatabaseSchema,
  isDatabasePropertyValue,
} from "@/lib/page-databases";
import {
  readDatabaseArchive,
  cleanArchivePath,
} from "@/lib/database-import/archive";
import {
  prepareImportPages,
  resolveArchiveLink,
} from "@/lib/database-import/prepare";
import {
  type ImportColumn,
  type ImportPage,
  MAX_IMPORT_EXPANDED_BYTES,
  MAX_IMPORT_FILES,
  MAX_IMPORT_PAGE_CONTENT_BYTES,
} from "@/lib/database-import/types";
import { checkPageContent } from "@/lib/page-content-schema";
import { exceedsJsonDepth, MAX_PAGE_JSON_DEPTH } from "@/lib/json-depth";
import { markdownToPageServer } from "./pages-projection";
import { loadImportContext } from "./import-context";
import {
  pageFileIdFromSrc,
  pageFileUrl,
  pageFileStoragePrefix,
  sanitizeFileKey,
  MAX_PAGE_FILE_BYTES,
} from "@/lib/page-files";
import { resolveUploadedMimeType } from "@/lib/inline-safe";
import { projectStorageAllowed } from "./storage-quota";
import { queuePageBodyLinks } from "./page-links";
import { queueSearchText } from "./pages-search";

export async function importDatabase(args: {
  projectId: string;
  pageId: string;
  actorId: string;
  requestId: string;
  revision: number;
  bytes: Uint8Array;
  filename: string;
  sourceId: string;
  columns: ImportColumn[];
  people: Record<string, string>;
}) {
  const { projectId, pageId, actorId } = args;
  const service = getServiceClient();
  const { data: previous, error: previousError } = await service
    .from("page_database_imports")
    .select("page_id, created_by, page_count")
    .eq("id", args.requestId)
    .maybeSingle();
  if (previousError) throw new Error("importUnavailable");
  if (previous) {
    if (previous.page_id !== pageId || previous.created_by !== actorId)
      throw new Error("importInvalidArchive");
    return { count: previous.page_count };
  }
  const prepared = readDatabaseArchive(args.bytes, args.filename);
  const source = prepared.sources.find((source) => source.id === args.sourceId);
  if (!source) throw new Error("importNoDatabase");
  const context = await loadImportContext(projectId, actorId);
  const memberIds = new Set(context.members.map((member) => member.userId));
  const aliases = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const member of context.members) {
    for (const raw of [member.name, member.email, member.userId]) {
      if (!raw) continue;
      const name = raw.trim().toLocaleLowerCase();
      if (aliases.has(name) && aliases.get(name) !== member.userId)
        ambiguous.add(name);
      aliases.set(name, member.userId);
    }
  }
  for (const name of ambiguous) aliases.delete(name);
  const peopleMap = new Map<string, string>();
  for (const person of source.native?.people ?? []) {
    const id =
      args.people[person.id] ??
      (memberIds.has(person.id)
        ? person.id
        : aliases.get(person.name.toLocaleLowerCase()));
    if (id && memberIds.has(id)) peopleMap.set(person.id, id);
  }
  const incoming = prepareImportPages(prepared, source, args.columns, aliases);
  const sourceIds = new Set(incoming.map((page) => page.id));
  if (sourceIds.size !== incoming.length)
    throw new Error("importInvalidArchive");
  const root = incoming.find((page) => page.id === source.id);
  if (!root || root.parent_id !== null || root.database_schema == null)
    throw new Error("importInvalidArchive");
  const ordered: ImportPage[] = [root];
  const seen = new Set([root.id]);
  while (ordered.length < incoming.length) {
    const children = incoming.filter(
      (page) =>
        !seen.has(page.id) && page.parent_id && seen.has(page.parent_id),
    );
    if (!children.length) throw new Error("importInvalidArchive");
    for (const child of children) {
      ordered.push(child);
      seen.add(child.id);
    }
  }
  const pageIds = new Map(
    ordered.map((page) => [
      page.id,
      page.id === root.id ? pageId : randomUUID(),
    ]),
  );
  const paths = new Map(
    ordered
      .filter((page) => page.path)
      .map((page) => [page.path!, pageIds.get(page.id)!]),
  );
  // Notion links to a database's CSV even when its introduction has a Markdown file.
  for (const importedSource of prepared.sources) {
    const id = pageIds.get(importedSource.id);
    if (!id || importedSource.native) continue;
    paths.set(importedSource.id, id);
    const base = importedSource.id.replace(/(?:_all)?\.csv$/i, "");
    paths.set(`${base}.csv`, id);
    paths.set(`${base}_all.csv`, id);
  }
  const fileReferences = new Map<
    string,
    {
      id: string;
      page_id: string;
      path: string;
      file_name: string;
      mime_type: string;
    }
  >();
  for (const file of source.native?.files ?? []) {
    if (!sourceIds.has(file.page_id)) continue;
    const path = cleanArchivePath(file.path);
    if (!prepared.files[path]) throw new Error("importMissingFile");
    fileReferences.set(`id:${file.id}`, {
      ...file,
      id: randomUUID(),
      page_id: pageIds.get(file.page_id)!,
      path,
    });
  }
  const rewrite = (value: unknown, page: ImportPage): unknown => {
    if (Array.isArray(value)) return value.map((item) => rewrite(item, page));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        if (key === "pageId" && typeof child === "string" && pageIds.has(child))
          return [key, pageIds.get(child)];
        if (["href", "src"].includes(key) && typeof child === "string") {
          const fileId = pageFileIdFromSrc(child);
          if (fileId && fileReferences.has(`id:${fileId}`))
            return [
              key,
              pageFileUrl(projectId, fileReferences.get(`id:${fileId}`)!.id),
            ];
          const targetPage = /\/pages\/([0-9a-f-]{36})(?:[?#]|$)/i.exec(
            child,
          )?.[1];
          if (targetPage && pageIds.has(targetPage))
            return [
              key,
              "/projects/" + projectId + "/pages/" + pageIds.get(targetPage),
            ];
          const path = page.path && resolveArchiveLink(page.path, child);
          if (path && paths.has(path))
            return [
              key,
              "/projects/" + projectId + "/pages/" + paths.get(path),
            ];
          if (path && prepared.files[path] && !/\.(md|csv)$/i.test(path)) {
            const pathKey = `path:${path}`;
            if (!fileReferences.has(pathKey))
              fileReferences.set(pathKey, {
                id: randomUUID(),
                page_id: pageIds.get(page.id)!,
                path,
                file_name: path.split("/").at(-1)!,
                mime_type: "",
              });
            return [key, pageFileUrl(projectId, fileReferences.get(pathKey)!.id)];
          }
        }
        return [key, rewrite(child, page)];
      }),
    );
  };
  const pages = [];
  for (const [index, page] of ordered.entries()) {
    if (
      typeof page.title !== "string" ||
      page.title.length > 500 ||
      (page.icon !== null &&
        (typeof page.icon !== "string" || page.icon.length > 100)) ||
      (page.database_title_name != null &&
        (typeof page.database_title_name !== "string" ||
          page.database_title_name.length > 80)) ||
      (page.database_schema !== null && !isDatabaseSchema(page.database_schema))
    )
      throw new Error("importInvalidArchive");
    if (
      page.created_at &&
      (!Number.isFinite(Date.parse(page.created_at)) ||
        !/^\d{4}-/.test(page.created_at))
    )
      throw new Error("importInvalidArchive");
    if (
      page.markdown !== undefined &&
      (typeof page.markdown !== "string" ||
        Buffer.byteLength(page.markdown, "utf8") >
          MAX_IMPORT_PAGE_CONTENT_BYTES)
    )
      throw new Error("importTooLarge");
    let content: unknown = page.content ?? null;
    if (page.markdown !== undefined)
      content = (await markdownToPageServer(page.markdown)).content;
    let serializedContent: string;
    try {
      serializedContent = JSON.stringify(content);
    } catch {
      throw new Error("importInvalidArchive");
    }
    if (
      exceedsJsonDepth(content, MAX_PAGE_JSON_DEPTH) ||
      Buffer.byteLength(serializedContent, "utf8") >
        MAX_IMPORT_PAGE_CONTENT_BYTES
    )
      throw new Error("importTooLarge");
    content = rewrite(content, page);
    if (content != null) {
      const checked = checkPageContent(content);
      if (!checked.ok) throw new Error("importInvalidArchive");
      content = checked.content;
    }
    const values = { ...page.property_values };
    const schema =
      ordered.find((parent) => parent.id === page.parent_id)?.database_schema ??
      [];
    for (const [id, value] of Object.entries(values)) {
      const property = schema.find((property) => property.id === id);
      if (!property || !isDatabasePropertyValue(property, value))
        throw new Error("importInvalidMapping");
      if (property.type === "people" && Array.isArray(value)) {
        values[id] = [
          ...new Set(
            value.map((id) => {
              const target =
                peopleMap.get(id) ?? (memberIds.has(id) ? id : undefined);
              if (!target) throw new Error("importUnmatchedPeople");
              return target;
            }),
          ),
        ];
      }
    }
    pages.push({
      ...page,
      id: pageIds.get(page.id),
      parent_id: page.id === root.id ? null : pageIds.get(page.parent_id!),
      content,
      property_values: values,
      position:
        source.native && isPosition(page.position)
          ? page.position
          : String(index).padStart(10, "0") + "V",
    });
  }
  const referencedPaths = new Set<string>();
  let totalFileBytes = 0;
  if (fileReferences.size > MAX_IMPORT_FILES) throw new Error("importTooLarge");
  const files = [...fileReferences.values()].map((file) => {
    const bytes = prepared.files[file.path];
    if (!bytes?.length || bytes.length > MAX_PAGE_FILE_BYTES)
      throw new Error("importTooLarge");
    if (referencedPaths.has(file.path)) throw new Error("importInvalidArchive");
    referencedPaths.add(file.path);
    totalFileBytes += bytes.length;
    if (totalFileBytes > MAX_IMPORT_EXPANDED_BYTES)
      throw new Error("importTooLarge");
    return {
      ...file,
      storage_path:
        pageFileStoragePrefix(projectId, file.page_id) +
        "/" +
        file.id +
        "/" +
        sanitizeFileKey(file.file_name),
      mime_type: resolveUploadedMimeType(file.mime_type, bytes).slice(0, 120),
      size_bytes: bytes.length,
    };
  });
  if (
    files.length &&
    !(await projectStorageAllowed(service, projectId, totalFileBytes))
  )
    throw new Error("importStorageFull");
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const { error } = await service.storage
        .from("attachments")
        .upload(file.storage_path, prepared.files[file.path], {
          contentType: file.mime_type,
        });
      if (error) throw new Error("importFailed");
      uploaded.push(file.storage_path);
    }
  } catch (error) {
    if (uploaded.length)
      await service.storage.from("attachments").remove(uploaded);
    throw error;
  }
  const { data, error } = await service.rpc("import_page_database", {
    p_project: projectId,
    p_page: pageId,
    p_actor: actorId,
    p_request: args.requestId,
    p_revision: args.revision,
    p_pages: pages,
    p_files: files,
  });
  if (error) {
    // A transport failure can follow a successful commit. Keep its file bytes intact.
    if (/^[0-9A-Z]{5}$/.test(error.code))
      await service.storage
        .from("attachments")
        .remove(files.map((file) => file.storage_path));
    throw new Error(error.code === "40001" ? "importConflict" : "importFailed");
  }
  if (data?.replayed)
    await service.storage
      .from("attachments")
      .remove(files.map((file) => file.storage_path));
  queueSearchText(
    service,
    pages.map((page) => page.id!),
  );
  queuePageBodyLinks(
    service,
    pages.map((page) => page.id!),
  );
  return { count: data.count as number };
}
