import { describe, expect, it } from "vitest";

import { issueRefFromPr, parseIssueRef, parsePullRequestRef } from "./pr-ingest-core";

/**
 * MIN-143 — PR ↔ issue linking is the only logic here that truly merits a
 * unit test: it decides whether a human PR finds its issue and, above all,
 * whether it finds one that is NOT its own.
 */

const KEYS = ["MIN"];

describe("issueRefFromPr", () => {
  it("reads the branch of a Numo run", () => {
    expect(
      issueRefFromPr({ projectKeys: KEYS, branch: "minddy/agent/min-42-abc" }),
    ).toBe("MIN-42");
  });

  it("reads a human branch", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "feature/MIN-42" })).toBe("MIN-42");
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "MIN-42" })).toBe("MIN-42");
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "fix/min-42-crash" })).toBe("MIN-42");
  });

  it("reads the title", () => {
    expect(
      issueRefFromPr({ projectKeys: KEYS, title: "MIN-42 — rassembler les PR" }),
    ).toBe("MIN-42");
    expect(
      issueRefFromPr({ projectKeys: KEYS, title: "Corrige le tri (MIN-7)" }),
    ).toBe("MIN-7");
  });

  it("reads a closing line in the body", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, body: "Fixes MIN-42" })).toBe("MIN-42");
    expect(
      issueRefFromPr({ projectKeys: KEYS, body: "Du contexte.\n\nCloses: MIN-9\n" }),
    ).toBe("MIN-9");
    expect(issueRefFromPr({ projectKeys: KEYS, body: "resolved min-3" })).toBe("MIN-3");
  });

  it("ignores the body OUTSIDE a closing line: a mention is not a link", () => {
    expect(
      issueRefFromPr({ projectKeys: KEYS, body: "Même approche que dans MIN-12." }),
    ).toBeNull();
  });

  it("normalizes case to match the project key", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-42" })).toBe("MIN-42");
    expect(issueRefFromPr({ projectKeys: ["mind"], title: "MIND-8 titre" })).toBe("mind-8");
  });

  it("prefers the branch over the title, and the title over the body", () => {
    expect(
      issueRefFromPr({
        projectKeys: KEYS,
        branch: "min-1-a",
        title: "MIN-2 quelque chose",
        body: "Fixes MIN-3",
      }),
    ).toBe("MIN-1");
    expect(
      issueRefFromPr({ projectKeys: KEYS, title: "MIN-2 quelque chose", body: "Fixes MIN-3" }),
    ).toBe("MIN-2");
  });

  it("rejects a reference glued inside a word", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, title: "ADMIN-42 sur la page" })).toBeNull();
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "feature/xmin-42" })).toBeNull();
  });

  it("rejects a longer number: MIN-421 is not MIN-42", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-421" })).toBe("MIN-421");
    expect(issueRefFromPr({ projectKeys: KEYS, title: "MIN-42x" })).toBeNull();
  });

  it("rejects the key of a project that does not link this repository", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "feature/ACME-42" })).toBeNull();
    expect(
      issueRefFromPr({ projectKeys: ["MIN", "ACME"], branch: "feature/ACME-42" }),
    ).toBe("ACME-42");
  });

  it("returns null without a key, text or reference", () => {
    expect(issueRefFromPr({ projectKeys: [], branch: "min-42" })).toBeNull();
    expect(issueRefFromPr({ projectKeys: KEYS })).toBeNull();
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "chore/bump-deps" })).toBeNull();
  });

  it("rejects number zero", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-0" })).toBeNull();
  });

  it("normalizes a number with leading zeros", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-007" })).toBe("MIN-7");
  });
});

describe("parseIssueRef", () => {
  it("splits the key from the number", () => {
    expect(parseIssueRef("MIN-42")).toEqual({ key: "MIN", number: 42 });
    // A key can itself contain a hyphen: the LAST one is the separator.
    expect(parseIssueRef("A-B-7")).toEqual({ key: "A-B", number: 7 });
  });

  it("returns null for a malformed reference", () => {
    expect(parseIssueRef("MIN")).toBeNull();
    expect(parseIssueRef("-42")).toBeNull();
    expect(parseIssueRef("MIN-abc")).toBeNull();
  });
});

/**
 * The hand-written PR reference (MCP + Numo): it turns “link PR #42” into a
 * `pull_requests` row. What it REJECTS matters as much as what it accepts: an
 * unrelated URL mistaken for a PR would silently attach an object that has
 * nothing to do with the issue.
 */
describe("parsePullRequestRef", () => {
  it("reads a number, bare or prefixed", () => {
    expect(parsePullRequestRef(42)).toBe(42);
    expect(parsePullRequestRef("42")).toBe(42);
    expect(parsePullRequestRef("  42 ")).toBe(42);
    expect(parsePullRequestRef("#42")).toBe(42);
    // `!42` is the syntax for GitLab merge requests.
    expect(parsePullRequestRef("!42")).toBe(42);
  });

  it("reads a forge URL, GitHub and GitLab alike", () => {
    expect(parsePullRequestRef("https://github.com/mangue-dev/minddy/pull/42")).toBe(42);
    expect(parsePullRequestRef("https://github.com/o/r/pull/42/files")).toBe(42);
    expect(parsePullRequestRef("https://github.com/o/r/pull/42#discussion_r1")).toBe(42);
    expect(parsePullRequestRef("https://gitlab.com/g/p/-/merge_requests/7")).toBe(7);
  });

  it("rejects a URL that does not point to a pull request", () => {
    // Both numberings coexist in a GitHub repository: issue 42 and PR 42 are
    // two different objects.
    expect(parsePullRequestRef("https://github.com/o/r/issues/42")).toBeNull();
    expect(parsePullRequestRef("https://github.com/o/r")).toBeNull();
  });

  it("rejects anything that is not a reference", () => {
    expect(parsePullRequestRef(null)).toBeNull();
    expect(parsePullRequestRef(undefined)).toBeNull();
    expect(parsePullRequestRef("")).toBeNull();
    expect(parsePullRequestRef("   ")).toBeNull();
    expect(parsePullRequestRef("MIN-42")).toBeNull();
    expect(parsePullRequestRef("PR 42")).toBeNull();
    expect(parsePullRequestRef(0)).toBeNull();
    expect(parsePullRequestRef(-1)).toBeNull();
    expect(parsePullRequestRef(4.2)).toBeNull();
  });
});
