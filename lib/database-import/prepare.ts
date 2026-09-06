import { strFromU8 } from "fflate";
import { archiveTitle } from "./archive";
import { importCell, mappedColumns } from "./mapping";
import {
  MAX_IMPORT_PAGES,
  type ImportColumn,
  type ImportPage,
  type ImportSource,
  type PreparedDatabaseImport,
} from "./types";

export function resolveArchiveLink(from: string, href: string): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split("#")[0]);
  } catch {
    return null;
  }
  const parts = from.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

export function prepareImportPages(
  prepared: PreparedDatabaseImport,
  source: ImportSource,
  columns: ImportColumn[],
  people: ReadonlyMap<string, string>,
): ImportPage[] {
  if (source.native) {
    const ids = new Set([source.id]);
    for (let pass = 0; pass < source.native.pages.length; pass++) {
      const before = ids.size;
      for (const page of source.native.pages)
        if (page.parent_id && ids.has(page.parent_id)) ids.add(page.id);
      if (ids.size === before) break;
    }
    return source.native.pages
      .filter((page) => ids.has(page.id))
      .map((page) => ({
        ...page,
        parent_id: page.id === source.id ? null : page.parent_id,
      }));
  }
  if (columns.length !== source.headers.length)
    throw new Error("importInvalidMapping");
  const schema = mappedColumns(columns, source.rows);
  const titleIndex = columns.findIndex((column) => column.type === "title");
  const root: ImportPage = {
    id: source.id,
    parent_id: null,
    title: source.title,
    icon: null,
    database_schema: schema,
    database_title_name: columns[titleIndex].name,
    property_values: {},
    position: "0",
  };
  const rootPath = source.id.replace(/(?:_all)?\.csv$/i, ".md");
  if (prepared.files[rootPath]) {
    root.path = rootPath;
    root.markdown = strFromU8(prepared.files[rootPath]);
  }
  const folder = source.id.replace(/(?:_all)?\.csv$/i, "") + "/";
  const nestedSources = prepared.sources.filter(
    (candidate) =>
      candidate.id !== source.id && candidate.id.startsWith(folder),
  );
  const directNestedSources = nestedSources.filter(
    (candidate) =>
      !nestedSources.some(
        (parent) =>
          candidate !== parent &&
          candidate.id.startsWith(
            parent.id.replace(/(?:_all)?\.csv$/i, "") + "/",
          ),
      ),
  );
  const markdownPaths = Object.keys(prepared.files).filter(
    (path) =>
      path.startsWith(folder) &&
      /\.md$/i.test(path) &&
      !directNestedSources.some(
        (nested) =>
          path.startsWith(nested.id.replace(/(?:_all)?\.csv$/i, "") + "/") ||
          path === nested.id.replace(/(?:_all)?\.csv$/i, ".md"),
      ),
  );
  const used = new Set<string>();
  const pages: ImportPage[] = [root];
  source.rows.forEach((row, index) => {
    const rawTitle = row[titleIndex];
    const link = /^\[([\s\S]*)\]\((.*)\)$/.exec(rawTitle);
    const title = link?.[1] ?? rawTitle;
    const linkedPath = link && resolveArchiveLink(source.id, link[2]);
    const matches = markdownPaths.filter(
      (path) => !used.has(path) && archiveTitle(path) === title,
    );
    const path =
      linkedPath && prepared.files[linkedPath]
        ? linkedPath
        : matches.length === 1
          ? matches[0]
          : undefined;
    if (path) used.add(path);
    const values: ImportPage["property_values"] = {};
    let propertyIndex = 0;
    columns.forEach((column, i) => {
      if (column.type !== "title") {
        const property = schema[propertyIndex++];
        values[property.id] = importCell(row[i], property, people);
      }
    });
    pages.push({
      id: path ?? source.id + "#row-" + index,
      parent_id: root.id,
      title,
      icon: null,
      path,
      markdown: path ? strFromU8(prepared.files[path]) : "",
      database_schema: null,
      database_title_name: null,
      property_values: values,
      position: String(index),
    });
  });
  // Keep unmatched documents and nested pages instead of discarding ambiguous titles.
  for (const path of markdownPaths
    .filter((path) => !used.has(path))
    .sort((a, b) => a.split("/").length - b.split("/").length)) {
    const parent = pages
      .filter(
        (page) => page.path && path.startsWith(page.path.slice(0, -3) + "/"),
      )
      .sort((a, b) => b.path!.length - a.path!.length)[0];
    pages.push({
      id: path,
      parent_id: parent?.id ?? root.id,
      title: archiveTitle(path),
      icon: null,
      path,
      markdown: strFromU8(prepared.files[path]),
      database_schema: null,
      database_title_name: null,
      property_values: {},
      position: String(pages.length),
    });
  }
  for (const nested of directNestedSources) {
    const parent = pages
      .filter(
        (page) =>
          page.path && nested.id.startsWith(page.path.slice(0, -3) + "/"),
      )
      .sort((a, b) => b.path!.length - a.path!.length)[0];
    if (!parent || parent.id === root.id)
      throw new Error("importInvalidArchive");
    const children = prepareImportPages(
      prepared,
      nested,
      nested.columns,
      people,
    );
    children[0].parent_id = parent.id;
    pages.push(...children);
  }
  if (pages.length > MAX_IMPORT_PAGES) throw new Error("importTooLarge");
  return pages;
}
