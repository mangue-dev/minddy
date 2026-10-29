import { describe, expect, it } from "vitest";
import {
  applyContextSelection,
  contextChips,
  SELECTION_CHIP_KEY,
} from "./assistant-context";
import { MAX_SELECTION_LENGTH, normalizeSelectionText } from "./assistant-selection";
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
  pullRequestId: "pr1",
  prNumber: 42,
  prState: "open",
  prHeadRef: "feature/min-42",
  prBaseRef: "main",
  prRunId: "run1",
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
  selection: { text: "A passage selected in the page" },
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

  it("removes every selected pull request field together", () => {
    const sent = applyContextSelection(
      everything,
      new Set(["pull_request"]),
    );
    expect(sent?.pullRequestId).toBeUndefined();
    expect(sent?.prNumber).toBeUndefined();
    expect(sent?.prState).toBeUndefined();
    expect(sent?.prHeadRef).toBeUndefined();
    expect(sent?.prBaseRef).toBeUndefined();
    expect(sent?.prRunId).toBeUndefined();
    expect(sent?.issueId).toBe("i1");
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

describe("contextChips — quoted selection", () => {
  // Renders the values too: the excerpt is the point of this pill.
  const render = ((key: string, values?: Record<string, string>) =>
    `${key}:${values?.excerpt ?? values?.text ?? ""}`) as unknown as Parameters<
    typeof contextChips
  >[1]["t"];

  it("labels the pill with a one-line excerpt and keeps the passage in its tooltip", () => {
    const text = "First line of a long passage\nthat continues well beyond the excerpt length";
    const chip = contextChips(
      { pageId: "page-1", pageTitle: "Spec", selection: { text } },
      { t: render },
    ).find((item) => item.key === SELECTION_CHIP_KEY);

    expect(chip).toMatchObject({ kind: "selection", removable: true });
    expect(chip?.pinned).toBeUndefined();
    expect(chip?.label).toBe("contextSelection:First line of a long passage that contin…");
    expect(chip?.tooltip).toBe(`contextSelectionTooltip:${text}`);
  });

  it("removes only the selection and keeps the page it was taken from", () => {
    const ctx: AssistantPageContext = {
      pageId: "page-1",
      pageTitle: "Spec",
      selection: { text: "Passage" },
    };
    expect(applyContextSelection(ctx, new Set([SELECTION_CHIP_KEY]))).toEqual({
      pageId: "page-1",
      pageTitle: "Spec",
    });
  });

  it("shows no pill for a blank selection", () => {
    const chips = contextChips({ selection: { text: "   " } }, { t });
    expect(chips.some((chip) => chip.key === SELECTION_CHIP_KEY)).toBe(false);
  });
});

describe("normalizeSelectionText", () => {
  it("caps a long passage with an ellipsis and keeps its line breaks", () => {
    const text = normalizeSelectionText(`  a\r\nb\u0007 ${"x".repeat(MAX_SELECTION_LENGTH)}`);
    expect(text?.startsWith("a\nb ")).toBe(true);
    expect(text?.endsWith("…")).toBe(true);
    expect(text!.length).toBe(MAX_SELECTION_LENGTH + 1);
  });

  it("rejects what is not a non-blank string", () => {
    expect(normalizeSelectionText(42)).toBeNull();
    expect(normalizeSelectionText(" \n ")).toBeNull();
  });
});
