import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * MIN-739 — Minddy owns its UI components.
 *
 * The primitives live in `components/ui/`, the design tokens in
 * `app/tokens.css`. The former `mangue-ui` package must not come back as a
 * dependency or an import: a component changed in two places drifts, and a
 * contributor would again need another repository to fix a button.
 */
const SOURCE = /\.(?:[cm]?[jt]sx?|css)$/;

function trackedSources(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => SOURCE.test(file));
}

describe("UI component ownership", () => {
  it("does not depend on mangue-ui", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, Record<string, string> | undefined>;
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      expect(pkg[field]?.["mangue-ui"]).toBeUndefined();
    }
  });

  it("never imports mangue-ui", () => {
    const importer = /(?:from\s*|import\s*\(\s*|require\(\s*|vi\.mock\(\s*|@import\s+|@source\s+)["'][^"']*mangue-ui(?:[/"'])/;
    const offenders = trackedSources().filter((file) => importer.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
