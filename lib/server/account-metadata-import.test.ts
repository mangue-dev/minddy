import { describe, expect, it } from "vitest";
import { ONBOARDING_CURRENT_VERSION, resolveOnboardingState } from "@/lib/onboarding";
import { selectImportedAccountMetadata } from "./account-metadata-import";

const signals = { projectCount: 0, issueCount: 0, cyclesEnabled: false };

describe("imported onboarding metadata", () => {
  it.each([
    ["numo", "mcp"],
    ["mcp"],
    ["project", "tickets", "mcp", "cycles"],
    ["project", "tickets", "numo", "mcp", "cycles"],
  ])("preserves current-format progress for %j", (...steps) => {
    const source = {
      onboarding_started: true,
      onboarding_dismissed: false,
      onboarding_version: ONBOARDING_CURRENT_VERSION,
      onboarding_steps: steps,
    };
    const restored = selectImportedAccountMetadata(source);

    expect(restored).toEqual(source);
    expect(resolveOnboardingState({ ...signals, meta: restored }))
      .toEqual(resolveOnboardingState({ ...signals, meta: source }));
  });

  it("preserves legacy progress without assigning it the current format", () => {
    const source = { onboarding_started: true, onboarding_steps: ["issue", "import", "key", "mcp"] };
    const restored = selectImportedAccountMetadata(source);

    expect(restored).toEqual(source);
    expect(resolveOnboardingState({ ...signals, meta: restored }))
      .toEqual(resolveOnboardingState({ ...signals, meta: source }));
  });

  it("accepts an explicit legacy version", () => {
    expect(selectImportedAccountMetadata({ onboarding_version: 1 })).toEqual({ onboarding_version: 1 });
  });

  it.each([0, -1, 1.5, ONBOARDING_CURRENT_VERSION + 1, NaN, Infinity, "2", true, null, {}, []])(
    "rejects invalid or unsupported onboarding version %j",
    (version) => {
      expect(selectImportedAccountMetadata({ onboarding_version: version })).toEqual({});
    },
  );

  it("filters unknown steps and arbitrary metadata while deduplicating supported IDs", () => {
    expect(selectImportedAccountMetadata({
      onboarding_steps: ["numo", "numo", "mcp", "key", "issue", "import", "unknown", 2, null, {}],
      private_notes: "not an account preference",
    })).toEqual({ onboarding_steps: ["numo", "mcp", "key", "issue", "import"] });
  });

  it.each([null, "numo", 2, {}])("ignores malformed onboarding steps %j", (steps) => {
    expect(selectImportedAccountMetadata({ onboarding_steps: steps })).toEqual({});
  });
});
