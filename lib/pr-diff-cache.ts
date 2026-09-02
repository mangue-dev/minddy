/**
 * Build a compact cache namespace for a complete pull request diff.
 *
 * `@pierre/diffs` otherwise falls back to the file name as its worker cache
 * key. A refreshed pull request can keep the same path while changing the
 * patch, which lets an earlier highlighted result be paired with new hunk
 * metadata. The renderer then reads past the cached line arrays and throws.
 * Including the content fingerprint keeps unchanged renders reusable while
 * making every changed patch a distinct worker target.
 */
function contentFingerprint(value: string): string {
  let fnv = 0x811c9dc5;
  let mixed = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 0x01000193);
    mixed = Math.imul(mixed ^ code, 0x85ebca6b);
    mixed ^= mixed >>> 13;
  }

  return `${value.length}:${(fnv >>> 0).toString(36)}:${(mixed >>> 0).toString(36)}`;
}

export function pullRequestDiffCacheKey(diff: string): string {
  return `pr-diff:${contentFingerprint(diff)}`;
}

/** Cache identity for a partial diff after its complete file sides are loaded. */
export function pullRequestHydratedDiffCacheKey(
  oldName: string,
  oldContents: string,
  newName: string,
  newContents: string,
): string {
  return `pr-hydrated:${contentFingerprint(`${oldName}\0${oldContents}\0${newName}\0${newContents}`)}`;
}
