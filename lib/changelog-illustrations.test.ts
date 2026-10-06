import { describe, expect, it } from "vitest";
import { CHANGELOG_ASPECT_RATIOS, resolveChangelogIllustration } from "./changelog-illustrations";
import type { ChangelogDraft, ChangelogIllustration } from "./changelog-types";
import { validateDraft } from "@/scripts/changelog-lib.mjs";
import release from "@/content/changelog/releases/0.11.0.json";

describe("changelog artwork selection", () => {
  it("gives the published bento distinct feature artwork without mutating the catalog", () => {
    const original = structuredClone(release);
    const art = release.features.map(feature => resolveChangelogIllustration(feature.id, feature.illustration as ChangelogIllustration));
    expect(new Set(art.map(illustration => illustration.kind === "image" ? illustration.url : illustration.name)).size).toBe(13);
    expect(resolveChangelogIllustration("unified-numo", { kind: "code", name: "assistant" })).toEqual({ kind: "icon", name: "assistant" });
    expect(resolveChangelogIllustration("smart-fill-everywhere", { kind: "code", name: "assistant" })).toEqual({ kind: "icon", name: "smart-fill" });
    expect(release).toEqual(original);
  });

  it("preserves explicit artwork and safely handles unknown feature IDs", () => {
    for (const illustration of [
      { kind: "icon", name: "smart-assign" },
      { kind: "image", url: "https://example.test/art.webp", width: 600, height: 400 },
    ] satisfies ChangelogIllustration[]) {
      expect(resolveChangelogIllustration("unified-numo", illustration)).toBe(illustration);
    }
    const illustration: ChangelogIllustration = { kind: "code", name: "pages" };
    for (const id of ["new-feature", "toString", "constructor", "__proto__"]) {
      expect(resolveChangelogIllustration(id, illustration)).toBe(illustration);
    }
  });

  it("accepts every renderer preset for new releases and rejects unsupported names", () => {
    const draft = structuredClone(release) as ChangelogDraft;
    for (const name of Object.keys(CHANGELOG_ASPECT_RATIOS) as (keyof typeof CHANGELOG_ASPECT_RATIOS)[]) {
      for (const kind of ["code", "icon"] as const) {
        draft.features[0].illustration = { kind, name };
        expect(() => validateDraft(draft)).not.toThrow();
        expect(CHANGELOG_ASPECT_RATIOS[name]).toBeGreaterThan(0);
      }
    }
    draft.features[0].illustration = { kind: "code", name: "unknown" } as unknown as ChangelogIllustration;
    expect(() => validateDraft(draft)).toThrow("unknown illustration name");
  });
});
