import { describe, expect, it } from "vitest";

import {
  hasForeignOrigin,
  isMutatingMethod,
  isSameOriginRequest,
} from "./same-origin";

/**
 * MIN-345 — the original guard. Two levels that should definitely not be confused: one requires the request to say where it comes from, the other only refuses what is stated elsewhere. The tests tell which one does what.
 */

function req(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

describe("hasForeignOrigin", () => {
  it("rejects a foreign origin", () => {
    expect(
      hasForeignOrigin(req({ host: "www.minddy.app", origin: "https://evil.example" }))
    ).toBe(true);
  });

  it("allows the request origin", () => {
    expect(
      hasForeignOrigin(req({ host: "www.minddy.app", origin: "https://www.minddy.app" }))
    ).toBe(false);
  });

  it("uses the request host, including previews and localhost", () => {
    expect(
      hasForeignOrigin(req({ host: "localhost:3000", origin: "http://localhost:3000" }))
    ).toBe(false);
    expect(
      hasForeignOrigin(req({ host: "minddy-abc.vercel.app", origin: "https://minddy-abc.vercel.app" }))
    ).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(
      hasForeignOrigin(
        req({ host: "www.minddy.app", referer: "https://evil.example/page" })
      )
    ).toBe(true);
  });

  /** The assumed choice: a silent request is not a third-party browser
 request — the browser would have set the header. */
  it("allows a request without origin headers", () => {
    expect(hasForeignOrigin(req({ host: "www.minddy.app" }))).toBe(false);
  });

  it.each(["null", "", "invalid", "file://www.minddy.app", "ftp://www.minddy.app"])(
    "rejects an invalid or opaque Origin %j even with a trusted Referer",
    (origin) => {
      const request = req({
        host: "www.minddy.app",
        origin,
        referer: "https://www.minddy.app/page",
      });
      expect(hasForeignOrigin(request)).toBe(true);
      expect(isSameOriginRequest(request)).toBe(false);
    },
  );

  it("rejects a declared origin when the request host is missing", () => {
    expect(hasForeignOrigin(req({ origin: "https://www.minddy.app" }))).toBe(true);
  });

  it("rejects an invalid Referer when Origin is absent", () => {
    expect(hasForeignOrigin(req({ host: "www.minddy.app", referer: "invalid" }))).toBe(true);
  });
});

describe("isSameOriginRequest", () => {
  it("requires an origin header", () => {
    expect(isSameOriginRequest(req({ host: "www.minddy.app" }))).toBe(false);
    expect(
      isSameOriginRequest(req({ host: "www.minddy.app", origin: "https://www.minddy.app" }))
    ).toBe(true);
    expect(
      isSameOriginRequest(req({ host: "www.minddy.app", origin: "https://evil.example" }))
    ).toBe(false);
  });
});

describe("isMutatingMethod", () => {
  it("identifies state-changing methods", () => {
    expect(["POST", "put", "PATCH", "delete"].map(isMutatingMethod)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(["GET", "head", "OPTIONS"].map(isMutatingMethod)).toEqual([
      false,
      false,
      false,
    ]);
  });
});
