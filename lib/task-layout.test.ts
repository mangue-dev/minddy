import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const textClassBlock = (file: string, anchor: string) => {
  const contents = source(file);
  const start = contents.indexOf(anchor);
  expect(start).toBeGreaterThanOrEqual(0);
  return contents.slice(start, start + 400);
};

describe("task text layout", () => {
  it.each([
    ["plan rows", "components/plan-task-row.tsx", "min-w-0 flex-1 text-sm"],
    [
      "notebook and page task items",
      "components/scratchpad/task-item-view.tsx",
      "min-w-0 flex-1 leading-relaxed",
    ],
  ])("keeps text metrics unchanged for in-progress %s", (_name, file, anchor) => {
    const classes = textClassBlock(file, anchor);

    expect(classes).not.toMatch(
      /in_progress[\s\S]{0,120}(?:font-|leading-|tracking-|text-(?:xs|sm|base|lg|xl))/
    );
  });
});
