import { describe, expect, it } from "vitest";

import {
  buildDictatePrompt,
  smartFillFields,
  updateDraftTool,
} from "@/app/api/projects/[id]/dictate-issue/route";

/**
 * UNDER SMART FILL, DICTATION SETS ITS PROPERTIES ONLY ON REQUEST (MIN-260,
 * MIN-816).
 *
 * Smart Fill only fills what is still empty, so a dictation that set priority,
 * effort, categories, objective or (when Smart Fill writes it) the title would
 * silently win over the automation the user armed. But "the objective is
 * Onboarding" is an explicit request dictation must honor, so the fields stay
 * in the schema and the restriction lives in their descriptions and in the
 * prompt. None of this shows on screen, hence this test.
 */

const SMART_FILLED = ["priority", "effort", "objective_id", "category_ids"];
const ALL_FIELDS = [
  ...SMART_FILLED,
  "title",
  "description",
  "status",
  "assignee_id",
  "due_date",
];
const NOTE = "ONLY when the user explicitly asks";

type Property = { description?: string };

function properties(smartFill: boolean, smartFillTitle = false): Record<string, Property> {
  return updateDraftTool(smartFill, smartFillTitle).function.parameters
    .properties as Record<string, Property>;
}

function prompt(options: {
  smartFill: boolean;
  smartFillTitle?: boolean;
  mode?: "create" | "edit";
}): string {
  return buildDictatePrompt({
    ctx: {
      id: "p1",
      name: "Aurora",
      key: "AUR",
      statusCounts: {},
      recentIssues: [],
      members: [],
      objectives: [],
      categories: [],
    },
    draft: {
      title: "",
      description: "",
      status: "backlog",
      priority: "none",
      effort: null,
      assignee_id: null,
      objective_id: null,
      due_date: null,
      category_ids: [],
    },
    mode: options.mode ?? "create",
    locale: "en",
    userId: "u1",
    timeZone: "UTC",
    smartFill: options.smartFill,
    smartFillTitle: options.smartFillTitle,
  });
}

describe("smartFillFields", () => {
  it("reserves nothing without Smart Fill, even if the title preference is on", () => {
    expect(smartFillFields(false, true)).toEqual([]);
  });

  it("reserves the title only when Smart Fill writes it", () => {
    expect(smartFillFields(true, false)).toEqual(SMART_FILLED);
    expect(smartFillFields(true, true)).toEqual(["title", ...SMART_FILLED]);
  });
});

describe("updateDraftTool", () => {
  it("offers every field, with or without Smart Fill, so an explicit request can be honored", () => {
    for (const smartFill of [false, true]) {
      const keys = Object.keys(properties(smartFill, true));
      for (const field of ALL_FIELDS) expect(keys).toContain(field);
    }
  });

  it("marks the Smart Fill fields as explicit-request only when Smart Fill is armed", () => {
    const props = properties(true, true);
    for (const field of ["title", ...SMART_FILLED])
      expect(props[field].description).toContain(NOTE);
    for (const field of ["description", "status", "assignee_id", "due_date"])
      expect(props[field].description ?? "").not.toContain(NOTE);
  });

  it("leaves the title to dictation when Smart Fill does not write it", () => {
    expect(properties(true, false).title.description).not.toContain(NOTE);
  });

  it("does not mutate the shared tool — two consecutive dictations, two correct schemas", () => {
    // `updateDraftTool` starts from a module constant: annotating it in place
    // would restrict every later dictation in the process, including those of
    // users without Smart Fill.
    updateDraftTool(true, true);
    for (const field of ALL_FIELDS)
      expect(properties(false)[field]?.description ?? "").not.toContain(NOTE);
  });
});

describe("buildDictatePrompt", () => {
  it("still asks for a title and estimated priority and effort without Smart Fill", () => {
    const text = prompt({ smartFill: false });
    expect(text).toContain("a concise title");
    expect(text).toContain("ALWAYS set priority AND effort");
    expect(text).not.toContain("Smart Fill is armed");
  });

  it("leaves the Smart Fill fields alone unless explicitly asked when Smart Fill is armed", () => {
    const text = prompt({ smartFill: true, smartFillTitle: true });
    expect(text).toContain(
      "it sets the title, priority, effort, objective, categories itself",
    );
    expect(text).toContain("UNLESS the user explicitly asks");
    expect(text).not.toContain("a concise title");
    expect(text).not.toContain("ALWAYS set priority AND effort");
  });

  it("keeps the title with dictation when Smart Fill does not write it", () => {
    const text = prompt({ smartFill: true, smartFillTitle: false });
    expect(text).toContain("a concise title");
    expect(text).toContain("it sets the priority, effort, objective, categories itself");
  });
});
