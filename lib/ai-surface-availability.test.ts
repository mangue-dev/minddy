import { describe, expect, it } from "vitest";
import { isAiSurfaceAvailable } from "@/lib/ai-surface-availability";

describe("isAiSurfaceAvailable", () => {
  it("allows every surface when managed AI is configured", () => {
    expect(isAiSurfaceAvailable(true, [], "assistant")).toBe(true);
  });

  it("requires a validated key enabled for the requested surface otherwise", () => {
    expect(isAiSurfaceAvailable(false, [], "assistant")).toBe(false);
    expect(
      isAiSurfaceAvailable(false, [
        { validated_at: null, enabled_surfaces: ["assistant"] },
        { validated_at: "2026-08-20T12:00:00.000Z", enabled_surfaces: ["agent"] },
      ], "assistant"),
    ).toBe(false);
    expect(
      isAiSurfaceAvailable(false, [
        { validated_at: "2026-08-20T12:00:00.000Z", enabled_surfaces: ["assistant"] },
      ], "assistant"),
    ).toBe(true);
  });
});
