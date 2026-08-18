/**
 * The DEPTH of a JSON value, measured without recursion (MIN-348).
 *
 * The page body size guardrail was `JSON.stringify(value).length`
 * — and it was the guardrail itself that fell first: `JSON.stringify`
 * goes down the tree through the call stack, so a document of a few kilobytes
 * but nested ten thousand times throws a `RangeError` BEFORE it can be weighed.
 * The terminal to put first is therefore not the size, it is the depth, and
 * it must be measured other than by a recursive descent.
 *
 * Hence an EXPLICIT stack. It has a second, free effect: a cyclical object
 * (which `JSON.stringify` refuses, but after the fact) increases the depth without
 * end, so comes out through the ceiling instead of going in circles.
 *
 * Pure module, without `server-only`: the same terminal is used by the customer on the day he
 * wants to refuse before sending.
 */

/**
 * The ceiling of a ProseMirror page body.
 *
 * Large on purpose: a bulleted list nested ten times already weighs around thirty
 * levels (doc → list → item → paragraph, by notch), and a quote in a
 * array in a list adds that many. A hundred levels is beyond anything
 * document that an editor returns — but far short of what breaks a pile.
 */
export const MAX_PAGE_JSON_DEPTH = 100;

/**
 * `true` as soon as `value` exceeds `max` nesting levels.
 *
 * Stops at the first faulty branch: on a hostile entry, the cost is
 * that of the descent to the ceiling, not that of the entire tree.
 */
export function exceedsJsonDepth(value: unknown, max: number): boolean {
  // [value, value depth]. The root is at level 1.
  const stack: [unknown, number][] = [[value, 1]];

  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    if (node === null || typeof node !== "object") continue;
    if (depth > max) return true;

    if (Array.isArray(node)) {
      for (const item of node) stack.push([item, depth + 1]);
    } else {
      for (const item of Object.values(node)) stack.push([item, depth + 1]);
    }
  }
  return false;
}
