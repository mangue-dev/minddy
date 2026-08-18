import { describe, expect, it } from "vitest";

import { posthogCookieName, readPosthogDistinctId } from "./posthog-cookie";

describe("posthogCookieName", () => {
  it("compose le nom de cookie de posthog-js", () => {
    expect(posthogCookieName("phc_abc123")).toBe("ph_phc_abc123_posthog");
  });

  it("returns null without a project key — self-host, CI", () => {
    expect(posthogCookieName(undefined)).toBeNull();
    expect(posthogCookieName("")).toBeNull();
  });
});

describe("readPosthogDistinctId", () => {
  it("lit le distinct_id d'un cookie en clair", () => {
    const raw = JSON.stringify({ distinct_id: "0198-abcd", $sesid: [1, "x", 2] });
    expect(readPosthogDistinctId(raw)).toBe("0198-abcd");
  });

  it("lit le distinct_id d'un cookie encodé en URL", () => {
    const raw = encodeURIComponent(JSON.stringify({ distinct_id: "0198-abcd" }));
    expect(readPosthogDistinctId(raw)).toBe("0198-abcd");
  });

  it("returns null when the cookie is absent", () => {
    expect(readPosthogDistinctId(undefined)).toBeNull();
    expect(readPosthogDistinctId(null)).toBeNull();
    expect(readPosthogDistinctId("")).toBeNull();
  });

  it("returns null for a value that is not JSON", () => {
    expect(readPosthogDistinctId("pas-du-json")).toBeNull();
  });

  it("rend null quand le JSON ne porte pas de distinct_id utilisable", () => {
    expect(readPosthogDistinctId(JSON.stringify({}))).toBeNull();
    expect(readPosthogDistinctId(JSON.stringify({ distinct_id: 42 }))).toBeNull();
    expect(readPosthogDistinctId(JSON.stringify({ distinct_id: "   " }))).toBeNull();
  });

  it("rejects an oversized identifier — forged cookie", () => {
    const raw = JSON.stringify({ distinct_id: "x".repeat(201) });
    expect(readPosthogDistinctId(raw)).toBeNull();
  });

  it("does not throw for an isolated percent sign, which decodeURIComponent rejects", () => {
    expect(() => readPosthogDistinctId("%")).not.toThrow();
    expect(readPosthogDistinctId("%")).toBeNull();
  });
});
