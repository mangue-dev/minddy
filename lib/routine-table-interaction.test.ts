import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/routines/routine-detail.tsx"),
  "utf8",
);
const tableBody = source.split("<tbody")[1]?.split("</tbody>")[0] ?? "";

describe("routine run table interactions", () => {
  it("does not overlay one run control across the table body", () => {
    expect(tableBody).not.toContain("absolute inset-0");
  });

  it("keeps pull request clicks out of the run row handler", () => {
    expect(tableBody).toContain("event.stopPropagation();");
  });
});
