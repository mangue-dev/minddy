import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerMinddyTools } from "./tools";
import type { ToolExtra, ToolResult } from "./tool-helpers";

const { addIssueRelation, findIssueRelation, removeIssueRelation } = vi.hoisted(() => ({
  addIssueRelation: vi.fn(), findIssueRelation: vi.fn(), removeIssueRelation: vi.fn(),
}));
vi.mock("@/lib/server/issue-relations", () => ({ addIssueRelation, findIssueRelation, removeIssueRelation }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("./tool-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tool-helpers")>();
  return {
    ...actual,
    requireProject: vi.fn(async () => ({ userId: "user-1", keyId: null, access: { project: { id: "project-1", key: "MIN" } } })),
    resolveIssueRef: vi.fn(async (_access, ref: string) => ref.startsWith("MIN-")
      ? { issue: { id: ref, identifier: ref } }
      : { error: actual.fail("issue_not_found", "Issue not found") }),
    resolveObjectiveRef: vi.fn(async (_access, ref: string) => ({ objective: { id: ref, name: ref.replace(/^obj:/, "") } })),
  };
});

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

beforeEach(() => {
  vi.clearAllMocks();
  addIssueRelation.mockResolvedValue({ ok: true });
  removeIssueRelation.mockResolvedValue({ ok: true });
  findIssueRelation.mockResolvedValue({ id: "relation-1" });
});

async function link(args: Record<string, unknown>) {
  const result = await handlers.get("minddy_link_issues")!({ project_id: "project-1", relation: "blocks", ...args }, {});
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text);
}

describe("MCP link issue response compatibility", () => {
  it.each(["add", "remove", "absent"])("preserves the issue field on %s", async (operation) => {
    if (operation === "absent") findIssueRelation.mockResolvedValue(null);
    const result = await link({ issue: "MIN-1", target: "MIN-2", remove: operation !== "add" });
    expect(result).toMatchObject({ issue: "MIN-1", source: "MIN-1", target: "MIN-2" });
    expect(result[operation === "add" ? "added" : "removed"]).toBe(operation !== "absent");
    if (operation === "add") expect(addIssueRelation).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "issue", targetType: "issue" }));
    if (operation === "absent") expect(removeIssueRelation).not.toHaveBeenCalled();
  });

  it("preserves the issue alias for an objective target", async () => {
    expect(await link({ issue: "MIN-1", target: "obj:Release" })).toMatchObject({ issue: "MIN-1", source_kind: "issue", target_kind: "objective" });
  });

  it.each(["add", "remove", "absent"])("does not label an objective source as an issue on %s", async (operation) => {
    if (operation === "absent") findIssueRelation.mockResolvedValue(null);
    const result = await link({ objective: "obj:Release", target: "MIN-1", remove: operation !== "add" });
    expect(result).not.toHaveProperty("issue");
    expect(result).toMatchObject({ source: "Release", target: "MIN-1" });
  });
});
