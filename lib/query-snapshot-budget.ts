/** Optional cache snapshots must stay small before any full JSON allocation. */
export const MAX_QUERY_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_VALUES = 100_000;

/**
 * Preflight plain JSON data without building a serialized string. Count repeated
 * references each time: a small shared object graph can expand enormously in JSON.
 * Unsupported prototypes, accessors and cycles skip optional persistence rather
 * than invoking user code or allowing an unbounded stringify allocation.
 */
export function fitsQuerySnapshotBudget(value: unknown, limit = MAX_QUERY_SNAPSHOT_BYTES): boolean {
  let bytes = 0;
  let values = 0;
  const ancestors = new Set<object>();
  const add = (size: number) => (bytes += size) <= limit;
  const string = (text: string): boolean => {
    // Every UTF-16 code unit needs at least one serialized byte.
    if (text.length > limit - bytes - 2 || !add(2)) return false;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) {
        if (!add(2)) return false;
      } else if (code < 32) {
        if (!add(6)) return false;
      } else if (code < 128) {
        if (!add(1)) return false;
      } else if (code < 2048) {
        if (!add(2)) return false;
      } else if (code >= 0xd800 && code <= 0xdbff &&
          text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
        if (!add(4)) return false;
        i++;
      } else if (code >= 0xd800 && code <= 0xdfff) {
        if (!add(6)) return false;
      } else if (!add(3)) return false;
    }
    return true;
  };
  const visit = (item: unknown, depth: number): boolean => {
    if (++values > MAX_VALUES || depth > MAX_DEPTH) return false;
    if (item === null || item === undefined || typeof item === "boolean") return add(5);
    if (typeof item === "string") return string(item);
    // A conservative bound covers any finite double and JSON's nonfinite null.
    if (typeof item === "number") return add(25);
    if (typeof item !== "object") return false;
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) return false;
    if (ancestors.has(item) || !add(2)) return false;
    ancestors.add(item);
    if (array) {
      // Sparse arrays also expand to nulls; never iterate an enormous length.
      if (item.length > MAX_VALUES - values || item.length > limit - bytes) return false;
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, i);
        if (descriptor && !Object.hasOwn(descriptor, "value")) return false;
        if (!add(1) || !visit(descriptor?.value, depth + 1)) return false;
      }
    } else {
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!Object.hasOwn(descriptor, "value")) return false;
        // JSON.stringify invokes toJSON even when it is not enumerable.
        if (key === "toJSON") return false;
        if (descriptor.value === undefined) continue;
        if (!add(2) || !string(key) || !visit(descriptor.value, depth + 1)) return false;
      }
    }
    // A hidden toJSON method must not bypass this preflight.
    if (Object.hasOwn(item, "toJSON")) return false;
    ancestors.delete(item);
    return true;
  };
  try { return visit(value, 0); }
  catch { return false; }
}
