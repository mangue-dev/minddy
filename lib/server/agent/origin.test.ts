import { describe, expect, it } from "vitest";

import { agentControlOrigin } from "./origin";

describe("hosted agent control origin", () => {
  it("keeps a preview worker on its exact deployment instead of the production app origin", () => {
    expect(agentControlOrigin({ AGENT_EXECUTION_BACKEND: "vercel", VERCEL_ENV: "preview",
      VERCEL_URL: "exact-preview.vercel.app", MINDDY_PUBLIC_APP_URL: "https://minddy.app" }))
      .toBe("https://exact-preview.vercel.app");
  });

  it("uses the stable app origin in production and the explicit control plane in a Docker-backed pilot", () => {
    expect(agentControlOrigin({ AGENT_EXECUTION_BACKEND: "vercel", VERCEL_ENV: "production",
      VERCEL_URL: "build-specific.vercel.app", MINDDY_PUBLIC_APP_URL: "https://minddy.app/" }))
      .toBe("https://minddy.app");
    expect(agentControlOrigin({ AGENT_EXECUTION_BACKEND: "vercel",
      AGENT_CONTROL_ORIGIN: "https://control.minddy.app/", MINDDY_PUBLIC_APP_URL: "http://localhost:6463" }))
      .toBe("https://control.minddy.app");
  });

  it.each(["http://minddy.app", "https://localhost", "https://loopback.localhost",
    "https://localhost.", "https://runner.local", "https://runner", "https://127.1",
    "https://10.1.2.3", "https://169.254.169.254", "https://[::1]", "https://[::ffff:192.168.1.1]",
    "https://[fc00::1]", "https://user:password@minddy.app", "https://minddy.app/path",
    "https://minddy.app?token=secret", "https://minddy.app#fragment", "file:///tmp/control"])(
    "rejects invalid hosted configuration without falling back to another deployment: %s", (origin) => {
      expect(() => agentControlOrigin({ AGENT_EXECUTION_BACKEND: "vercel",
        AGENT_CONTROL_ORIGIN: origin, MINDDY_PUBLIC_APP_URL: "https://minddy.app" })).toThrow();
      expect(() => agentControlOrigin({ AGENT_EXECUTION_BACKEND: "vercel",
        MINDDY_PUBLIC_APP_URL: origin })).toThrow();
    },
  );

  it("preserves the self-hosted runner's internal HTTP control plane", () => {
    expect(agentControlOrigin({ AGENT_EXECUTION_BACKEND: "self-hosted",
      AGENT_CONTROL_ORIGIN: "http://minddy-web:3000/" })).toBe("http://minddy-web:3000");
    expect(agentControlOrigin({ AGENT_EXECUTION_BACKEND: "self-hosted",
      MINDDY_PUBLIC_APP_URL: "http://127.0.0.1:3000" })).toBe("http://127.0.0.1:3000");
  });

  it("refuses a missing origin rather than assuming the production application", () => {
    expect(() => agentControlOrigin({ AGENT_EXECUTION_BACKEND: "vercel" })).toThrow(
      "Vercel Sandbox requires MINDDY_PUBLIC_APP_URL",
    );
  });
});
