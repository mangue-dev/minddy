import { afterEach, describe, expect, it } from "vitest";
import {
  issueHref,
  objectiveHref,
  pagePath,
  projectPath,
  projectSegmentCode,
  resolveIssueRef,
  resolveProjectSegment,
  resolveRef,
  routineHref,
  shortenLegacyAppUrl,
} from "./app-urls";
import { expandParam, expandProjectSegment, registerRecordIds, resetRefRegistry } from "./ref-registry";

const PROJECT = "3f2a9c81-1d2e-4c3b-9a8f-0123456789ab";
const OTHER = "3f2a9c81-ffff-4c3b-9a8f-0123456789ab";
const PAGE = "8b1e04aa-0000-4000-8000-000000000001";

describe("readable application URLs", () => {
  afterEach(resetRefRegistry);

  it("addresses a project by its key and short code, never its name", () => {
    expect(projectPath({ id: PROJECT, key: "MIN" })).toBe("/projects/min-3f2a9c81");
    expect(projectPath({ id: PROJECT, key: "MIN" }, "objectives")).toBe(
      "/projects/min-3f2a9c81/objectives",
    );
    expect(pagePath({ id: PROJECT, key: "MIN" }, PAGE)).toBe("/projects/min-3f2a9c81/pages/8b1e04aa");
    // Without a known key the bare code is still a valid address.
    expect(projectPath(PROJECT)).toBe("/projects/3f2a9c81");
  });

  it("reads the key of a loaded project when given a bare id", () => {
    registerRecordIds([{ id: PROJECT, key: "MIN", owner_id: "u", name: "Minddy" }]);
    expect(objectiveHref(PROJECT, PAGE)).toBe("/projects/min-3f2a9c81/objectives?open=8b1e04aa");
    expect(issueHref(PROJECT, { id: PAGE, number: 42, project_id: PROJECT })).toBe(
      "/projects/min-3f2a9c81?issue=MIN-42",
    );
    expect(routineHref(PAGE)).toBe("/routines?routine=8b1e04aa");
  });

  it("tells two projects sharing a key apart by their code", () => {
    const projects = [
      { id: PROJECT, key: "MIN" },
      { id: "7b11c0de-0000-4000-8000-000000000001", key: "MIN" },
    ];
    expect(resolveProjectSegment("min-7b11c0de", projects)?.id).toBe(projects[1].id);
    // The key is decorative: a renamed key keeps resolving.
    expect(resolveProjectSegment("old-3f2a9c81", projects)?.id).toBe(PROJECT);
    expect(projectSegmentCode(PROJECT)).toBe(PROJECT);
  });

  it("resolves nothing rather than the wrong record when a code is ambiguous", () => {
    expect(resolveRef("3f2a9c81", [{ id: PROJECT }, { id: OTHER }])).toBeUndefined();
    expect(resolveRef(OTHER, [{ id: PROJECT }, { id: OTHER }])?.id).toBe(OTHER);
  });

  it("resolves an issue by identifier, short code or legacy id", () => {
    registerRecordIds([
      { id: PROJECT, key: "MIN", owner_id: "u" },
      { id: OTHER, key: "WEB", owner_id: "u" },
    ]);
    const issues = [
      { id: PAGE, number: 42, project_id: PROJECT },
      { id: "9c000000-0000-4000-8000-000000000001", number: 42, project_id: OTHER },
    ];
    expect(resolveIssueRef("MIN-42", issues)?.id).toBe(PAGE);
    expect(resolveIssueRef("web-42", issues)?.id).toBe(issues[1].id);
    expect(resolveIssueRef("8b1e04aa", issues)?.id).toBe(PAGE);
    expect(resolveIssueRef(PAGE, issues)?.id).toBe(PAGE);
  });

  it("moves legacy URLs to short codes and leaves readable ones alone", () => {
    expect(shortenLegacyAppUrl(`/projects/${PROJECT}/pages/${PAGE}`, "")).toBe(
      "/projects/3f2a9c81/pages/8b1e04aa",
    );
    expect(shortenLegacyAppUrl(`/projects/${PROJECT}`, `?issue=${PAGE}&tab=x`)).toBe(
      "/projects/3f2a9c81?issue=8b1e04aa&tab=x",
    );
    expect(shortenLegacyAppUrl("/projects/min-3f2a9c81", "?issue=MIN-42")).toBeNull();
  });
});

describe("short code registry", () => {
  afterEach(resetRefRegistry);

  it("expands a code only once its record is loaded", () => {
    expect(expandParam("8b1e04aa")).toBe("8b1e04aa");
    expect(expandProjectSegment("min-3f2a9c81")).toBeNull();
    registerRecordIds({ pages: [{ id: PAGE }], projects: [{ id: PROJECT }] });
    expect(expandParam("8b1e04aa")).toBe(PAGE);
    expect(expandProjectSegment("min-3f2a9c81")).toBe(PROJECT);
  });

  it("keeps an ambiguous code unexpanded", () => {
    registerRecordIds([{ id: PROJECT }, { id: OTHER }]);
    expect(expandProjectSegment("min-3f2a9c81")).toBeNull();
    expect(expandProjectSegment(`${OTHER}`)).toBe(OTHER);
  });
});
