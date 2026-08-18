import { describe, expect, it } from "vitest";
import { suggestProjectName } from "./project-name";
import { isValidKey, suggestKeyFromName } from "./project-key";

describe("suggestProjectName", () => {
  it("suggests a name whose suggested key is already valid", () => {
    // The “Key” field fills in automatically from the name: a proposition which
    // asking to complete the key by hand would miss its goal.
    for (let i = 0; i < 200; i++) {
      const name = suggestProjectName();
      expect(isValidKey(suggestKeyFromName(name))).toBe(true);
    }
  });

  it("discards rejected names", () => {
    const seen = new Set<string>();
    // We refuse everything that has already been released: each print must be new as
    // qu'il reste des noms libres.
    for (let i = 0; i < 20; i++) {
      const name = suggestProjectName((c) => seen.has(c));
      expect(seen.has(name)).toBe(false);
      seen.add(name);
    }
  });

  it("still suggests a name when everything is rejected", () => {
    expect(suggestProjectName(() => true)).not.toBe("");
  });
});
