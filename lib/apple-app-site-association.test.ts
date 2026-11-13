import { describe, expect, it } from "vitest";

import { GET } from "@/app/.well-known/apple-app-site-association/route";
import {
  EXCLUDED_PREFIXES,
  IOS_APP_ID,
  appleAppSiteAssociation,
} from "@/lib/apple-app-site-association";
import { PROTECTED_PREFIXES } from "@/lib/protected-prefixes";

type Component = { "/": string; "?"?: Record<string, string>; exclude?: boolean };

/** Apple's pattern syntax: `*` is any run of characters, `?` exactly one. */
function patternMatches(pattern: string, value: string): boolean {
  const source = pattern
    .split("")
    .map((char) => (char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.+^${}()|[\]\\/]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`, "s").test(value);
}

/**
 * Whether iOS opens `link` in the app: the first component whose path and
 * query items all match decides, and an absent query item reads as empty.
 */
function opensInApp(link: string): boolean {
  const url = new URL(link, "https://www.minddy.app");
  const components = appleAppSiteAssociation().applinks.details[0].components as Component[];
  for (const component of components) {
    if (!patternMatches(component["/"], url.pathname)) continue;
    const query = component["?"] ?? {};
    const queryMatches = Object.entries(query).every(([name, pattern]) =>
      patternMatches(pattern, url.searchParams.get(name) ?? ""),
    );
    if (!queryMatches) continue;
    return !component.exclude;
  }
  return false;
}

describe("GET /.well-known/apple-app-site-association", () => {
  it("serves JSON for the iOS app without a redirect", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Location")).toBeNull();
    const body = await response.json();
    expect(body.applinks.details).toHaveLength(1);
    expect(body.applinks.details[0].appIDs).toEqual([IOS_APP_ID]);
  });
});

describe("universal links of the iOS app", () => {
  it.each([
    "/home",
    "/inbox",
    "/all?view=my",
    "/my",
    "/projects/min-3f2a9c81",
    "/projects/min-3f2a9c81?issue=MIN-42",
    "/projects/min-3f2a9c81/pages/8b1e04aa",
    "/projects/min-3f2a9c81/objectives?open=8b1e04aa",
    "/projects/min-3f2a9c81/feedback?post=8b1e04aa",
    "/routines?routine=8b1e04aa",
    "/pull-requests?pr=8b1e04aa",
    "/settings",
    "/numo",
  ])("opens the product screen %s in the app", (path) => {
    expect(opensInApp(path)).toBe(true);
  });

  it.each([
    "/auth/callback?token_hash=abc&type=signup&next=/auth/confirmed",
    "/auth/callback?token_hash=abc&type=recovery&next=/reset-password",
    "/signup?invite=tok_123",
  ])("opens the e-mail link %s in the app", (path) => {
    expect(opensInApp(path)).toBe(true);
  });

  it.each([
    ["/", "the public site"],
    ["/fr", "a localized public page"],
    ["/pricing", "a public page"],
    ["/docs", "the manual"],
    ["/api/health", "an API endpoint"],
    ["/share/tok", "a public view link"],
    ["/f/tok", "a public feedback board"],
    ["/p/tok", "a published page"],
    ["/billing", "billing"],
    ["/billing?plan=pro", "billing with a plan"],
    ["/oauth/consent?client_id=x", "MCP consent"],
    ["/connect/github", "the forge-relay claim"],
    ["/admin", "the operator console"],
    ["/projects/min-3f2a9c81/pages-print/8b1e04aa", "the print layout"],
    ["/auth/callback?code=abc", "an OAuth return"],
    ["/auth/callback?desktop=1&code=abc&turn=n", "a desktop OAuth round"],
    ["/auth/callback?desktop=1&token_hash=abc&type=signup", "a desktop e-mail link"],
    ["/auth/callback?desktop=1?token_hash=abc&type=signup", "a desktop e-mail link as GoTrue composes it"],
    ["/auth/confirm", "the confirmation step, reached by redirect"],
    ["/signup", "the sign-up page without an invitation"],
    ["/login", "the sign-in page"],
    ["/.well-known/apple-app-site-association", "this file"],
  ])("leaves %s (%s) in the browser", (path) => {
    expect(opensInApp(path)).toBe(false);
  });

  it("excludes only prefixes the product still serves", () => {
    for (const prefix of Object.keys(EXCLUDED_PREFIXES)) {
      expect(PROTECTED_PREFIXES).toContain(prefix);
    }
  });
});
