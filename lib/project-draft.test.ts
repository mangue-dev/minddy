import { describe, expect, it } from "vitest";
import {
  draftIconUrl,
  draftOrbSeed,
  projectDraftFromRow,
  projectDraftToRow,
  stepIndexOf,
  stepsFor,
  type ProjectDraftInput,
} from "./project-draft";

const draft: ProjectDraftInput = {
  id: "11111111-1111-4111-8111-111111111111",
  orbSeed: null,
  name: "Comète",
  key: "COM",
  keyTouched: true,
  step: "git",
  origin: "new",
  seed: { kind: "brief", text: "un board pour l'équipe" },
  icon: { kind: "site", previewUrl: "https://x.test/f.png", siteUrl: "https://x.test" },
  repo: {
    connectionId: "c1",
    provider: "github",
    externalRepoId: "42",
    fullName: "mangue-dev/comete",
  },
  smartAssignEnabled: false,
  autoAssignEnabled: true,
};

/** What the route returns for this draft. */
const rowFor = (input: ProjectDraftInput) => ({
  ...projectDraftToRow(input),
  updated_at: "2026-08-04T10:00:00Z",
});

describe("projectDraftFromRow / projectDraftToRow", () => {
  it("returns exactly what was stored", () => {
    // The table contract: two columns read (name, step), everything else in
    // jsonb. A field that does not enter is a field that the recovery loses — without
    // report nothing, since the wizard reopens anyway.
    const back = projectDraftFromRow(rowFor(draft));
    expect(back).toEqual({ ...draft, updatedAt: "2026-08-04T10:00:00Z" });
  });

  it("falls back to safe defaults when `data` is empty", () => {
    // A draft written by a previous version of the wizard: the project is worth
    // better without an icon or primer than a wizard which crashes when reopening it.
    const back = projectDraftFromRow({
      id: draft.id,
      name: "Comète",
      step: "icon",
      data: {},
      updated_at: "2026-08-04T10:00:00Z",
    });
    expect(back.key).toBe("");
    expect(back.origin).toBeNull();
    expect(back.seed).toBeNull();
    expect(back.icon).toEqual({ kind: "none" });
    expect(back.repo).toBeNull();
    // Never restarted: the draft orb remains that of its id, and the project
    // created will keep the same — it's the wizard preview that promised it.
    expect(back.orbSeed).toBeNull();
    // Smart Assign is proposed ACTIVATED by the wizard: a silent draft must
    // fall back on this default, not on `false`.
    expect(back.smartAssignEnabled).toBe(true);
    expect(back.autoAssignEnabled).toBe(false);
  });

  it("rejects a step it does not know", () => {
    const back = projectDraftFromRow({
      ...rowFor(draft),
      step: "une-étape-supprimée-depuis",
    });
    expect(back.step).toBe("project");
  });

  it("rejects a half-written draft instead of replaying it", () => {
    // An incomplete `repo` would lead to a `bindGitRepoApi` without a connection id,
    // after project creation — the exact place where we don't want failure.
    const back = projectDraftFromRow({
      ...rowFor(draft),
      data: { ...projectDraftToRow(draft).data, repo: { fullName: "x/y" } },
    });
    expect(back.repo).toBeNull();
  });
});

describe("stepIndexOf", () => {
  it("reopens at the stored step", () => {
    expect(stepIndexOf({ ...draft, step: "seed", updatedAt: "" })).toBe(
      stepsFor("new").indexOf("seed"),
    );
  });

  it("falls back to the beginning when the step is not in this flow", () => {
    // Without an origin, the seed does not exist: a bare `indexOf` would return -1, and the
    // wizard would reopen on the last step (upper limit of `WizardDialog`).
    expect(stepIndexOf({ ...draft, origin: null, step: "seed", updatedAt: "" })).toBe(0);
  });
});

describe("draftIconUrl", () => {
  it("rend l'aperçu choisi, ou rien", () => {
    expect(draftIconUrl({ ...draft, updatedAt: "" })).toBe("https://x.test/f.png");
    expect(
      draftIconUrl({ ...draft, icon: { kind: "none" }, updatedAt: "" }),
    ).toBeNull();
  });
});

describe("draftOrbSeed", () => {
  it("falls back to the draft id until the seed has been rerun", () => {
    expect(draftOrbSeed({ ...draft, updatedAt: "" })).toBe(draft.id);
  });

  it("uses the rerun seed and preserves it through a database round trip", () => {
    // The point of the test: the wizard shows an orb BEFORE the project exists.
    // If the seed does not cross the draft table, resume the
    // draft would render a color other than the one we had chosen.
    const rerolled = { ...draft, orbSeed: "33333333-3333-4333-8333-333333333333" };
    expect(draftOrbSeed({ ...rerolled, updatedAt: "" })).toBe(rerolled.orbSeed);
    expect(projectDraftFromRow(rowFor(rerolled)).orbSeed).toBe(rerolled.orbSeed);
  });
});
