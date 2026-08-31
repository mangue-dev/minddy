import { describe, expect, it } from "vitest";
import { applyContextSelection, contextChips } from "./assistant-context";
import type { AssistantPageContext } from "./assistant-types";

/**
 * Numo's context seen as pills, and the REVERSE path: turn off
 * the eye of a pill must remove from the sent context exactly the fields
 * that it represented.
 *
 * This reverse path can break silently. Adding a context kind requires both a
 * chip and its field-table entry. Adding only the chip makes the interface say
 * Numo ignored the context even though the request still carries it. The final
 * test protects every current and future context kind from that drift.
 */

// The real translator brings nothing here: what is verified is the PATH of a
// field into its chip, not the sentence rendered inside it.
const t = ((key: string) => key) as unknown as Parameters<
  typeof contextChips
>[1]["t"];

/** A context that carries one chip of every ambient kind. */
const everything: AssistantPageContext = {
  projectId: "p1",
  inbox: true,
  settings: "project",
  issueId: "i1",
  issueIdentifier: "MIN-42",
  issueTitle: "Un ticket",
  objectiveId: "o1",
  objectiveName: "Un objectif",
  feedbackId: "f1",
  feedbackTitle: "Un retour",
  routineId: "r1",
  routineTitle: "Audit sécurité",
  viewId: "v1",
  viewName: "Une vue",
  cycleId: "c1",
  cycleLabel: "6–19 juil",
};

describe("contextChips — routine", () => {
  it("uses the open routine title", () => {
    const chips = contextChips(
      { projectId: "p1", routineId: "r1", routineTitle: "Audit sécurité" },
      { t },
    );
    const routine = chips.find((c) => c.key === "routine");
    expect(routine).toMatchObject({ kind: "routine", label: "Audit sécurité" });
  });

  it("falls back to a generic label when the title is missing", () => {
    const chips = contextChips({ routineId: "r1" }, { t });
    expect(chips.find((c) => c.key === "routine")?.label).toBe(
      "contextRoutine",
    );
  });

  it("does not add a routine chip without an open routine", () => {
    const chips = contextChips({ projectId: "p1" }, { t });
    expect(chips.some((c) => c.key === "routine")).toBe(false);
  });
});

describe("applyContextSelection", () => {
  it("removes both the routine id and title", () => {
    const sent = applyContextSelection(everything, new Set(["routine"]));
    expect(sent?.routineId).toBeUndefined();
    expect(sent?.routineTitle).toBeUndefined();
    // The rest does not change: one extinguished pill does not extinguish others.
    expect(sent?.feedbackId).toBe("f1");
    expect(sent?.issueId).toBe("i1");
  });

  it("keeps the routine while its pill is lit", () => {
    const sent = applyContextSelection(everything, new Set(["feedback"]));
    expect(sent?.routineId).toBe("r1");
  });

  /**
   * The safeguard: EACH ambient pill must have something to extinguish. A
   * nature added without its entry in the table would pass all the
   * tests above and fail here.
   */
  it("actually turns off each pill in a complete context", () => {
    for (const chip of contextChips(everything, { t })) {
      const sent = applyContextSelection(everything, new Set([chip.key]));
      const before = Object.keys(everything).length;
      const after = Object.keys(sent ?? {}).filter(
        (k) => (sent as Record<string, unknown>)[k] !== undefined,
      ).length;
      expect(
        after,
        `the “${chip.key}” chip does not remove a field from the sent context`,
      ).toBeLessThan(before);
    }
  });
});

describe("contextChips — inbox", () => {
  it("renders and removes the ambient inbox context", () => {
    const chips = contextChips({ inbox: true }, { t });
    expect(chips).toContainEqual(
      expect.objectContaining({
        key: "inbox",
        kind: "inbox",
        label: "contextInbox",
      }),
    );
    expect(
      applyContextSelection({ inbox: true }, new Set(["inbox"])),
    ).toBeNull();
  });
});

describe("contextChips — settings", () => {
  it("distinguishes account settings from project settings", () => {
    expect(contextChips({ settings: "account" }, { t })).toContainEqual(
      expect.objectContaining({
        key: "settings",
        kind: "settings",
        label: "contextAccountSettings",
      }),
    );
    expect(
      contextChips({ projectId: "p1", settings: "project" }, { t }),
    ).toContainEqual(
      expect.objectContaining({
        key: "settings",
        kind: "settings",
        label: "contextProjectSettings",
      }),
    );
  });

  it("removes the settings surface when its chip is disabled", () => {
    expect(
      applyContextSelection({ settings: "account" }, new Set(["settings"])),
    ).toBeNull();
  });
});

describe("contextChips — page icons", () => {
  it("uses the ambient page emoji when one is available", () => {
    const chips = contextChips(
      {
        projectId: "p1",
        pageId: "page-1",
        pageTitle: "Launch guide",
        pageIcon: "🚀",
      },
      { t },
    );

    expect(chips.find((chip) => chip.kind === "page")).toMatchObject({
      label: "Launch guide",
      icon: "🚀",
    });
  });

  it("preserves the emoji of a manually pinned page", () => {
    const chips = contextChips(
      {
        pinned: [
          { kind: "page", id: "page-1", label: "Launch guide", icon: "🚀" },
        ],
      },
      { t },
    );

    expect(chips.find((chip) => chip.kind === "page")).toMatchObject({
      label: "Launch guide",
      icon: "🚀",
      pinned: true,
    });
  });
});
