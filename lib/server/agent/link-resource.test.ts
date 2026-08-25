import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/server/safe-fetch", () => ({ safeFetch }));

const { agentResourceSummary, fetchAgentLinkResource, withoutAgentLinkUrls } = await import(
  "./link-resource"
);

describe("agent link resource isolation", () => {
  it("removes raw destinations from standalone summaries and containers", () => {
    const raw = {
      id: "link-1",
      kind: "link",
      url: "http://127.0.0.1/admin",
      file_name: "Admin",
    };

    expect(agentResourceSummary(raw)).toEqual({ id: "link-1", kind: "link", title: "Admin" });
    expect(withoutAgentLinkUrls({ resources: [{ ...raw, title: "Admin" }] })).toEqual({
      resources: [{ id: "link-1", kind: "link", file_name: "Admin", title: "Admin" }],
    });
  });

  it("does not render binary response bytes or reveal the final redirect URL", async () => {
    safeFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "application/pdf" }),
      url: new URL("https://redirect.example/private.pdf"),
      bytes: Buffer.from("binary payload"),
      truncated: false,
    });

    const result = await fetchAgentLinkResource("https://public.example/document");

    expect(result).toMatchObject({
      http_status: 200,
      content_type: "application/pdf",
      content_omitted:
        "The guarded fetch succeeded, but this binary content type cannot be rendered inline.",
    });
    expect(JSON.stringify(result)).not.toContain("redirect.example");
    expect(JSON.stringify(result)).not.toContain("binary payload");
  });
});
