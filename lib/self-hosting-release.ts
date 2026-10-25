import compatibility from "@/deploy/self-hosted/compatibility.json";
import { latestCompatibilityEntry } from "@/lib/self-hosting-release-core.mjs";

/** Public installation links follow published compatibility, including on prerelease builds. */
export const selfHostingRelease = latestCompatibilityEntry(compatibility.entries);
