import { beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  captureExceptionImmediate: vi.fn().mockResolvedValue(undefined),
  constructor: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => unknown) => void callback()),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    captureExceptionImmediate = posthogMock.captureExceptionImmediate;
    constructor(key: string, options: unknown) {
      posthogMock.constructor(key, options);
    }
  },
}));

const PROJECT_KEY = "phc_a1b2c3";

const posthogCookie = (distinctId: unknown): string =>
  `other=1; ph_${PROJECT_KEY}_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: distinctId }))}`;

function stubWorkingConfiguration(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("POSTHOG_API_KEY", "server-key");
  vi.stubEnv("POSTHOG_HOST", "https://analytics.example.test");
  vi.stubEnv("MINDDY_PUBLIC_POSTHOG_KEY", PROJECT_KEY);
  vi.stubEnv("MINDDY_PUBLIC_ERROR_TRACKING", "1");
}

describe("server error tracking", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does nothing by default: the flag is opt-in and defaults to off", async () => {
    stubWorkingConfiguration();
    vi.stubEnv("MINDDY_PUBLIC_ERROR_TRACKING", "");
    const { captureServerException } = await import("./error-tracking");

    await captureServerException(new Error("boom"), posthogCookie("acc-1"), {
      routePath: "/api/issues",
    });

    expect(posthogMock.constructor).not.toHaveBeenCalled();
    expect(posthogMock.captureExceptionImmediate).not.toHaveBeenCalled();
  });

  it("does nothing without a full PostHog pair, even when the flag is on", async () => {
    stubWorkingConfiguration();
    vi.stubEnv("POSTHOG_HOST", "");
    const { captureServerException } = await import("./error-tracking");

    await captureServerException(new Error("boom"), posthogCookie("acc-1"));

    expect(posthogMock.constructor).not.toHaveBeenCalled();
    expect(posthogMock.captureExceptionImmediate).not.toHaveBeenCalled();
  });

  it("reports sanitized template facts and no person profile when opted in", async () => {
    stubWorkingConfiguration();
    const { captureServerException } = await import("./error-tracking");

    await captureServerException(new Error("boom"), posthogCookie("acc-1"), {
      routePath: "/api/issues/[id]",
      routeType: "route",
      httpMethod: "POST",
    });

    expect(posthogMock.captureExceptionImmediate).toHaveBeenCalledTimes(1);
    const [error, distinctId, properties] = posthogMock.captureExceptionImmediate.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(distinctId).toBe("acc-1");
    expect(properties).toEqual({
      route_path: "/api/issues/[id]",
      route_type: "route",
      http_method: "POST",
      $process_person_profile: false,
    });
  });

  it("works without a PostHog cookie and keeps going on delivery failure", async () => {
    stubWorkingConfiguration();
    posthogMock.captureExceptionImmediate.mockRejectedValueOnce(new Error("network down"));
    const { captureServerException } = await import("./error-tracking");

    await expect(
      captureServerException(new Error("boom"), "session=abc"),
    ).resolves.toBeUndefined();

    expect(posthogMock.captureExceptionImmediate).toHaveBeenCalledWith(
      expect.any(Error),
      undefined,
      expect.objectContaining({ $process_person_profile: false }),
    );
  });

  it("parses the distinct id from the raw cookie header only", async () => {
    stubWorkingConfiguration();
    const { parsePostHogDistinctId } = await import("./error-tracking");

    expect(parsePostHogDistinctId(posthogCookie("acc-1"))).toBe("acc-1");
    expect(parsePostHogDistinctId([posthogCookie("acc-1"), "other=2"])).toBe("acc-1");
    expect(parsePostHogDistinctId("session=abc")).toBeNull();
    expect(parsePostHogDistinctId(`ph_${PROJECT_KEY}_posthog=not-json`)).toBeNull();
    expect(parsePostHogDistinctId(undefined)).toBeNull();
  });

  it("reports under no identity when the public key is not configured", async () => {
    stubWorkingConfiguration();
    vi.stubEnv("MINDDY_PUBLIC_POSTHOG_KEY", "");
    const { parsePostHogDistinctId } = await import("./error-tracking");

    expect(parsePostHogDistinctId(posthogCookie("acc-1"))).toBeNull();
  });
});
