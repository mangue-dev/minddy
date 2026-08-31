import { describe, expect, it } from "vitest";

import { parseWindowsStoreUpdateProbe } from "./windows-store-update";

describe("parseWindowsStoreUpdateProbe", () => {
  it("accepts available and current Store results", () => {
    expect(parseWindowsStoreUpdateProbe('{"available":true}\n')).toEqual({
      available: true,
    });
    expect(parseWindowsStoreUpdateProbe('{"available":false}')).toEqual({
      available: false,
    });
  });

  it("rejects missing, malformed, and incorrectly typed output", () => {
    expect(parseWindowsStoreUpdateProbe(null)).toBeNull();
    expect(parseWindowsStoreUpdateProbe("not json")).toBeNull();
    expect(parseWindowsStoreUpdateProbe("{}")).toBeNull();
    expect(parseWindowsStoreUpdateProbe('{"available":"yes"}')).toBeNull();
  });
});
