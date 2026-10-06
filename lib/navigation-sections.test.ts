import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS } from "./admin-sections";
import { SETTINGS_SECTIONS } from "./settings-sections";

// Read rendering sites once for both catalogs. Their own declarations in lib
// cannot prove that navigation has a destination in the application.
const sources = ["app", "components"].flatMap((directory) =>
  readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(join(directory, file), "utf8")),
);

describe.each([
  {
    name: "settings",
    catalog: SETTINGS_SECTIONS,
    reference: (name: string) => `anchor={SETTINGS_SECTIONS.${name}}`,
  },
  {
    name: "admin",
    catalog: ADMIN_SECTIONS,
    reference: (name: string) => `ADMIN_SECTIONS.${name}`,
  },
])("$name section catalog", ({ catalog, reference }) => {
  it("places every catalog entry on a rendered destination", () => {
    const orphans = Object.keys(catalog).filter((name) =>
      !sources.some((source) => source.includes(reference(name))),
    );
    expect(orphans, "catalog sections without a rendered destination").toEqual([]);
  });

  it("gives every section a unique identifier", () => {
    const ids = Object.values(catalog);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
