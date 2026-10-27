import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Smart Fill title (MIN-798): what is kept of a model's answer, the
 * deterministic fallback a creation keeps when no model answers, and the
 * gates of the call. The model call itself is mocked.
 */

const { forcedToolCall, hasUsageBudget, resolveConfiguredModel } = vi.hoisted(() => ({
  forcedToolCall: vi.fn(),
  hasUsageBudget: vi.fn(),
  resolveConfiguredModel: vi.fn(async () => ({ model: "test/model" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({ forcedToolCall }));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget }));
vi.mock("@/lib/server/model-config", () => ({ resolveConfiguredModel }));
vi.mock("@/lib/server/smart-fill", () => ({ MAX_DESCRIPTION_CHARS: 4000 }));

import {
  buildIssueTitlePrompt,
  cleanIssueTitle,
  fallbackIssueTitle,
  generateIssueTitle,
  MAX_GENERATED_TITLE_CHARS,
} from "./smart-fill-title";

describe("cleanIssueTitle", () => {
  it("removes what small models add around a title", () => {
    expect(cleanIssueTitle('  "Title: Export PDF fails on long reports."  ')).toBe(
      "Export PDF fails on long reports",
    );
    expect(cleanIssueTitle("« Titre — Le tableau perd l’ordre des colonnes »")).toBe(
      "Le tableau perd l’ordre des colonnes",
    );
  });

  it("cuts a sentence-long answer at a whole word within a board row", () => {
    const long = "The board loses the order of its columns after a card is dragged on a phone in landscape";
    const title = cleanIssueTitle(long);
    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(MAX_GENERATED_TITLE_CHARS);
    expect(long.startsWith(title!)).toBe(true);
    expect(title!.split(" ").length).toBeLessThanOrEqual(12);
  });

  it("returns null when nothing remains", () => {
    expect(cleanIssueTitle(' "" . ')).toBeNull();
  });
});

describe("fallbackIssueTitle", () => {
  it("keeps the first line of text without its Markdown", () => {
    expect(
      fallbackIssueTitle("![shot](https://x/y.png)\n\n## **Login** fails for [@Camille](mention:user/1)\nMore."),
    ).toBe("Login fails for @Camille");
    expect(fallbackIssueTitle("- [ ] Rename the `sync` job\n")).toBe("Rename the sync job");
  });

  it("gives no title to a description without text", () => {
    expect(fallbackIssueTitle(null)).toBeNull();
    expect(fallbackIssueTitle("   \n![only](https://x/y.png)\n")).toBeNull();
  });
});

describe("buildIssueTitlePrompt", () => {
  it("asks to keep the current title on a re-evaluation", () => {
    expect(buildIssueTitlePrompt("Minddy", null)).not.toContain("UNCHANGED");
    expect(buildIssueTitlePrompt("Minddy", "Export PDF fails")).toContain('"Export PDF fails"');
  });
});

describe("generateIssueTitle", () => {
  const input = {
    projectId: "project-1",
    projectName: "Minddy",
    billToUserId: "user-1",
    description: "When I export a long report to PDF, the last pages are blank.",
  };

  beforeEach(() => {
    forcedToolCall.mockReset();
    hasUsageBudget.mockReset().mockResolvedValue(true);
  });

  it("bills the Smart Fill payer on the admin-set title model and cleans the answer", async () => {
    forcedToolCall.mockResolvedValue({ title: "PDF export leaves the last pages blank." });
    await expect(generateIssueTitle(input)).resolves.toBe("PDF export leaves the last pages blank");
    expect(resolveConfiguredModel).toHaveBeenCalledWith("smart_fill_title_model");
    expect(hasUsageBudget).toHaveBeenCalledWith("user-1", "automations", "smart_fill_title_model");
    expect(forcedToolCall.mock.calls[0]?.[5]).toMatchObject({
      record: { feature: "smart_fill", billTo: { userId: "user-1" }, projectId: "project-1" },
    });
  });

  it("calls no model without a description or a budget", async () => {
    await expect(generateIssueTitle({ ...input, description: "  " })).resolves.toBeNull();
    hasUsageBudget.mockResolvedValue(false);
    await expect(generateIssueTitle(input)).resolves.toBeNull();
    expect(forcedToolCall).not.toHaveBeenCalled();
  });

  it("degrades to null on a missing or thrown answer", async () => {
    forcedToolCall.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("boom"));
    await expect(generateIssueTitle(input)).resolves.toBeNull();
    await expect(generateIssueTitle(input)).resolves.toBeNull();
  });
});
