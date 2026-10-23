import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { describeEvent, type EventContext, type EventTranslators } from "./describe-event";
import type { IssueEvent } from "./types";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const ctx: EventContext = { members: [], objectives: [], categories: [], issues: [], projectKey: "MIN" };

function translators(locale: "en" | "fr"): EventTranslators {
  const t = createTranslator({ locale, messages: locale === "en" ? en : fr, namespace: "Activity" });
  return {
    t: t as unknown as EventTranslators["t"],
    tStatus: (v) => v,
    tPriority: (v) => v,
    formatDue: (v) => v ?? "",
  };
}

const effortChange = (from: string | null, to: string | null) =>
  ({ id: "e1", issue_id: "i1", actor_id: null, type: "updated", field: "effort", from_value: from, to_value: to, created_at: "2026-10-23T10:00:00.000Z" }) as unknown as IssueEvent;

describe("describeEvent — effort not set (MIN-790)", () => {
  it("names an unset effort instead of a dash, in both directions", () => {
    expect(describeEvent(effortChange(null, "m"), ctx, translators("en"))).toBe("changed effort: Not set → M");
    expect(describeEvent(effortChange("l", null), ctx, translators("fr"))).toContain("L → Non défini");
  });
});
