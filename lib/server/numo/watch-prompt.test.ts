import { describe, expect, it } from "vitest";
import { buildNumoReminderPromptBlock } from "./watch-prompt";

describe("buildNumoReminderPromptBlock", () => {
  const block = buildNumoReminderPromptBlock({
    watchId: "w1", projectId: "p1", targetType: "issue", targetId: "i1",
  });

  it("names the reminder's project and target", () => {
    expect(block).toContain("project_id: p1; issue_id: i1");
  });

  // MIN-930: work Numo did on a reminder reaches the home summary through
  // the journal; a reminder that changed nothing leaves no entry.
  it("asks for one journal entry when the turn changed the user's content, none otherwise", () => {
    expect(block).toContain("write one journal entry (journal_write)");
    expect(block).toContain("Write none when you changed nothing.");
  });
});

describe("an occurrence of a recurring reminder (MIN-953)", () => {
  const occurrence = (grants: Array<"notification" | "administration">) => buildNumoReminderPromptBlock({
    watchId: "w1", projectId: "p1", targetType: "date", targetId: null,
    recurring: { firedAt: "2026-11-09T18:00:00.000Z", grants },
  });

  it("names what the user allowed, and nothing else", () => {
    const block = occurrence(["notification", "administration"]);
    expect(block).toContain("## Recurring reminder turn");
    expect(block).toContain("send the user a note (notify_me) that is not urgent");
    expect(block).toContain("use the admin_* tools");
    expect(block).not.toContain("act on pull requests");
    expect(occurrence([])).toContain("The user gave this reminder no extra permission.");
  });

  it("reports in the journal and keeps notes for what the user must act on", () => {
    expect(occurrence([])).toContain("Report in your journal (journal_write)");
    expect(occurrence([])).toContain("pass urgent: true and urgency_reason");
    expect(occurrence(["notification"])).toContain("An occurrence with nothing to report sends no note.");
    expect(occurrence([])).toContain("You cannot set, change or cancel reminders in this turn.");
  });
});
