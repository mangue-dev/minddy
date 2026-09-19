import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchWebhooksForEvents } from "./webhooks";

const { after, safeFetch } = vi.hoisted(() => ({
  after: vi.fn(),
  safeFetch: vi.fn(async () => ({ status: 204 })),
}));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/server/safe-fetch", () => ({ safeFetch }));

function database() {
  const requests: Request[] = [];
  const service = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "PATCH") return new Response(null, { status: 204 });
        const table = new URL(request.url).pathname.split("/").at(-1);
        if (table === "issues") {
          return Response.json([{
            id: "issue-1", project_id: "project-1", number: 1,
            title: "Fixture", integration_id: "hook-1",
          }]);
        }
        if (table === "integrations") {
          return Response.json([{
            id: "hook-1", project_id: "project-1", name: "Fixture", key_hash: "fixture-hash",
            webhook_url: "https://fixture.invalid/hook", webhook_events: ["issue.created"],
            webhook_scope: "all",
          }]);
        }
        return Response.json([{ id: "project-1", name: "Fixture", key: "TEST" }]);
      },
    },
  });
  return { service, requests };
}

beforeEach(() => {
  vi.clearAllMocks();
  after.mockReset();
});

describe("webhook dispatch scheduling", () => {
  it("starts database reads and delivery only when the deferred callback runs", async () => {
    const { service, requests } = database();

    dispatchWebhooksForEvents(service, [{ issue_id: "issue-1", actor_id: null, type: "created" }]);

    expect(after).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(0);
    expect(safeFetch).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
  });

  it("delivers once when after is unavailable outside a request", async () => {
    after.mockImplementation(() => { throw new Error("No request context"); });
    const { service, requests } = database();

    dispatchWebhooksForEvents(service, [{ issue_id: "issue-1", actor_id: null, type: "created" }]);

    await vi.waitFor(() => {
      expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
    });
    expect(after).toHaveBeenCalledTimes(1);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });
});
