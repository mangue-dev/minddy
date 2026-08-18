import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MIGRATIONS_DIR, readMigration } from "@/test/sql-migrations";

const ROOT = process.cwd();
const TEST_ROOTS = [join(ROOT, "lib"), join(ROOT, "scripts"), join(ROOT, "test")];
const MIGRATION_LITERAL = /(?:^|\/)(20\d{12}_[a-z0-9_]+\.sql)$/;

function testFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return /\.test\.(?:ts|mjs)$/.test(name) ? [path] : [];
  });
}

/** Extract the literals without taking the names cited in the comments. */
function stringLiterals(source: string): string[] {
  const literals: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith("//", index)) {
      index = source.indexOf("\n", index);
      if (index < 0) break;
      continue;
    }
    if (source.startsWith("/*", index)) {
      index = source.indexOf("*/", index + 2);
      if (index < 0) break;
      index += 1;
      continue;
    }
    const quote = source[index];
    if (quote !== '"' && quote !== "'" && quote !== "`") continue;
    let value = "";
    for (index += 1; index < source.length; index += 1) {
      if (source[index] === "\\") {
        value += source[index + 1] ?? "";
        index += 1;
      } else if (source[index] === quote) {
        break;
      } else {
        value += source[index];
      }
    }
    literals.push(value);
  }
  return literals;
}

function missingMigrationReferences(): string[] {
  const missing: string[] = [];
  for (const file of TEST_ROOTS.flatMap(testFiles)) {
    for (const literal of stringLiterals(readFileSync(file, "utf8"))) {
      const migration = MIGRATION_LITERAL.exec(literal)?.[1];
      if (migration && !existsSync(join(MIGRATIONS_DIR, migration))) {
        missing.push(`${file.slice(ROOT.length + 1)} référence la migration absente ${migration}`);
      }
    }
  }
  return missing;
}

describe("références SQL des tests", () => {
  it("ne référence aucune migration supprimée", () => {
    expect(missingMigrationReferences()).toEqual([]);
  });

  it("explique explicitement une fixture de migration absente", () => {
    const absent = ["20990101000000", "fixture_absente.sql"].join("_");
    expect(() => readMigration(absent)).toThrow(
      `Migration SQL absente référencée par un test : ${absent}`,
    );
  });
});
