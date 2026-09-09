import { describe, expect, it } from "vitest";
import { resolveSandboxPreferences, sandboxBillingFor, sandboxUsagePercentPerHour } from "./agent-sandbox-config";

describe("sandbox defaults", () => {
  it.each([undefined, null, {}, { sandbox_region: "invalid", sandbox_size: "invalid" }])(
    "defaults missing or invalid preferences to standard Europe", (row) => {
      expect(resolveSandboxPreferences(row)).toEqual({ sandbox_region: "eu", sandbox_size: "standard" });
    },
  );
  it("retains explicit US performance preferences", () => {
    expect(resolveSandboxPreferences({ sandbox_region: "us", sandbox_size: "performance" }))
      .toEqual({ sandbox_region: "us", sandbox_size: "performance" });
  });
});

describe("sandbox rate validation", () => {
  it.each([
    { region: "unknown", vcpus: 4, memoryMb: 8192 },
    { region: "dub1", vcpus: 0, memoryMb: 8192 },
    { region: "dub1", vcpus: 4, memoryMb: NaN },
  ])("rejects unsupported provider metadata: %j", (allocation) => {
    expect(() => sandboxBillingFor(allocation)).toThrow("Unsupported sandbox allocation");
  });
});


describe("hourly sandbox usage allowance estimate", () => {
  it.each([
    ["us", "standard", 10, 2.4], ["us", "performance", 10, 4.8],
    ["eu", "standard", 10, 3.148], ["eu", "performance", 10, 6.296],
    ["eu", "standard", 20, 1.574], ["eu", "performance", 0.5, 125.92],
  ] as const)("converts %s / %s against a $%s allowance", (region, size, allowance, expected) => {
    expect(sandboxUsagePercentPerHour({ sandbox_region: region, sandbox_size: size }, allowance))
      .toBeCloseTo(expected, 8);
  });
  it.each([0, -1, NaN, Infinity])("does not invent an estimate without a usable allowance: %s", (allowance) => {
    expect(sandboxUsagePercentPerHour(resolveSandboxPreferences(), allowance)).toBeNull();
  });
});
