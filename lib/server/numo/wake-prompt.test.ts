import { describe, expect, it } from "vitest";
import { buildNumoWakeMessage, NUMO_WAKE_PROMPT_BLOCK } from "./wake-prompt";
import { parseNumoWakeDailyLimit, resolveNumoBackgroundEnabled } from "@/lib/numo-background";

describe("the background turn's prompt (MIN-929)", () => {
  it("names each kept event with the ids Numo's tools take", () => {
    const message = buildNumoWakeMessage({
      sentence: "These events directly concern the user.",
      events: [{
        event: {
          id: 9, type: "issue.assigned", project: "MIN",
          object: { kind: "issue", reference: "MIN-7", title: "Fix login" },
          actor: "Sam Lee", relations: ["assignee"], signals: [], at: "2026-11-08T10:00:00.000Z",
        },
        projectId: "p-1", subjectType: "issue", subjectId: "i-7",
      }],
    });
    expect(message).toContain("[Background wake] These events directly concern the user.");
    expect(message).toContain("issue.assigned on issue MIN-7 \"Fix login\" (project MIN) by Sam Lee");
    expect(message).toContain("project_id: p-1; issue_id: i-7");
  });

  it("states the rules the server enforces", () => {
    for (const rule of ["authorized_by", "urgent: true", "journal_write", "never ask one here"]) {
      expect(NUMO_WAKE_PROMPT_BLOCK).toContain(rule);
    }
  });
});

describe("background Numo settings", () => {
  it("reads as off without the memory, whatever is stored", () => {
    expect(resolveNumoBackgroundEnabled({ numo_background: true })).toBe(true);
    expect(resolveNumoBackgroundEnabled({ numo_background: "true" })).toBe(true);
    expect(resolveNumoBackgroundEnabled({ numo_background: true, numo_memory: false })).toBe(false);
    expect(resolveNumoBackgroundEnabled({})).toBe(false);
  });

  it("falls back to 20 wakes a day on an unset or invalid admin value", () => {
    expect(parseNumoWakeDailyLimit(null)).toBe(20);
    expect(parseNumoWakeDailyLimit("abc")).toBe(20);
    expect(parseNumoWakeDailyLimit("0")).toBe(0);
    expect(parseNumoWakeDailyLimit(" 7 ")).toBe(7);
  });
});
