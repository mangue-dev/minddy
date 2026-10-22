/**
 * Localize exact seeded demo prose in captured read responses.
 *
 * Fixtures map whole seeded strings (often Markdown) to their translation.
 * Since the shared editor engine (MIN-728), issue descriptions and plans
 * arrive as editor JSON split into blocks, so each Markdown block is also
 * paired with its translated block and matched against the editor block's
 * text. Anything without an exact match stays as it is.
 */

const LIST_ITEM = /^\s*(?:[-*+]\s+(?:\[[ x~-]\]\s+)?|\d+\.\s+)/;

function plain(text) {
  return text
    .replace(/^\s*(?:#{1,6}\s+|>\s+)/, "")
    .replace(LIST_ITEM, "")
    .replace(/\*\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function blockPairs(original, translated) {
  const pairs = [];
  const left = original.trim().split(/\n{2,}/);
  const right = translated.trim().split(/\n{2,}/);
  if (left.length !== right.length) return pairs;
  left.forEach((block, index) => {
    const leftLines = block.split("\n");
    const rightLines = right[index].split("\n");
    const isList = (lines) => lines.every((line) => LIST_ITEM.test(line));
    if (isList(leftLines) && isList(rightLines) && leftLines.length === rightLines.length) {
      leftLines.forEach((line, item) => pairs.push([plain(line), plain(rightLines[item])]));
    } else {
      pairs.push([plain(block), plain(right[index])]);
    }
  });
  return pairs;
}

/** Builds the lookup used by `translateDemo` from a fixture mapping. */
export function demoProse(mapping) {
  const exact = new Map(Object.entries(mapping));
  const trimmed = new Map(Object.entries(mapping).map(([from, to]) => [from.trim(), to]));
  const blocks = new Map();
  for (const [from, to] of exact) {
    blocks.set(plain(from), plain(to));
    for (const [left, right] of blockPairs(from, to)) if (left) blocks.set(left, right);
  }
  return { exact, trimmed, blocks };
}

function translateEditorBlock(node, prose) {
  const children = node.content;
  if (!Array.isArray(children) || !children.length || !children.every((child) => child.type === "text")) return null;
  const translation = prose.blocks.get(plain(children.map((child) => child.text).join("")));
  if (!translation) return null;
  const marks = children[0].marks;
  const sameMarks = children.every((child) => JSON.stringify(child.marks) === JSON.stringify(marks));
  return { ...node, content: [{ type: "text", text: translation, ...(sameMarks && marks ? { marks } : {}) }] };
}

/** Returns a copy of a response body with every matched demo string translated. */
export function translateDemo(value, prose) {
  if (typeof value === "string") return prose.exact.get(value) ?? prose.trimmed.get(value.trim()) ?? value;
  if (Array.isArray(value)) return value.map((item) => translateDemo(item, prose));
  if (value && typeof value === "object") {
    const block = translateEditorBlock(value, prose);
    if (block) return block;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateDemo(item, prose)]));
  }
  return value;
}
