import { beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  constructor: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => unknown) => void callback()),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = posthogMock.capture;
    identify = posthogMock.identify;
    flush = posthogMock.flush;

    constructor(key: string, options: unknown) {
      posthogMock.constructor(key, options);
    }
  },
}));

describe("PostHog serveur", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("POSTHOG_API_KEY", "server-key");
    vi.stubEnv("POSTHOG_HOST", "https://analytics.example.test");
  });

  it("n'initialise aucun client sans paire clé/hôte complète", async () => {
    vi.stubEnv("POSTHOG_HOST", "");
    const { getServerPostHog } = await import("./posthog");

    expect(getServerPostHog()).toBeNull();
    expect(posthogMock.constructor).not.toHaveBeenCalled();
  });

  it.each([
    { serverKey: "server-key", serverHost: "" },
    { serverKey: "", serverHost: "https://server.example.test" },
  ])(
    "ne masque pas une demi-configuration serveur avec la paire publique",
    async ({ serverKey, serverHost }) => {
      vi.stubEnv("POSTHOG_API_KEY", serverKey);
      vi.stubEnv("POSTHOG_HOST", serverHost);
      vi.stubEnv("MINDDY_PUBLIC_POSTHOG_KEY", "public-key");
      vi.stubEnv("MINDDY_PUBLIC_POSTHOG_HOST", "https://public.example.test");
      const { getServerPostHog } = await import("./posthog");

      expect(getServerPostHog()).toBeNull();
      expect(posthogMock.constructor).not.toHaveBeenCalled();
    },
  );

  it("réutilise la paire publique quand la paire serveur est entièrement absente", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "");
    vi.stubEnv("POSTHOG_HOST", "");
    vi.stubEnv("MINDDY_PUBLIC_POSTHOG_KEY", "public-key");
    vi.stubEnv("MINDDY_PUBLIC_POSTHOG_HOST", "https://public.example.test");
    const { getServerPostHog } = await import("./posthog");

    expect(getServerPostHog()).not.toBeNull();
    expect(posthogMock.constructor).toHaveBeenCalledWith("public-key", {
      host: "https://public.example.test",
      flushAt: 5,
      flushInterval: 10_000,
    });
  });

  it("rejette les événements hors catalogue et sanitise ceux autorisés", async () => {
    const { captureServerEvent } = await import("./posthog");

    captureServerEvent({
      distinctId: "user-1",
      event: "issue_created_server",
      properties: {
        status: "todo\nsecret",
        count: 2,
        nested: { title: "ne doit pas sortir" },
        $dangerous: "reserved",
        $process_person_profile: false,
      },
      groups: { project: "project-1" },
    });
    captureServerEvent({
      distinctId: "user-1",
      event: "invented_event" as "issue_created_server",
    });

    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
    expect(posthogMock.capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "issue_created_server",
      properties: {
        status: "todo secret",
        count: 2,
        $process_person_profile: false,
      },
      groups: { project: "project-1" },
    });
  });

  it("sanitise aussi les propriétés de personne", async () => {
    const { identifyServerUser } = await import("./posthog");

    identifyServerUser("user-1", {
      plan: "pro",
      profile: { email: "secret@example.test" },
      $set: "reserved",
    });

    expect(posthogMock.identify).toHaveBeenCalledWith({
      distinctId: "user-1",
      properties: { plan: "pro" },
    });
  });
});
