import "server-only";
import Papa from "papaparse";
import { strToU8 } from "fflate";
import { getServiceClient } from "@/lib/supabase-service";
import {
  DATABASE_ARCHIVE_FORMAT,
  DATABASE_ARCHIVE_VERSION,
  type DatabaseArchive,
  type ImportPage,
} from "@/lib/database-import/types";
import { databasePropertyValue, databaseValueText } from "@/lib/page-databases";
import { relativePath } from "@/lib/pages-export";
import { pageFileUrl, sanitizeFileKey } from "@/lib/page-files";

/** Pair readable Markdown/CSV with exact schemas, bodies, metadata, and local file bytes. */
export async function databaseArchiveFiles(
  pages: ImportPage[],
  paths: Map<string, string>,
  names: ReadonlyMap<string, string>,
  entries: Record<string, Uint8Array>,
  projectId: string,
): Promise<Record<string, Uint8Array>> {
  const service = getServiceClient();
  const manifest: DatabaseArchive = {
    format: DATABASE_ARCHIVE_FORMAT,
    version: DATABASE_ARCHIVE_VERSION,
    pages,
    files: [],
    people: [...names].map(([id, name]) => ({ id, name })),
  };
  for (let offset = 0; offset < pages.length; offset += 50) {
    for (let fileOffset = 0; ; fileOffset += 500) {
      const { data: files, error } = await service
        .from("page_files")
        .select("id, page_id, file_name, mime_type, storage_path")
        .eq("project_id", projectId)
        .in(
          "page_id",
          pages.slice(offset, offset + 50).map((page) => page.id),
        )
        .order("id")
        .range(fileOffset, fileOffset + 499);
      if (error) throw new Error("Could not read database files");
      for (const file of files ?? []) {
        const { data, error: downloadError } = await service.storage
          .from("attachments")
          .download(file.storage_path);
        if (downloadError || !data)
          throw new Error("Could not export database file: " + file.file_name);
        const path =
          "__minddy_files__/" + file.id + "/" + sanitizeFileKey(file.file_name);
        entries[path] = new Uint8Array(await data.arrayBuffer());
        manifest.files.push({
          id: file.id,
          page_id: file.page_id,
          path,
          file_name: file.file_name,
          mime_type: file.mime_type,
        });
        for (const from of paths.values()) {
          if (!entries[from]) continue;
          const url = relativePath(from, path)
            .split("/")
            .map(encodeURIComponent)
            .join("/");
          const markdown = new TextDecoder()
            .decode(entries[from])
            .replace(
              new RegExp(
                '(?:https?:\\/\\/[^/\\s<>()"]+)?' +
                  pageFileUrl(projectId, file.id).replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                  ) +
                  "(?=[\\s<>)\"']|$)",
                "g",
              ),
              () => url,
            );
          entries[from] = strToU8(markdown);
        }
      }
      if (!files || files.length < 500) break;
    }
  }
  for (const database of pages.filter((page) => page.database_schema != null)) {
    const schema = database.database_schema!;
    const rows = pages.filter((page) => page.parent_id === database.id);
    const csv = Papa.unparse(
      {
        fields: [
          database.database_title_name ?? "Name",
          ...schema.map((property) => property.name),
        ],
        data: rows.map((row) => [
          row.title,
          ...schema.map((property) =>
            databaseValueText(
              databasePropertyValue(row, property),
              names,
              property,
            ),
          ),
        ]),
      },
      // Match the leading character even when a cell contains multiple lines.
      { escapeFormulae: /^[=+\-@\t\r]/ },
    );
    entries[paths.get(database.id)!.replace(/\.md$/, ".csv")] = strToU8(csv);
  }
  entries["minddy-database.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return entries;
}
