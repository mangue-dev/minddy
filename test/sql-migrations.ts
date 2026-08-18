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

/** Ramène le dump pg_dump quoté à une forme stable pour tester sa sémantique. */
export function canonicalSql(sql: string): string {
  return sql
    // Un dump peut aussi contenir un `"` dans une chaîne SQL (options ts_headline,
    // par exemple). Ne déquote donc que les identifiants PostgreSQL ordinaires.
    .replace(/"([A-Za-z_][A-Za-z0-9_ ]*)"/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
