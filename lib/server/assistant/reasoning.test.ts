import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAppConfigValue = vi.fn();
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValue: (...args: unknown[]) => getAppConfigValue(...args),
}));

const { getAssistantReasoningLevel } = await import("./reasoning");

describe("Numo assistant reasoning configuration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the configured reasoning level", async () => {
    getAppConfigValue.mockResolvedValue("high");
    await expect(getAssistantReasoningLevel()).resolves.toBe("high");
  });

  it("falls back to the registry default", async () => {
    getAppConfigValue.mockResolvedValue(null);
    await expect(getAssistantReasoningLevel()).resolves.toBe("medium");
  });
});
