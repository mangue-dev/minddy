import { beforeEach, describe, expect, it, vi } from "vitest";
import { mcpToolCatalog } from "@/lib/server/mcp/catalog";
import { executeNativePrototypeMcp, nativePrototypeMcpTool } from "./mcp";

const h = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), or: vi.fn(), is: vi.fn(),
  select: vi.fn(), order: vi.fn(), rate: vi.fn(), decode: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: h.from }) }));
vi.mock("@/lib/server/session-rate-limit", async (original) => ({
  ...await original<typeof import("@/lib/server/session-rate-limit")>(), checkSessionRateLimit: h.rate,
}));
vi.mock("@/lib/server/project-content", async (original) => ({
  ...await original<typeof import("@/lib/server/project-content")>(), decodeProjectName: h.decode,
}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));

const USER = "67600000-0000-4000-8000-000000000001";
const MEMBER_PROJECT = "67600000-0000-4000-8000-000000000003";
const OWN_PROJECT = "67600000-0000-4000-8000-000000000004";
const query = () => ({ select: h.select, eq: h.eq, or: h.or, is: h.is, order: h.order });
const payload = (result: Awaited<ReturnType<typeof executeNativePrototypeMcp>>) => JSON.parse(result.content[0].text);

beforeEach(() => {
  vi.resetAllMocks();
  h.rate.mockReturnValue({ allowed: true, retryAfter: 0 });
  h.decode.mockImplementation(async (row) => row.name);
  h.from.mockReturnValue(query()); h.select.mockReturnValue(query()); h.is.mockReturnValue(query());
  h.order.mockReturnValue(query());
  h.eq.mockImplementation((column) => column === "user_id"
    ? Promise.resolve({ data: [], error: null })
    : Promise.resolve({ data: [{ id: OWN_PROJECT, owner_id: USER, name: "Owner project", key: "OWN" }], error: null }));
});

describe("native prototype Minddy MCP bridge", () => {
  it("advertises the real registered readonly tool and schema without exposing credential material", () => {
    const descriptor = nativePrototypeMcpTool();
    const existing = mcpToolCatalog().find((entry) => entry.name === descriptor.name);
    expect(existing?.readOnly).toBe(true);
    expect(descriptor.description).toBe(existing?.description);
    expect(descriptor.inputSchema).toMatchObject({ type: "object", properties: {}, additionalProperties: false });
    expect(JSON.stringify(descriptor)).not.toContain("native-prototype-internal");
  });

  it("executes the actual registered handler with the server's owner and mandatory MCP rate limit", async () => {
    const result = await executeNativePrototypeMcp({}, USER);
    expect(result.isError).not.toBe(true);
    expect(payload(result)).toEqual({ projects: [{ id: OWN_PROJECT, name: "Owner project", key: "OWN", role: "owner" }] });
    expect(h.eq).toHaveBeenCalledWith("user_id", USER);
    expect(h.eq).toHaveBeenCalledWith("owner_id", USER);
    expect(h.is).toHaveBeenCalledWith("deleted_at", null);
    expect(h.rate).toHaveBeenCalledWith(USER, "mcp", expect.objectContaining({ limit: 120 }));
    expect(h.decode).toHaveBeenCalledWith(expect.objectContaining({ id: OWN_PROJECT }), USER);
  });

  it("uses only the owner's memberships when including shared projects", async () => {
    h.eq.mockResolvedValue({ data: [{ project_id: MEMBER_PROJECT }], error: null });
    h.or.mockResolvedValue({ data: [{ id: MEMBER_PROJECT, owner_id: "another-user", name: "Member project", key: "MEM" }], error: null });
    const result = await executeNativePrototypeMcp({}, USER);
    expect(h.eq).toHaveBeenCalledWith("user_id", USER);
    expect(h.or).toHaveBeenCalledWith(`owner_id.eq.${USER},id.in.(${MEMBER_PROJECT})`);
    expect(payload(result).projects[0].role).toBe("member");
    expect(h.decode).toHaveBeenCalledWith(expect.objectContaining({ id: MEMBER_PROJECT }), USER);
  });

  it("rejects missing server ownership and caller-supplied identity before touching the database", async () => {
    expect(payload(await executeNativePrototypeMcp({}, "")).error.code).toBe("unauthorized");
    for (const args of [{ userId: "other-user" }, { tool: "minddy_delete_issues" }, null, []]) {
      expect(payload(await executeNativePrototypeMcp(args, USER)).error.code).toBe("invalid_params");
    }
    expect(h.from).not.toHaveBeenCalled();
  });

  it("preserves the real rate-limit and database error responses", async () => {
    h.rate.mockReturnValueOnce({ allowed: false, retryAfter: 30 });
    expect(payload(await executeNativePrototypeMcp({}, USER)).error.code).toBe("rate_limited");
    expect(h.from).not.toHaveBeenCalled();
    h.eq.mockResolvedValueOnce({ data: null, error: { message: "Membership lookup failed" } });
    expect(payload(await executeNativePrototypeMcp({}, USER)).error.code).toBe("database_error");
  });

  it("does not disclose internal exception details to a native harness", async () => {
    h.decode.mockRejectedValueOnce(new Error("private encryption key or control token"));
    const result = await executeNativePrototypeMcp({}, USER);
    expect(result.isError).toBe(true);
    expect(payload(result).error.code).toBe("native_mcp_failed");
    expect(JSON.stringify(result)).not.toContain("private encryption key");
  });
});
