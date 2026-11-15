import { describe, expect, it } from "vitest";
import { projectPath } from "@/lib/app-urls";
import {
  PROJECT_NAV_TABS,
  projectIdFromNavKey,
  projectNavEntries,
  projectNavKey,
  type ProjectNavLocation,
} from "./project-nav-model";

const P = "9e3d0c35-1111-4222-8333-444455556666";
const OTHER = "0a1b2c3d-1111-4222-8333-444455556666";
const base = projectPath(P);

const at = (pathname: string, overrides: Partial<ProjectNavLocation> = {}): ProjectNavLocation => ({
  pathname,
  currentProjectId: P,
  objectiveBoardId: null,
  ...overrides,
});

const activeKeys = (projectId: string, location: ProjectNavLocation) =>
  projectNavEntries(projectId, location, undefined).filter((entry) => entry.active).map((entry) => entry.key);

describe("project navigation model", () => {
  it("lists every project screen once, in sidebar order, each linking to its own tab", () => {
    const entries = projectNavEntries(P, at(base), undefined);
    expect(entries.map((entry) => entry.key)).toEqual(["tickets", "objectives", "pages", "triage", "feedback", "settings"]);
    expect(entries.map((entry) => entry.href)).toEqual([
      base,
      projectPath(P, "objectives"),
      projectPath(P, "pages"),
      projectPath(P, "triage"),
      projectPath(P, "feedback"),
      projectPath(P, "settings"),
    ]);
    expect(new Set(PROJECT_NAV_TABS.map((tab) => tab.shortcut)).size).toBe(PROJECT_NAV_TABS.length);
    expect(entries.filter((entry) => !entry.descends).map((entry) => entry.key)).toEqual(["tickets"]);
  });

  it("marks exactly the screen on display", () => {
    expect(activeKeys(P, at(base))).toEqual(["tickets"]);
    expect(activeKeys(P, at(`${base}/objectives`))).toEqual(["objectives"]);
    expect(activeKeys(P, at(`${base}/pages/82a6b365`))).toEqual(["pages"]);
    expect(activeKeys(P, at(`${base}/settings`))).toEqual(["settings"]);
    expect(activeKeys(OTHER, at(base))).toEqual([]);
  });

  it("gives a board filtered by an objective to Objectives, in that project only", () => {
    const objectiveBoard = at(base, { objectiveBoardId: "obj-1" });
    expect(activeKeys(P, objectiveBoard)).toEqual(["objectives"]);
    // The phone sheet builds every project's panel: another project's
    // Objectives must not light up from this project's filtered board.
    expect(activeKeys(OTHER, objectiveBoard)).toEqual([]);
  });

  it("splits the project's triage count into its Triage and Feedback badges", () => {
    const entries = projectNavEntries(P, at(base), { triage: 3, feedback: 2 });
    const badges = Object.fromEntries(entries.filter((entry) => entry.badge).map((entry) => [entry.key, entry.badge]));
    expect(badges).toEqual({
      triage: { count: 3, labelKey: "triageBadge" },
      feedback: { count: 2, labelKey: "feedbackBadge" },
    });
  });

  it("shows no badge for an empty queue or before the counts load", () => {
    expect(projectNavEntries(P, at(base), { triage: 0, feedback: 0 }).some((entry) => entry.badge)).toBe(false);
    expect(projectNavEntries(P, at(base), undefined).some((entry) => entry.badge)).toBe(false);
  });

  it("reads a project back from its home-panel row key, and nothing from other rows", () => {
    expect(projectIdFromNavKey(projectNavKey(P))).toBe(P);
    expect(projectIdFromNavKey("routines")).toBeNull();
    expect(projectIdFromNavKey("home-back")).toBeNull();
  });
});
