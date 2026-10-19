import { describe, expect, it } from "vitest";
import {
  MAX_RESOURCE_NAME_LENGTH,
  isRenamableResource,
  normalizeResourceName,
  resourceNameStemLength,
} from "./resource-name";

describe("normalizeResourceName", () => {
  it("trims and keeps the name on one line", () => {
    expect(normalizeResourceName("  Spec\n final.pdf  ")).toBe("Spec final.pdf");
  });

  it("refuses an empty name and anything that is not a string", () => {
    expect(normalizeResourceName("   ")).toBeNull();
    expect(normalizeResourceName(42)).toBeNull();
    expect(normalizeResourceName(null)).toBeNull();
  });

  it("caps the stored length", () => {
    expect(normalizeResourceName("a".repeat(500))).toHaveLength(MAX_RESOURCE_NAME_LENGTH);
  });
});

describe("resourceNameStemLength", () => {
  it("stops before the extension", () => {
    expect(resourceNameStemLength("report.final.pdf")).toBe("report.final".length);
  });

  it("selects the whole name without an extension or for a dotfile", () => {
    expect(resourceNameStemLength("Linear roadmap")).toBe("Linear roadmap".length);
    expect(resourceNameStemLength(".env")).toBe(".env".length);
  });
});

describe("isRenamableResource", () => {
  it("lets files and links be renamed, never a page", () => {
    expect(isRenamableResource({ kind: "file" })).toBe(true);
    expect(isRenamableResource({ kind: "link" })).toBe(true);
    expect(isRenamableResource({})).toBe(true);
    expect(isRenamableResource({ kind: "page" })).toBe(false);
  });
});
