import { describe, expect, it } from "vitest";
import { GLOBAL_ISSUES_KEY } from "./global-issues-api";
import { isPersistableKey } from "./query-provider";

describe("global issue snapshot persistence", () => {
  it("does not duplicate full issue rows in local storage", () => {
    expect(isPersistableKey(GLOBAL_ISSUES_KEY)).toBe(false);
  });
});
