import compatibility from "@/deploy/self-hosted/compatibility.json";

/** Public installation links follow published compatibility, including on prerelease builds. */
export const selfHostingRelease = compatibility.entries.reduce((latest, entry) => {
  const left = latest.minddyRelease.split(".").map(Number);
  const right = entry.minddyRelease.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (right[index] !== left[index]) return right[index] > left[index] ? entry : latest;
  }
  return latest;
});
