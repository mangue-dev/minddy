import assert from "node:assert/strict";
import { id } from "./seed.mjs";

/** Refuse any content outside the known synthetic document and its exact duplicate. */
export function stabilizedFixtureContent(page, original, project, document) {
  const semantic = (block) => ({ type: block.type, level: block.attrs?.level, content: block.content });
  assert.equal(page.id, original.id);
  assert.equal(page.project_id, original.project_id);
  assert.equal(page.title, original.title);
  assert.equal(page.content.type, "doc");
  const blocks = page.content.content;
  assert.ok([80, 160].includes(blocks.length), "Refuse unrelated fixture edits");
  for (let offset = 0; offset < blocks.length; offset += 80) {
    assert.deepEqual(blocks.slice(offset, offset + 80).map(semantic), original.content.content.map(semantic), "Refuse unrelated fixture content");
  }
  const content = { ...page.content, content: blocks.slice(0, 80).map((block, index) => ({
    ...block, attrs: { ...block.attrs, blockId: block.attrs?.blockId ?? id(`page-${project}-${document}-block-${index}`) },
  })) };
  assert.equal(new Set(content.content.map((block) => block.attrs.blockId)).size, 80);
  assert.ok(content.content.every((block) => typeof block.attrs.blockId === "string" && block.attrs.blockId.length > 0));
  return content;
}
