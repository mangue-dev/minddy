import { describe, expect, it } from "vitest";
import { commentFollowUp } from "@/lib/comment-follow-up";

const human = (created_at: string) => ({ created_at, via_mcp: false, via_assistant: false, github: null });
const agent = (created_at: string) => ({ created_at, via_mcp: true, via_assistant: false, github: null });

describe("commentFollowUp", () => {
  it("is null when no MCP agent ever commented", () => {
    expect(commentFollowUp([human("2026-10-01T10:00:00Z")])).toBeNull();
  });

  it("is null when the agent spoke last", () => {
    expect(commentFollowUp([human("2026-10-01T10:00:00Z"), agent("2026-10-01T11:00:00Z")])).toBeNull();
  });

  it("counts the comments after the agent's last one, replies included", () => {
    expect(commentFollowUp([
      agent("2026-10-01T09:00:00Z"),
      human("2026-10-01T10:00:00Z"),
      agent("2026-10-01T11:00:00Z"),
      human("2026-10-01T12:00:00Z"),
      human("2026-10-01T13:00:00Z"),
    ])).toEqual({ count: 2, since: "2026-10-01T11:00:00.000Z" });
  });

  it("counts mirrored pull request comments by their forge date", () => {
    const mirrored = (created_at: string, deleted_at: string | null = null) => ({
      ...human(created_at),
      github: {
        provider: "github" as const, pull_request_id: "pr", author_login: "reviewer", author_association: null,
        url: null, created_at, updated_at: created_at, deleted_at,
      },
    });
    expect(commentFollowUp([
      agent("2026-10-01T11:00:00Z"),
      // Imported later but written on the forge before the agent's comment.
      mirrored("2026-10-01T10:00:00Z"),
      mirrored("2026-10-01T12:00:00Z"),
      mirrored("2026-10-01T12:30:00Z", "2026-10-01T12:45:00Z"),
    ])).toEqual({ count: 1, since: "2026-10-01T11:00:00.000Z" });
  });

  it("ignores Numo's replies", () => {
    expect(commentFollowUp([
      agent("2026-10-01T11:00:00Z"),
      { created_at: "2026-10-01T12:00:00Z", via_mcp: false, via_assistant: true, github: null },
    ])).toBeNull();
  });
});
