import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildProjectSnapshotBlock, buildSystemPrompt } = await import("./prompt");
const { withHistoryCacheBreakpoint } = await import("./loop");
const { toAnthropicMessagesBody } = await import("@/lib/server/anthropic-messages");

/**
 * MIN-1001 — a prompt cache reuses a prefix only while it is byte-identical.
 * The stable part of Numo's prompt must not move when the project's activity
 * does, and the breakpoints must reach the provider.
 */

const project = {
  id: "p1",
  name: "Minddy",
  key: "MIND",
  statusCounts: { todo: 1 },
  recentIssues: [{ id: "i1", identifier: "MIND-1", title: "First", status: "todo" }],
  members: [],
  objectives: [],
  categories: [],
};

describe("stable project prompt", () => {
  it("stays identical when the status counts and recent issues change", () => {
    const before = buildSystemPrompt(project, "en", new Set());
    const after = buildSystemPrompt({
      ...project,
      statusCounts: { todo: 0, done: 4 },
      recentIssues: [{ id: "i2", identifier: "MIND-2", title: "Second", status: "done" }],
    }, "en", new Set());
    expect(after).toBe(before);
    expect(before).toContain("## Current project");
    expect(before).not.toContain("MIND-1 — First");
  });

  it("leaves the activity to the snapshot block", () => {
    const block = buildProjectSnapshotBlock(project);
    expect(block).toContain("Issues by status");
    expect(block).toContain("[@MIND-1](mention:issue/i1) — First (status: todo)");
  });

  // MIN-1005: a "[status]" tag after an identifier taught Numo to write
  // "MIN-1001 [blocked]" as literal text instead of a mention.
  it("shows records as mentions, never with a bracketed status tag", () => {
    const block = buildProjectSnapshotBlock(project);
    const prompt = buildSystemPrompt({
      ...project,
      objectives: [{ id: "o1", name: "Launch", status: "in_progress" }],
    }, "en", new Set());
    expect(block).not.toMatch(/\[(todo|done|in_progress)\]/);
    expect(prompt).toContain(`"Launch" (id: o1, status: in_progress)`);
    expect(prompt).not.toContain("[in_progress]");
    expect(prompt).not.toContain(`Refer to issues as "KEY-N — title"`);
  });
});

describe("withHistoryCacheBreakpoint", () => {
  const cachedSystem = {
    role: "system" as const,
    content: [
      { type: "text" as const, text: "rules", cache_control: { type: "ephemeral" as const } },
      { type: "text" as const, text: "clock" },
    ],
  };

  it("marks the latest user message when the system prompt is cached", () => {
    const messages = [
      cachedSystem,
      { role: "user" as const, content: "older" },
      { role: "assistant" as const, content: "reply" },
      { role: "user" as const, content: "latest" },
      { role: "assistant" as const, content: null, tool_calls: [] },
      { role: "tool" as const, content: "result", tool_call_id: "c1" },
    ];
    const marked = withHistoryCacheBreakpoint(messages);
    expect(marked[3].content).toEqual([
      { type: "text", text: "latest", cache_control: { type: "ephemeral" } },
    ]);
    expect(marked[1].content).toBe("older");
    // The stored history is not mutated.
    expect(messages[3].content).toBe("latest");
  });

  it("puts the breakpoint on the last text part, after attachments", () => {
    const marked = withHistoryCacheBreakpoint([
      cachedSystem,
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: "https://example.com/a.png" } },
        ],
      },
    ]);
    expect(marked[1].content).toEqual([
      { type: "text", text: "look", cache_control: { type: "ephemeral" } },
      { type: "image_url", image_url: { url: "https://example.com/a.png" } },
    ]);
  });

  it("changes nothing when the system prompt carries no breakpoint", () => {
    const messages = [
      { role: "system" as const, content: "rules" },
      { role: "user" as const, content: "latest" },
    ];
    expect(withHistoryCacheBreakpoint(messages)).toBe(messages);
  });
});

describe("native Anthropic system blocks", () => {
  it("keeps the breakpoint of the stable part", () => {
    const body = toAnthropicMessagesBody({
      model: "claude-sonnet-5-5",
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
            { type: "text", text: "clock" },
          ],
        },
        { role: "user", content: "hi" },
      ],
    });
    expect(body.system).toEqual([
      { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
      { type: "text", text: "clock" },
    ]);
  });

  it("sends plain text when no block asks for a breakpoint", () => {
    const body = toAnthropicMessagesBody({
      model: "claude-sonnet-5-5",
      max_tokens: 100,
      messages: [{ role: "system", content: "rules" }, { role: "user", content: "hi" }],
    });
    expect(body.system).toBe("rules");
  });
});
