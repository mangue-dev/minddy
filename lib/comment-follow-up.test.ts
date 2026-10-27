import { describe, expect, it } from "vitest";
import { commentFollowUp } from "@/lib/comment-follow-up";

let nextId = 0;
const human = (created_at: string, parent_id: string | null = null) => ({
  id: `c${++nextId}`, parent_id, created_at, via_mcp: false, via_assistant: false, github: null,
});
const agent = (created_at: string, parent_id: string | null = null) => ({
  ...human(created_at, parent_id), via_mcp: true,
});

describe("commentFollowUp", () => {
  it("is null when no MCP agent ever commented", () => {
    expect(commentFollowUp([human("2026-10-01T10:00:00Z")])).toBeNull();
  });

  it("is null when the agent spoke last", () => {
    expect(commentFollowUp([human("2026-10-01T10:00:00Z"), agent("2026-10-01T11:00:00Z")])).toBeNull();
  });

  it("counts the root comments after the agent's last one", () => {
    expect(commentFollowUp([
      agent("2026-10-01T09:00:00Z"),
      human("2026-10-01T10:00:00Z"),
      agent("2026-10-01T11:00:00Z"),
      human("2026-10-01T12:00:00Z"),
      human("2026-10-01T13:00:00Z"),
    ])).toEqual({ count: 2, since: "2026-10-01T11:00:00.000Z", threads: [] });
  });

  it("keeps a reply to the agent pending after the agent posts elsewhere", () => {
    const a = agent("2026-10-01T09:00:00Z");
    expect(commentFollowUp([
      a,
      human("2026-10-01T10:00:00Z", a.id),
      agent("2026-10-01T11:00:00Z"),
    ])).toEqual({ count: 1, since: "2026-10-01T11:00:00.000Z", threads: [a.id] });
  });

  it("settles a reply once the agent answers in its thread", () => {
    const a = agent("2026-10-01T09:00:00Z");
    expect(commentFollowUp([
      a,
      human("2026-10-01T10:00:00Z", a.id),
      agent("2026-10-01T11:00:00Z", a.id),
    ])).toBeNull();
  });

  it("does not settle a reply when the agent only answered in another thread", () => {
    const a = agent("2026-10-01T09:00:00Z");
    const b = agent("2026-10-01T09:30:00Z");
    const reply = human("2026-10-01T10:00:00Z", a.id);
    expect(commentFollowUp([a, b, reply, agent("2026-10-01T11:00:00Z", b.id)]))
      .toEqual({ count: 1, since: "2026-10-01T11:00:00.000Z", threads: [a.id] });
  });

  it("follows a person's thread once the agent replied in it", () => {
    const root = human("2026-10-01T09:00:00Z");
    expect(commentFollowUp([
      root,
      agent("2026-10-01T10:00:00Z", root.id),
      human("2026-10-01T11:00:00Z", root.id),
      agent("2026-10-01T12:00:00Z"),
    ])).toEqual({ count: 1, since: "2026-10-01T12:00:00.000Z", threads: [root.id] });
  });

  it("keeps the ticket-wide rule for replies in threads the agent never joined", () => {
    const root = human("2026-10-01T09:00:00Z");
    expect(commentFollowUp([
      root,
      agent("2026-10-01T10:00:00Z"),
      human("2026-10-01T11:00:00Z", root.id),
    ])).toEqual({ count: 1, since: "2026-10-01T10:00:00.000Z", threads: [] });
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
    ])).toEqual({ count: 1, since: "2026-10-01T11:00:00.000Z", threads: [] });
  });

  it("ignores Numo's replies, in a thread or not", () => {
    const a = agent("2026-10-01T11:00:00Z");
    expect(commentFollowUp([
      a,
      { ...human("2026-10-01T12:00:00Z"), via_assistant: true },
      { ...human("2026-10-01T12:00:00Z", a.id), via_assistant: true },
    ])).toBeNull();
  });
});
