import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { describeEvent, type EventContext, type EventTranslators } from "./describe-event";
import type { IssueEvent, Member } from "./types";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * The two Smart Assign modes read differently in the activity of a
 * ticket (MIN-31). The `smart_assign_ai` flag is the only observable witness to
 * the difference: without it, a solo project automatically assigned to the owner and a
 * real choice of model rendered the same sentence, and only the latency distinguished them.
 *
 * The test goes through the TRUE formatter on both catalogs — it therefore checks
 * also that `{to}` is indeed substituted, not rendered in “Activity.…”.
 */

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

const members = [
  { user_id: ALICE, full_name: "Alice", email: "alice@example.com" },
  { user_id: BOB, full_name: "Bob", email: "bob@example.com" },
] as unknown as Member[];

const ctx: EventContext = {
  members,
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

function assignment(smartAssignAi: boolean | undefined): IssueEvent {
  return {
    id: "e1",
    issue_id: "i1",
    actor_id: null,
    type: "updated",
    field: "assignee_id",
    from_value: null,
    to_value: BOB,
    via_smart_assign: true,
    smart_assign_ai: smartAssignAi,
    created_at: "2026-07-30T11:22:32.000Z",
  } as unknown as IssueEvent;
}

describe("describeEvent — les deux modes de Smart Assign", () => {
  it("automatic mode: the sentence does not claim to have chosen", () => {
    expect(describeEvent(assignment(false), ctx, translators("fr"))).toBe(
      "a assigné le ticket à Bob"
    );
    expect(describeEvent(assignment(false), ctx, translators("en"))).toBe(
      "assigned the issue to Bob"
    );
  });

  it("model choice: the sentence names the assignment rules", () => {
    expect(describeEvent(assignment(true), ctx, translators("fr"))).toBe(
      "a choisi Bob d'après les règles d'attribution"
    );
    expect(describeEvent(assignment(true), ctx, translators("en"))).toBe(
      "picked Bob from the assignment rules"
    );
  });

  it("the two sentences differ — otherwise the distinction would be cosmetic", () => {
    const auto = describeEvent(assignment(false), ctx, translators("fr"));
    const byModel = describeEvent(assignment(true), ctx, translators("fr"));
    expect(auto).not.toBe(byModel);
  });

  it("event from before the column (flag absent): read as automatic", () => {
    expect(describeEvent(assignment(undefined), ctx, translators("fr"))).toBe(
      "a assigné le ticket à Bob"
    );
  });

  it("a human assignment keeps its reassignment sentence", () => {
    const manual = {
      ...assignment(false),
      actor_id: ALICE,
      from_value: ALICE,
      via_smart_assign: false,
    } as unknown as IssueEvent;
    expect(describeEvent(manual, ctx, translators("fr"))).toBe(
      "a changé l'assigné : Alice → Bob"
    );
  });
});
