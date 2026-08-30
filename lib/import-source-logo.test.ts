import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/import-source-logo.tsx"),
  "utf8",
);

describe("import source logo", () => {
  it("maps every external import source to a distinct packaged mark", () => {
    for (const id of ["linear", "jira", "notion", "github", "trello"]) {
      expect(source).toMatch(new RegExp(`${id}: \\{ icon: si`, "u"));
    }
  });

  it("keeps the project-owned minddy asset and an unknown-source fallback", () => {
    expect(source).toContain('source === "minddy"');
    expect(source).toContain("<FileUp");
  });
});
