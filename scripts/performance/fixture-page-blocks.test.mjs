import assert from "node:assert/strict";
import test from "node:test";
import { workload } from "./seed.mjs";
import { stabilizedFixtureContent } from "./fixture-page-blocks.mjs";

test("repairs only exact synthetic duplicates and preserves stable IDs", () => {
  const original = workload("owner").pages[10];
  const duplicate = { ...original, content: { type: "doc", content: [...original.content.content, ...original.content.content] } };
  const repaired = stabilizedFixtureContent(duplicate, original, 0, 10);
  assert.deepEqual(repaired, original.content);
  assert.deepEqual(stabilizedFixtureContent({ ...original, content: repaired }, original, 0, 10), repaired);
  assert.equal(new Set(workload("owner").pages.flatMap((page) => page.content.content.map((block) => block.attrs.blockId))).size, 9600);
});

test("refuses changed, foreign, partial and ambiguous synthetic documents", () => {
  const original = workload("owner").pages[10];
  for (const patch of [{ id: "foreign" }, { project_id: "foreign" }, { title: "A human edit" }]) {
    assert.throws(() => stabilizedFixtureContent({ ...original, ...patch }, original, 0, 10));
  }
  for (const size of [79, 81, 240]) {
    const blocks = Array.from({ length: size }, (_, index) => original.content.content[index % 80]);
    assert.throws(() => stabilizedFixtureContent({ ...original, content: { type: "doc", content: blocks } }, original, 0, 10));
  }
  const edited = structuredClone(original);
  edited.content.content[17].content[0].text = "Keep this real edit";
  assert.throws(() => stabilizedFixtureContent(edited, original, 0, 10));
  const duplicateId = structuredClone(original);
  duplicateId.content.content[17].attrs.blockId = duplicateId.content.content[16].attrs.blockId;
  assert.throws(() => stabilizedFixtureContent(duplicateId, original, 0, 10));
});
