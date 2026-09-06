import type {
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseValues,
} from "@/lib/page-databases";

export const DATABASE_ARCHIVE_FORMAT = "minddy-database";
export const DATABASE_ARCHIVE_VERSION = 1;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_EXPANDED_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_PAGES = 1000;
export type ImportColumnType =
  | Exclude<DatabasePropertyType, "created_at">
  | "title";
export interface ImportColumn {
  name: string;
  type: ImportColumnType;
}
export interface ImportPage {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content?: unknown;
  markdown?: string;
  path?: string;
  database_schema: DatabaseProperty[] | null;
  database_title_name: string | null;
  property_values: DatabaseValues;
  created_at?: string;
  position: string;
}
export interface ImportFile {
  id: string;
  page_id: string;
  path: string;
  file_name: string;
  mime_type: string;
}
export interface DatabaseArchive {
  format: typeof DATABASE_ARCHIVE_FORMAT;
  version: typeof DATABASE_ARCHIVE_VERSION;
  pages: ImportPage[];
  files: ImportFile[];
  people: { id: string; name: string }[];
}
export interface ImportSource {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  columns: ImportColumn[];
  native?: DatabaseArchive;
}
export interface PreparedDatabaseImport {
  sources: ImportSource[];
  files: Record<string, Uint8Array>;
}
