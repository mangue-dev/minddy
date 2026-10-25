/**
 * The newest row of `deploy/self-hosted/compatibility.json`, by numeric
 * release order. Plain JavaScript so the desktop build can read it without the
 * TypeScript toolchain: the shell receives only the result, not the 23 KB
 * table (MIN-781).
 */
export function latestCompatibilityEntry(entries) {
  return entries.reduce((latest, entry) => {
    const left = latest.minddyRelease.split(".").map(Number);
    const right = entry.minddyRelease.split(".").map(Number);
    for (let index = 0; index < 3; index++) {
      if (right[index] !== left[index]) return right[index] > left[index] ? entry : latest;
    }
    return latest;
  });
}
