import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/config";
import {
  ASSISTANT_STARTER_KEYS,
  ASSISTANT_STARTER_PAGES,
  assistantStarterPage,
  assistantStarters,
} from "@/lib/assistant-starters";

describe("assistantStarterPage", () => {
  it.each([
    ["/home", "home"],
    ["/inbox", "inbox"],
    ["/all", "all"],
    ["/routines", "routines"],
    ["/pull-requests", "pullRequests"],
    ["/statistics", "statistics"],
    ["/settings", "settings"],
    ["/billing", "billing"],
    ["/trash", "trash"],
    ["/projects/p1", "board"],
    ["/projects/p1/triage", "triage"],
    ["/projects/p1/objectives", "objectives"],
    ["/projects/p1/pages", "pages"],
    ["/projects/p1/pages/page-1", "page"],
    ["/projects/p1/feedback", "feedback"],
    ["/projects/p1/settings", "projectSettings"],
  ] as const)("maps %s to %s", (pathname, page) => {
    expect(assistantStarterPage(pathname)).toBe(page);
  });

  it("falls back to the general set for retired or unknown routes", () => {
    expect(assistantStarterPage("/numo")).toBe("general");
    expect(assistantStarterPage("/projects/p1/unknown")).toBe("general");
    expect(assistantStarterPage(null)).toBe("general");
  });

  it("prefers an issue open in the side panel over its board", () => {
    expect(assistantStarterPage("/projects/p1", { issueId: "i1" })).toBe("issue");
  });
});

describe("assistant starter catalog", () => {
  it("offers four distinct suggestions on every page", () => {
    for (const page of ASSISTANT_STARTER_PAGES) {
      const starters = assistantStarters(page);
      expect(starters.map((starter) => starter.key)).toEqual([...ASSISTANT_STARTER_KEYS]);
      expect(starters.every((starter) => starter.icon)).toBe(true);
    }
  });

  it.each(locales)("has a title and a prompt for every suggestion in %s", (locale) => {
    const catalog = JSON.parse(
      readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
    ) as { Assistant: { starters: Record<string, Record<string, { title: string; prompt: string }>> } };
    const starters = catalog.Assistant.starters;
    expect(Object.keys(starters).sort()).toEqual([...ASSISTANT_STARTER_PAGES].sort());
    for (const page of ASSISTANT_STARTER_PAGES) {
      const prompts = new Set<string>();
      for (const key of ASSISTANT_STARTER_KEYS) {
        const entry = starters[page][key];
        expect(entry.title.trim()).not.toBe("");
        expect(entry.prompt.trim()).toBe(entry.prompt);
        prompts.add(entry.prompt);
      }
      expect(prompts.size).toBe(ASSISTANT_STARTER_KEYS.length);
    }
  });
});
