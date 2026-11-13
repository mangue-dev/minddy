import { describe, expect, it } from "vitest";
import { MCP_MAX_RESULT_BYTES } from "@/lib/mcp-client-tools";

import {
  ROUTINE_LIST_RESULT_CHAR_LIMIT,
  ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT,
  ROUTINE_TOOL_RESULT_CHAR_LIMIT,
} from "./routine-tool-result";
import { MAX_PLAN_LENGTH, parsePlan } from "@/lib/plan";
import { MAX_SCRATCHPAD_LENGTH } from "@/lib/scratchpad";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/server/update-issue";
import { linkedIssueSummary, planTaskIndex } from "./execute-tool";
import {
  DEFAULT_TOOL_RESULT_CHAR_LIMIT,
  DOCUMENT_READ_RESULT_CHAR_LIMIT,
  getToolResultCharLimit,
  replayedToolResult,
  serializeToolResult,
  toolCallArgumentsById,
} from "./tool-result-serialization";

describe("Numo tool result serialization", () => {
  it.each([
    {
      name: "list_mcp_tools",
      result: {
        tools: Array.from({ length: 100 }, (_, index) => ({
          name: `tool_${index}`,
          description: "d".repeat(300),
          inputSchema: { type: "object", properties: {} },
        })),
        nextCursor: "page-2",
        nextOffset: 100,
      },
    },
    {
      name: "list_mcp_tools",
      result: {
        tool: {
          name: "large_schema",
          inputSchema: {
            type: "object",
            properties: Object.fromEntries(
              Array.from({ length: 100 }, (_, index) => [
                `field_${index}`,
                { type: "string", description: "d".repeat(400) },
              ]),
            ),
            required: ["field_99"],
          },
        },
      },
    },
    {
      name: "call_mcp_tool",
      result: { content: [{ type: "text", text: "\\".repeat(30_000) }] },
    },
  ])("preserves complete MCP results for $name", ({ name, result }) => {
    const full = JSON.stringify(result);
    expect(full.length).toBeGreaterThan(4_000);
    expect(Buffer.byteLength(full)).toBeLessThanOrEqual(MCP_MAX_RESULT_BYTES);
    const serialized = serializeToolResult(result, getToolResultCharLimit(name));
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it("keeps a maximum-length targeted routine instruction intact", () => {
    // Backslashes exercise JSON escaping, which is larger than ordinary prose.
    const result = {
      routines: [{ id: "routine-1", prompt: "\\".repeat(20_000) }],
    };
    const serialized = serializeToolResult(
      result,
      getToolResultCharLimit("list_routines", { routine_id: "routine-1" }),
    );

    expect(
      getToolResultCharLimit("list_routines", { routine_id: "routine-1" }),
    ).toBe(ROUTINE_TOOL_RESULT_CHAR_LIMIT);
    expect(serialized).not.toContain("... [truncated");
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it("uses the smaller list ceiling when no instruction is requested", () => {
    expect(getToolResultCharLimit("list_routines")).toBe(
      ROUTINE_LIST_RESULT_CHAR_LIMIT,
    );
  });

  it("keeps a routine's run history intact (MIN-589)", () => {
    const result = {
      runs: Array.from({ length: 40 }, (_, index) => ({
        id: `occurrence-${index}`,
        outcome: "x".repeat(500),
      })),
    };
    const serialized = serializeToolResult(
      result,
      getToolResultCharLimit("list_routine_runs"),
    );
    expect(getToolResultCharLimit("read_routine_occurrence")).toBe(
      ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT,
    );
    expect(serialized).not.toContain("... [truncated");
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it("hands the model a multi-section notebook whole (MIN-779)", () => {
    const section = (title: string) =>
      [
        `## ${title}`,
        ...Array.from(
          { length: 12 },
          (_, index) => `- [ ] ${title}: task ${index} with a sentence of context`,
        ),
      ].join("\n");
    const content = [
      section("Today"),
      section("This week"),
      section("Ideas"),
      section("Tasks to turn into issues"),
    ].join("\n\n");
    // The shape of get_scratchpad: the markdown, then its tasks repeated.
    const result = {
      content,
      rev: 7,
      tasks: parsePlan(content).tasks.map((task) => ({
        index: task.index,
        text: task.text,
        state: task.state,
        depth: task.depth,
      })),
      sections: ["Today", "This week", "Ideas", "Tasks to turn into issues"],
    };
    expect(JSON.stringify(result).length).toBeGreaterThan(4_000);

    const serialized = serializeToolResult(
      result,
      getToolResultCharLimit("get_scratchpad"),
    );
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it.each(["get_page", "get_objective", "get_feedback"])(
    "keeps a long document read by %s intact",
    (name) => {
      const result = { markdown: "Paragraph of documentation. ".repeat(400) };
      const serialized = serializeToolResult(result, getToolResultCharLimit(name));
      expect(JSON.parse(serialized)).toEqual(result);
    },
  );

  it("reads a maximum-length plan with its issue whole (MIN-974)", () => {
    // Markdown with the characters JSON escapes: quotes, backslashes, newlines.
    const line = '- [ ] Update "lib/plan.ts" \\ keep the `parsePlan` contract\n';
    const plan = line.repeat(Math.floor(MAX_PLAN_LENGTH / line.length));
    const subIssue = {
      id: "sub-1", identifier: "MIN-2", number: 2, title: "Child", status: "todo",
      priority: "high", effort: "s", assignee_id: null, due_date: null,
      objective_id: null, completed_at: null,
      description: "d".repeat(MAX_DESCRIPTION_LENGTH), plan,
    };
    const result = {
      issue: { id: "issue-1", title: "Parent", description: "Short context.", plan },
      comments: [{ id: "c1", author: "Camille", body: "Looks good." }],
      sub_issues: [subIssue, { ...subIssue, id: "sub-2" }].map(linkedIssueSummary),
      relations: [],
      plan_tasks: parsePlan(plan).tasks.map((task) => ({ task_index: task.index })),
    };
    expect(result.sub_issues[0]).toEqual({
      id: "sub-1", identifier: "MIN-2", number: 2, title: "Child", status: "todo",
      priority: "high", effort: "s", assignee_id: null, due_date: null,
      objective_id: null, completed_at: null,
      plan_progress: parsePlan(plan).progress,
    });
    const serialized = serializeToolResult(result, getToolResultCharLimit("get_issue"));
    expect(serialized).not.toContain("[truncated: only the first");
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it("fits a plan of a thousand short tasks without cutting the read (MIN-974)", () => {
    const line = '- [ ] Update "lib/plan.ts" and keep `parsePlan` stable\n';
    const plan = line.repeat(Math.floor(60_000 / line.length));
    const issue = { issue: { id: "issue-1", description: "Context. ".repeat(1_000), plan } };
    const limit = getToolResultCharLimit("get_issue");
    const index = planTaskIndex(parsePlan(plan), limit - JSON.stringify(issue).length);
    const result = { ...issue, ...index };

    const serialized = serializeToolResult(result, limit);
    expect(serialized).not.toContain("[truncated: only the first");
    expect(JSON.parse(serialized).issue.plan).toBe(plan);
    const total = parsePlan(plan).tasks.length;
    expect(index.plan_tasks.length).toBeGreaterThan(0);
    expect(index.plan_tasks.length).toBeLessThan(total);
    expect(index.plan_tasks_note).toContain(`The plan has ${total} tasks`);
    expect(index.plan_tasks_note).toContain(`the next one is ${index.plan_tasks.length}.`);
  });

  it("lists every task of an ordinary plan without a note", () => {
    const plan = "- [x] First\n- [~] Second\n- [ ] Third\n";
    const index = planTaskIndex(parsePlan(plan), DOCUMENT_READ_RESULT_CHAR_LIMIT);
    expect(index.plan_tasks.map((task) => task.state)).toEqual(["completed", "in_progress", "pending"]);
    expect(index).not.toHaveProperty("plan_tasks_note");
  });

  it("keeps a maximum-length notebook whole", () => {
    const line = "- [ ] \"Quoted\" task\n";
    const content = line.repeat(Math.floor(MAX_SCRATCHPAD_LENGTH / line.length));
    expect(content.length).toBeLessThanOrEqual(MAX_SCRATCHPAD_LENGTH);
    const serialized = serializeToolResult({ content, rev: 1 }, getToolResultCharLimit("get_scratchpad"));
    expect(JSON.parse(serialized)).toEqual({ content, rev: 1 });
  });

  it.each(["get_issue", "get_page", "get_scratchpad", "get_objective", "get_feedback", "get_help"])(
    "gives %s the document ceiling",
    (name) => expect(getToolResultCharLimit(name)).toBe(DOCUMENT_READ_RESULT_CHAR_LIMIT),
  );

  it("keeps a list of a few hundred rows under the default ceiling whole", () => {
    // list_pages for a wiki of 120 pages used to stop at 4,000 characters.
    const result = {
      pages: Array.from({ length: 120 }, (_, index) => ({
        page_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        title: `Page ${index}`,
      })),
    };
    expect(JSON.stringify(result).length).toBeGreaterThan(4_000);
    const serialized = serializeToolResult(result, getToolResultCharLimit("list_pages"));
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it("replays a stored result under its own call's ceiling", () => {
    const routine = JSON.stringify({ routines: [{ id: "r", prompt: "p".repeat(30_000) }] });
    const args = toolCallArgumentsById([
      { tool_calls: [{ id: "call-1", function: { arguments: '{"routine_id":"r"}' } }] },
      { tool_calls: [{ id: "call-2", function: { arguments: "not json" } }] },
    ]);
    expect(args.get("call-2")).toEqual({});
    expect(replayedToolResult(routine, "list_routines", args.get("call-1"))).toBe(routine);
    expect(replayedToolResult(routine, "list_routines")).toContain("[truncated: only the first");
    expect(replayedToolResult(null, "get_page")).toBe("");
  });

  it("says how much of a truncated result the model saw", () => {
    const result = { value: "x".repeat(20_000) };
    const total = JSON.stringify(result).length;
    expect(serializeToolResult(result)).toMatch(
      new RegExp(`\\[truncated: only the first ${DEFAULT_TOOL_RESULT_CHAR_LIMIT} of ${total} characters`),
    );
  });

  it("retains the default ceiling for unrelated tools", () => {
    expect(getToolResultCharLimit("list_members")).toBe(DEFAULT_TOOL_RESULT_CHAR_LIMIT);
    expect(serializeToolResult({ value: "x".repeat(20_000) })).toContain(
      "... [truncated",
    );
  });
});
