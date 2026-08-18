import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { describeEvent, type EventContext, type EventTranslators } from "./describe-event";
import type { IssueEvent } from "./types";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * The Smart-fill activity line (MIN-260).
 *
 * It is not composed like the others: the base only stores a list of
 * field NAMES ("priority, effort"), and the sentence is created upon reading,
 * in the reader's language. So two things can break quietly — a
 * field name that doesn't find its label, and an unsubstituted `{fields}` that
 * would display "Activity.smartFilled" on the screen. The test goes through the TRUE
 * formatter on both catalogs, which catches both.
 */

const ctx: EventContext = {
  members: [],
  objectives: [],
  categories: [],
  issues: [],
  projectKey: "MIN",
};

function translators(locale: "en" | "fr"): EventTranslators {
  const messages = locale === "en" ? en : fr;
  const t = createTranslator({ locale, messages, namespace: "Activity" });
  return {
    t: t as unknown as EventTranslators["t"],
    tStatus: (v) => v,
    tPriority: (v) => v,
    formatDue: (v) => v ?? "",
  };
}

function smartFillEvent(toValue: string | null): IssueEvent {
  return {
    id: "e1",
    issue_id: "i1",
    actor_id: "11111111-1111-1111-1111-111111111111",
    type: "updated",
    field: "smart_fill",
    from_value: null,
    to_value: toValue,
    via_smart_fill: true,
    created_at: "2026-08-10T10:00:00.000Z",
  } as unknown as IssueEvent;
}

describe("describeEvent — Smart-fill", () => {
  it("nomme les champs remplis, en anglais", () => {
    expect(
      describeEvent(smartFillEvent("priority,effort,category_ids"), ctx, translators("en")),
    ).toBe("filled in the priority, the effort, the categories");
  });

  it("nomme les champs remplis, en français", () => {
    expect(
      describeEvent(smartFillEvent("priority,objective_id"), ctx, translators("fr")),
    ).toBe("a rempli la priorité, l'objectif");
  });

  it("garde l'ordre dans lequel le serveur a rempli", () => {
    // The server pushes in the order it applies: priority, effort,
    // objective, then categories. The sentence follows this same order rather than sorting
    // alphabetical, which would mean nothing to a reader.
    expect(
      describeEvent(smartFillEvent("effort,priority"), ctx, translators("fr")),
    ).toBe("a rempli l'effort, la priorité");
  });

  it("saute un nom de champ qu'il ne connaît pas", () => {
    // A field removed from the product since: better a shorter sentence than
    // “filled priority, thing_thing” in the timeline.
    expect(
      describeEvent(smartFillEvent("priority,inconnu"), ctx, translators("fr")),
    ).toBe("a rempli la priorité");
  });

  it("retombe sur « ses propriétés » quand la liste est vide ou illisible", () => {
    // An old event, or a lost list: the line must remain a sentence.
    expect(describeEvent(smartFillEvent(null), ctx, translators("fr"))).toBe(
      "a rempli ses propriétés",
    );
    expect(describeEvent(smartFillEvent(""), ctx, translators("en"))).toBe(
      "filled in its properties",
    );
  });

  it("ne dit rien de Smart-fill sur un événement ordinaire", () => {
    // The `smart_fill` field is the only switch — a priority change
    // written by hand keeps his sentence to himself.
    const plain = {
      ...smartFillEvent("priority"),
      field: "priority",
      via_smart_fill: false,
      to_value: "high",
    } as unknown as IssueEvent;
    expect(describeEvent(plain, ctx, translators("fr"))).not.toContain("a rempli");
  });
});
