import { describe, expect, it } from "vitest";
import { filterMentionItems } from "@/lib/mention-menu";
import { MAX_NUMO_CITATIONS, numoCitations, numoCitedMentions } from "@/lib/numo-cited-mentions";
import type { MentionOption } from "@/components/mention-suggest";

const catalog: MentionOption[] = [
  { type: "member", id: "u-1", label: "Camille Roy" },
  { type: "project", id: "p-1", label: "Minddy" },
  { type: "issue", id: "i-1", label: "MIN-1", detail: "Fix login" },
  { type: "issue", id: "i-2", label: "MIN-2", detail: "Webhooks" },
  { type: "page", id: "pg-1", label: "Guide" },
  { type: "routine", id: "r-1", label: "Weekly digest" },
];

const now = new Date(2026, 10, 13, 10, 0);

describe("numoCitedMentions", () => {
  it("lists what Numo cited first, moved rather than duplicated, newest text first", () => {
    const citations = numoCitations([
      "Waiting on [@](mention:issue/i-2) since yesterday.",
      "Ask [@](mention:member/u-1) about [@](mention:page/pg-1) and [@](mention:issue/i-2).",
    ]);
    const options = numoCitedMentions(catalog, citations, "en", now);

    expect(options.slice(0, 3)).toEqual([
      expect.objectContaining({ type: "issue", id: "i-2", section: "fromNumo" }),
      expect.objectContaining({ type: "member", id: "u-1", section: "fromNumo" }),
      expect.objectContaining({ type: "page", id: "pg-1", section: "fromNumo" }),
    ]);
    expect(options).toHaveLength(catalog.length);
    expect(options.filter((option) => option.id === "i-2")).toHaveLength(1);
    // The menu orders contextual sections before the rest.
    expect(filterMentionItems(options, "")[0]).toEqual(expect.objectContaining({ id: "i-2" }));
  });

  it("leaves out what the menu does not offer, and adds the dates Numo cited", () => {
    const citations = numoCitations([
      "[@](mention:issue/hidden) is due [@](mention:date/2026-11-14?time=09:00).",
    ]);
    const options = numoCitedMentions(catalog, citations, "en", now);

    expect(options[0]).toEqual(
      expect.objectContaining({ type: "date", id: "2026-11-14", meta: { time: "09:00" }, section: "fromNumo" }),
    );
    expect(options[0].label).toMatch(/^Tomorrow/);
    expect(options.some((option) => option.id === "hidden")).toBe(false);
  });

  it("keeps the catalog's identity when Numo cited nothing it can offer", () => {
    expect(numoCitedMentions(catalog, numoCitations(["No mention here."]), "en", now)).toBe(catalog);
    expect(numoCitedMentions(catalog, numoCitations(["[@](mention:issue/gone)"]), "en", now)).toBe(catalog);
    expect(numoCitations([null, undefined, ""])).toBe("");
  });

  it("does not change while a streaming reply adds text but no mention", () => {
    const first = numoCitations(["See [@](mention:issue/i-1)"]);
    expect(numoCitations(["See [@](mention:issue/i-1) and the rest"])).toBe(first);
  });

  it(`stops at ${MAX_NUMO_CITATIONS} citations`, () => {
    const days = Array.from({ length: 12 }, (_, i) => `[@](mention:date/2026-12-${String(i + 1).padStart(2, "0")})`);
    const options = numoCitedMentions(catalog, numoCitations([days.join(" ")]), "en", now);
    expect(options.filter((option) => option.section === "fromNumo")).toHaveLength(MAX_NUMO_CITATIONS);
  });
});
