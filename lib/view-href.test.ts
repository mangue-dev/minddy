import { describe, expect, it } from "vitest";
import { buildViewHref } from "./view-href";

/**
 * The address that reopens a screen. Everything depends on what we KEEP and
 * what we REMOVE: the address retains the screen, not the dialog placed in
 * front of it.
 */

describe("buildViewHref", () => {
  it("keeps the bare route when there is no query", () => {
    expect(buildViewHref("/projects/p1", "")).toBe("/projects/p1");
    expect(buildViewHref("/home", "?")).toBe("/home");
  });

  it("keeps what describes the screen: tab, view, open objective", () => {
    expect(buildViewHref("/routines", "?routine=r1")).toBe(
      "/routines?routine=r1"
    );
    expect(buildViewHref("/all", "?view=cycle")).toBe("/all?view=cycle");
    expect(
      buildViewHref("/projects/p1/objectives", "?open=o1")
    ).toBe("/projects/p1/objectives?open=o1");
    expect(buildViewHref("/settings", "?tab=notifications")).toBe(
      "/settings?tab=notifications"
    );
  });

  it("drops an issue's side panel: it is an overlay", () => {
    expect(buildViewHref("/projects/p1", "?issue=i1")).toBe("/projects/p1");
    // …without dropping what surrounds it.
    expect(buildViewHref("/projects/p1", "?view=v1&issue=i1")).toBe(
      "/projects/p1?view=v1"
    );
  });

  it("drops dialogs and single-use instructions", () => {
    expect(buildViewHref("/projects/p1", "?new=issue")).toBe("/projects/p1");
    expect(buildViewHref("/projects/p1", "?setup=import")).toBe("/projects/p1");
    expect(buildViewHref("/billing", "?billing=success")).toBe("/billing");
  });

  it("accepts the query with or without its question mark", () => {
    expect(buildViewHref("/all", "view=v1")).toBe("/all?view=v1");
    expect(buildViewHref("/all", "?view=v1")).toBe("/all?view=v1");
  });

  it("adds what the page publishes, and `null` removes", () => {
    expect(buildViewHref("/projects/p1", "?objective=o1", { view: "v2" })).toBe(
      "/projects/p1?objective=o1&view=v2"
    );
    // The page overwrites the parameter already there rather than adding a second one.
    expect(buildViewHref("/all", "?view=v1", { view: "cycle" })).toBe(
      "/all?view=cycle"
    );
    // No selection → no parameter (and not an empty `?open=`).
    expect(
      buildViewHref("/projects/p1/objectives", "?open=o1", { open: null })
    ).toBe("/projects/p1/objectives");
    expect(buildViewHref("/pull-requests", "", { pr: "" })).toBe("/pull-requests");
  });

  it("encodes published values", () => {
    expect(buildViewHref("/routines", "", { routine: "a b&c" })).toBe(
      "/routines?routine=a+b%26c"
    );
  });
});
