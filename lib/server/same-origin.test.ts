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
  it("refuse une origine tierce", () => {
    expect(
      hasForeignOrigin(req({ host: "www.minddy.app", origin: "https://evil.example" }))
    ).toBe(true);
  });

  it("laisse passer notre propre origine", () => {
    expect(
      hasForeignOrigin(req({ host: "www.minddy.app", origin: "https://www.minddy.app" }))
    ).toBe(false);
  });

  it("suit le host de la requête — préversions et localhost compris", () => {
    expect(
      hasForeignOrigin(req({ host: "localhost:3000", origin: "http://localhost:3000" }))
    ).toBe(false);
    expect(
      hasForeignOrigin(req({ host: "minddy-abc.vercel.app", origin: "https://minddy-abc.vercel.app" }))
    ).toBe(false);
  });

  it("retombe sur le Referer quand l'Origin manque", () => {
    expect(
      hasForeignOrigin(
        req({ host: "www.minddy.app", referer: "https://evil.example/page" })
      )
    ).toBe(true);
  });

  /** The assumed choice: a silent request is not a third-party browser
 request — the browser would have set the header. */
  it("laisse passer une requête qui ne déclare rien", () => {
    expect(hasForeignOrigin(req({ host: "www.minddy.app" }))).toBe(false);
  });

  it("traite `Origin: null` comme une absence, jamais comme un host", () => {
    expect(hasForeignOrigin(req({ host: "www.minddy.app", origin: "null" }))).toBe(false);
  });
});

describe("isSameOriginRequest", () => {
  it("exige l'en-tête, contrairement à hasForeignOrigin", () => {
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
  it("ne compte que ce qui change l'état", () => {
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
