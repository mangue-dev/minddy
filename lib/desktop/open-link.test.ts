import { describe, expect, it } from "vitest";
import { buildDesktopOpenUrl, parseDesktopOpenLink } from "./open-link";
import { billingReturnUrl } from "./return-url";
import { parseDesktopAuthLink } from "./auth-link";

/** The complete round trip: what the bounce page emits, what the app rereads. */
function roundTrip(next: string): string | null {
  return parseDesktopOpenLink(buildDesktopOpenUrl(next));
}

describe("buildDesktopOpenUrl", () => {
  it("emits our scheme on the `open` host", () => {
    expect(buildDesktopOpenUrl("/billing")).toBe("minddy://open?next=%2Fbilling");
  });

  it("garde la query de la destination — c'est elle qui dit le résultat", () => {
    expect(roundTrip("/billing?billing=success")).toBe("/billing?billing=success");
  });

  it("reduces an external destination to the internal fallback", () => {
    // macOS delivers to the app EVERYTHING that carries our schema, including what we
    // has never emitted: an absolute destination would be a window that a third party
    // points where he wants.
    expect(roundTrip("https://evil.example/x")).toBe("/home");
    expect(roundTrip("//evil.example")).toBe("/home");
  });
});

describe("parseDesktopOpenLink", () => {
  it("accepte la forme sans double barre oblique", () => {
    expect(parseDesktopOpenLink("minddy:open?next=%2Fbilling")).toBe("/billing");
  });

  it("rejects another scheme, another host, or a link without a destination", () => {
    expect(parseDesktopOpenLink("https://www.minddy.app/open?next=/billing")).toBeNull();
    expect(parseDesktopOpenLink("minddy://auth?code=abc")).toBeNull();
    expect(parseDesktopOpenLink("minddy://open")).toBeNull();
    expect(parseDesktopOpenLink("")).toBeNull();
  });

  it("does not interfere with the authentication link", () => {
    // The two readers intersect in `receiveDeepLink`: each must return
    // `null` on the other's host, otherwise the first consulted swallows everything.
    expect(parseDesktopAuthLink(buildDesktopOpenUrl("/billing"))).toBeNull();
  });
});

describe("billingReturnUrl", () => {
  const ORIGIN = "https://www.minddy.app";

  it("from the web: the page itself", () => {
    expect(billingReturnUrl(ORIGIN, "/billing?billing=success", false)).toBe(
      "https://www.minddy.app/billing?billing=success"
    );
  });

  it("depuis l'app : la page de rebond, qui rouvre l'app dessus", () => {
    const url = billingReturnUrl(ORIGIN, "/billing?billing=success", true);
    expect(url).toBe(
      "https://www.minddy.app/desktop/return?next=%2Fbilling%3Fbilling%3Dsuccess"
    );
    // Stripe only accepts http(s): the bounce must remain a real URL.
    expect(new URL(url).protocol).toBe("https:");
    // And what this page will emit must lead to the right destination.
    const next = new URL(url).searchParams.get("next");
    expect(roundTrip(next ?? "")).toBe("/billing?billing=success");
  });
});
