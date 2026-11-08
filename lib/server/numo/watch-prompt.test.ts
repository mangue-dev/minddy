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
