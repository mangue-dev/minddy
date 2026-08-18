import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
export const BASELINE_MIGRATION = "20270106090000_baseline.sql";
export const INITIAL_DATA_MIGRATION = "20270106091000_initial_data.sql";

export function migrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Répertoire des migrations SQL absent : ${MIGRATIONS_DIR}`);
  }
  return readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
}

export function readMigration(file: string): string {
  const name = basename(file);
  const path = join(MIGRATIONS_DIR, name);
  if (name !== file || !existsSync(path)) {
    throw new Error(
      `Migration SQL absente référencée par un test : ${file}. ` +
        `Migrations distribuées : ${migrationFiles().join(", ")}`,
    );
  }
  return readFileSync(path, "utf8");
}

export function readBaseline(): string {
  return readMigration(BASELINE_MIGRATION);
}

/** Returns the quoted pg_dump dump to a stable form to test its semantics. */
export function canonicalSql(sql: string): string {
  return sql
    // A dump can also contain a `"` in an SQL string (options ts_headline,
    // For example). So only unquote ordinary PostgreSQL identifiers.
    .replace(/"([A-Za-z_][A-Za-z0-9_ ]*)"/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
