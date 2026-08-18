import { describe, expect, it } from "vitest";
import {
  durationBucket,
  lengthBucket,
  sanitizeAnalyticsEventName,
  sanitizeAnalyticsProps,
  sizeBucket,
} from "./analytics-sanitize";

describe("sanitizeAnalyticsEventName", () => {
  it("laisse passer un nom snake_case du catalogue", () => {
    expect(sanitizeAnalyticsEventName("issue_created")).toBe("issue_created");
    expect(sanitizeAnalyticsEventName("mcp:tool-called")).toBe("mcp:tool-called");
  });

  it("normalise la casse", () => {
    expect(sanitizeAnalyticsEventName("Issue_Created")).toBe("issue_created");
  });

  it("rejette tout ce qui n'est pas un nom exploitable", () => {
    // An empty string creates a spurious event definition in PostHog.
    expect(sanitizeAnalyticsEventName("")).toBe("");
    expect(sanitizeAnalyticsEventName("issue created")).toBe("");
    expect(sanitizeAnalyticsEventName("issue.created")).toBe("");
    expect(sanitizeAnalyticsEventName("$pageview")).toBe("");
    expect(sanitizeAnalyticsEventName(42)).toBe("");
    expect(sanitizeAnalyticsEventName(null)).toBe("");
    expect(sanitizeAnalyticsEventName(undefined)).toBe("");
  });

  it("borne la longueur", () => {
    expect(sanitizeAnalyticsEventName("a".repeat(200))).toHaveLength(64);
  });
});

describe("sanitizeAnalyticsProps", () => {
  it("garde les primitives", () => {
    expect(
      sanitizeAnalyticsProps({ count: 3, ok: true, status: "todo", missing: null })
    ).toEqual({ count: 3, ok: true, status: "todo", missing: null });
  });

  it("discards non-serializable values", () => {
    expect(
      sanitizeAnalyticsProps({
        nested: { a: 1 },
        list: [1, 2],
        fn: () => null,
        nope: undefined,
        nan: Number.NaN,
        inf: Number.POSITIVE_INFINITY,
      })
    ).toEqual({});
  });

  it("discards reserved PostHog keys and malformed keys", () => {
    expect(sanitizeAnalyticsProps({ $set: "x", "bad key": 1, "a.b": 2 })).toEqual({});
  });

  it("limits text to 512 characters", () => {
    const out = sanitizeAnalyticsProps({ reason: "x".repeat(1000) });
    expect(String(out.reason)).toHaveLength(512);
  });

  it("neutralizes control characters", () => {
    expect(sanitizeAnalyticsProps({ reason: "a\nb\tc" })).toEqual({ reason: "a b c" });
  });

  it("caps the number of keys", () => {
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${i}`, i])
    );
    expect(Object.keys(sanitizeAnalyticsProps(many))).toHaveLength(24);
  });

  it("tolerates missing props", () => {
    expect(sanitizeAnalyticsProps(undefined)).toEqual({});
  });
});

describe("tranches", () => {
  it("lengthBucket measures without revealing the content", () => {
    expect(lengthBucket("")).toBe("empty");
    expect(lengthBucket(null)).toBe("empty");
    expect(lengthBucket("court")).toBe("xs");
    expect(lengthBucket("x".repeat(100))).toBe("s");
    expect(lengthBucket("x".repeat(300))).toBe("m");
    expect(lengthBucket("x".repeat(1000))).toBe("l");
    expect(lengthBucket("x".repeat(5000))).toBe("xl");
  });

  it("durationBucket", () => {
    expect(durationBucket(500)).toBe("under_1s");
    expect(durationBucket(3_000)).toBe("1_5s");
    expect(durationBucket(60_000)).toBe("30s_2m");
    expect(durationBucket(3_600_000)).toBe("over_10m");
    expect(durationBucket(Number.NaN)).toBe("unknown");
  });

  it("sizeBucket", () => {
    expect(sizeBucket(1_000)).toBe("under_100kb");
    expect(sizeBucket(500_000)).toBe("100kb_1mb");
    expect(sizeBucket(9_000_000)).toBe("over_5mb");
    expect(sizeBucket(-1)).toBe("unknown");
  });
});
