import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADMIN_SECTIONS } from "@/lib/admin-sections";

const ROOT = join(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "components"];
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
]);

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (IGNORED_DIRS.has(entry)) continue;
      const fullPath = join(directory, entry);
      if (statSync(fullPath).isDirectory()) walk(fullPath);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        files.push(fullPath);
      }
    }
  };
  for (const directory of SOURCE_DIRS) walk(join(ROOT, directory));
  return files;
}

describe("admin section catalog", () => {
  const sources = sourceFiles().map((file) => readFileSync(file, "utf8"));

  it("places every catalog entry on an administration destination", () => {
    const orphans = Object.keys(ADMIN_SECTIONS).filter((name) => {
      const reference = `ADMIN_SECTIONS.${name}`;
      return !sources.some((source) => source.includes(reference));
    });
    expect(orphans, "catalog sections without a rendered destination").toEqual(
      [],
    );
  });

  it("gives every section a unique identifier", () => {
    const ids = Object.values(ADMIN_SECTIONS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
