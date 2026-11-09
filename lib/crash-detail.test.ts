import { describe, expect, it } from "vitest";
import { crashDetail } from "./crash-detail";

describe("crashDetail", () => {
  it("names the error kind and message on one line", () => {
    expect(crashDetail(new TypeError("undefined is not an object\n  (evaluating 'a.b')")))
      .toBe("TypeError: undefined is not an object (evaluating 'a.b')");
  });

  it("appends the server digest that matches a production log", () => {
    expect(crashDetail(Object.assign(new Error("boom"), { digest: "3141592653" })))
      .toBe("Error: boom · 3141592653");
  });

  it("keeps a long message readable on a phone", () => {
    const detail = crashDetail(new Error("x".repeat(500)));
    expect(detail.length).toBeLessThanOrEqual("Error: ".length + 160);
    expect(detail.endsWith("…")).toBe(true);
  });

  it("falls back to the kind when the message is empty", () => {
    expect(crashDetail(new RangeError(""))).toBe("RangeError");
  });
});
