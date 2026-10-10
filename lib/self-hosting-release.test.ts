import { describe, expect, it } from "vitest";
import compatibility from "@/deploy/self-hosted/compatibility.json";
import packageJson from "@/package.json";
import { selfHostingRelease } from "@/lib/self-hosting-release";

 describe("public installation release", () => {
  it("uses a published compatibility row while the application prepares its next release", () => {
    expect(compatibility.entries).toContain(selfHostingRelease);
    expect(selfHostingRelease.tag).toBe(`v${selfHostingRelease.minddyRelease}`);
    for (const entry of compatibility.entries) {
      expect(selfHostingRelease.minddyRelease.localeCompare(entry.minddyRelease, "en", { numeric: true })).toBeGreaterThanOrEqual(0);
    }
    if (!compatibility.entries.some(entry => entry.minddyRelease === packageJson.version)) {
      expect(selfHostingRelease.tag).not.toBe(`v${packageJson.version}`);
    }
  });
 });
