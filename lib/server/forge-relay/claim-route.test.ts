import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeQuery,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * `GET /api/relay/github/claim` — the Cloud browser entry of the installation
 * claim flow (docs/managed-forge-relay-plan.md). Pinned: the kill switch cuts
 * the route like every other relay route, and a well-formed claim for an
 * active instance redirects to the GitHub App installation page.
 */

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const CODE = "c".repeat(64);

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");

let forgeEnabled = true;
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => forgeEnabled,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/server/git/github-app", () => ({
  getGithubAppSlug: () => "minddy",
}));

const { GET: claim } = await import("@/app/api/relay/github/claim/route");
const { createPendingRelayClaim } = await import("@/lib/server/forge-relay/claims");

function claimRequest() {
  return new Request(
    `http://localhost/api/relay/github/claim?instance=${INSTANCE_ID}&code=${CODE}`,
  ) as never;
}

beforeEach(() => {
  forgeEnabled = true;
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      status: "active",
    },
  ]);
  setFakeTable("forge_relay_claims", []);
});

describe("GET /api/relay/github/claim", () => {
  it("redirects an active instance's claim to the GitHub App installation page", async () => {
    await createPendingRelayClaim({ instanceId: INSTANCE_ID, code: CODE });
    const response = await claim(claimRequest());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "https://github.com/apps/minddy/installations/new",
    );
  });

  it("refuses a syntactically valid code that the instance did not register", async () => {
    const response = await claim(claimRequest());
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("not registered");
  });

  it("stays closed by the kill switch (GA runbook commitment)", async () => {
    forgeEnabled = false;
    const response = await claim(claimRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("not configured");
  });
});
