import { describe, expect, it } from "vitest";

import { commitsSinceVersion } from "@/scripts/commits-since-version.mjs";

import { formatAppVersion } from "./app-version";

describe("formatAppVersion", () => {
  it("keeps the bare version on its tag", () => {
    expect(formatAppVersion("0.8.9", 0)).toBe("0.8.9");
  });

  it("suffixes with the number of commits behind", () => {
    expect(formatAppVersion("0.8.9", 1)).toBe("0.8.9-1");
    expect(formatAppVersion("1.2.3", 3)).toBe("1.2.3-3");
    expect(formatAppVersion("0.8.9", 41)).toBe("0.8.9-41");
    expect(formatAppVersion("0.8.9", 703)).toBe("0.8.9-703");
  });

  it("ne suffixe rien de ce qui n'est pas un compte", () => {
    expect(formatAppVersion("0.8.9", -1)).toBe("0.8.9");
    expect(formatAppVersion("0.8.9", Number.NaN)).toBe("0.8.9");
    expect(formatAppVersion("0.8.9", Number.POSITIVE_INFINITY)).toBe("0.8.9");
  });
});

describe("commitsSinceVersion", () => {
  // The measurement reads the REAL deposit: we therefore assert nothing on the day's account,
  // only about her form and what she does when she doesn't know.
  it("rend un entier positif ou nul", () => {
    const n = commitsSinceVersion();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 for a version with neither a tag nor a bump commit", () => {
    // The case of the superficial clone of Vercel without VERCEL_DEEP_CLONE: the basis of
    // counting is out of range. Better to keep silent than to guess.
    expect(commitsSinceVersion("99.99.99-inexistante")).toBe(0);
  });

  it("does not throw when the version is empty", () => {
    expect(commitsSinceVersion("")).toBe(0);
  });
});
