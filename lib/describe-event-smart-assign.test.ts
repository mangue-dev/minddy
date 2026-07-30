import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { describeEvent, type EventContext, type EventTranslators } from "./describe-event";
import type { IssueEvent, Member } from "./types";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Les deux modes de Smart Assign se lisent différemment dans l'activité d'un
 * ticket (MIN-31). Le drapeau `smart_assign_ai` est le seul témoin observable de
 * la différence : sans lui, un projet solo affecté d'office au propriétaire et un
 * vrai choix du modèle rendaient la même phrase, et seule la latence les
 * distinguait.
 *
 * Le test passe par le VRAI formateur sur les deux catalogues — il vérifie donc
 * aussi que `{to}` est bien substitué, pas rendu en « Activity.… ».
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
  it("mode automatique : la phrase ne prétend pas avoir choisi", () => {
    expect(describeEvent(assignment(false), ctx, translators("fr"))).toBe(
      "a assigné le ticket à Bob"
    );
    expect(describeEvent(assignment(false), ctx, translators("en"))).toBe(
      "assigned the issue to Bob"
    );
  });

  it("choix du modèle : la phrase nomme les règles d'attribution", () => {
    expect(describeEvent(assignment(true), ctx, translators("fr"))).toBe(
      "a choisi Bob d'après les règles d'attribution"
    );
    expect(describeEvent(assignment(true), ctx, translators("en"))).toBe(
      "picked Bob from the assignment rules"
    );
  });

  it("les deux phrases diffèrent — sans quoi la distinction serait décorative", () => {
    const auto = describeEvent(assignment(false), ctx, translators("fr"));
    const byModel = describeEvent(assignment(true), ctx, translators("fr"));
    expect(auto).not.toBe(byModel);
  });

  it("événement d'avant la colonne (drapeau absent) : lu comme automatique", () => {
    expect(describeEvent(assignment(undefined), ctx, translators("fr"))).toBe(
      "a assigné le ticket à Bob"
    );
  });

  it("une affectation humaine garde sa phrase de réassignation", () => {
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
