import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { insertEvents, type EventRow } from "./issue-events";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/lib/server/webhooks", () => ({ dispatchWebhooksForEvents: dispatch }));

afterEach(() => vi.restoreAllMocks());

function client(response = new Response(null, { status: 201 })) {
  const requests: Request[] = [];
  const service = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return response;
      },
    },
  });
  dispatch.mockClear();
  return { service, requests };
}

describe("activity batch persistence", () => {
  it("requests database defaults for mixed Smart-fill and ordinary events", async () => {
    const { service, requests } = client();
    const rows: EventRow[] = [
      { issue_id: "issue-1", actor_id: "user-1", type: "created" },
      {
        issue_id: "issue-1", actor_id: "user-1", type: "updated",
        via_smart_fill: true, to_value: "priority",
      },
    ];
    await insertEvents(service, rows);
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("prefer")).toContain("missing=default");
    expect(await requests[0].json()).toEqual(rows);
    expect(dispatch).toHaveBeenCalledWith(service, rows);
  });

  it("preserves explicit false, null, timestamps and per-event attribution", async () => {
    const { service, requests } = client();
    const rows: EventRow[] = [
      {
        issue_id: "issue-1", actor_id: null, type: "updated",
        via_smart_assign: true, smart_assign_ai: false,
        from_value: null, created_at: "2026-09-19T10:00:00Z",
      },
      {
        page_id: "page-1", actor_id: "user-1", type: "created",
        via_mcp: true, api_key_id: "key-1",
      },
    ];
    await insertEvents(service, rows);
    expect(requests[0].headers.get("prefer")).toContain("missing=default");
    expect(await requests[0].json()).toEqual(rows);
    expect(dispatch).toHaveBeenCalledWith(service, [rows[0]]);
  });

  it("reports a rejected batch and never dispatches webhooks for missing events", async () => {
    const { service } = client(new Response(JSON.stringify({
      code: "23502", message: "activity constraint failed", details: null, hint: null,
    }), { status: 400, headers: { "content-type": "application/json" } }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await insertEvents(service, [{ issue_id: "issue-1", actor_id: null, type: "created" }]);
    expect(log).toHaveBeenCalledWith("[issue-events] insert failed");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not send an empty batch", async () => {
    const { service, requests } = client();
    await insertEvents(service, []);
    expect(requests).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
