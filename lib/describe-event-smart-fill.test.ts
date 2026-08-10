import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { describeEvent, type EventContext, type EventTranslators } from "./describe-event";
import type { IssueEvent } from "./types";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * La ligne d'activité de Smart-fill (MIN-260).
 *
 * Elle ne se compose pas comme les autres : la base ne stocke qu'une liste de
 * NOMS de champs (« priority,effort »), et la phrase se fabrique à la lecture,
 * dans la langue du lecteur. Deux choses peuvent donc casser sans bruit — un
 * nom de champ qui ne trouve pas son libellé, et un `{fields}` non substitué qui
 * afficherait « Activity.smartFilled » à l'écran. Le test passe par le VRAI
 * formateur sur les deux catalogues, ce qui attrape les deux.
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
    // Le serveur pousse dans l'ordre où il applique : priorité, effort,
    // objectif, puis catégories. La phrase suit ce même ordre plutôt qu'un tri
    // alphabétique, qui ne voudrait rien dire pour un lecteur.
    expect(
      describeEvent(smartFillEvent("effort,priority"), ctx, translators("fr")),
    ).toBe("a rempli l'effort, la priorité");
  });

  it("saute un nom de champ qu'il ne connaît pas", () => {
    // Un champ retiré du produit depuis : mieux vaut une phrase plus courte que
    // « a rempli priority, machin_truc » dans la timeline.
    expect(
      describeEvent(smartFillEvent("priority,inconnu"), ctx, translators("fr")),
    ).toBe("a rempli la priorité");
  });

  it("retombe sur « ses propriétés » quand la liste est vide ou illisible", () => {
    // Un vieil événement, ou une liste perdue : la ligne doit rester une phrase.
    expect(describeEvent(smartFillEvent(null), ctx, translators("fr"))).toBe(
      "a rempli ses propriétés",
    );
    expect(describeEvent(smartFillEvent(""), ctx, translators("en"))).toBe(
      "filled in its properties",
    );
  });

  it("ne dit rien de Smart-fill sur un événement ordinaire", () => {
    // Le champ `smart_fill` est le seul aiguillage — un changement de priorité
    // écrit à la main garde sa phrase à lui.
    const plain = {
      ...smartFillEvent("priority"),
      field: "priority",
      via_smart_fill: false,
      to_value: "high",
    } as unknown as IssueEvent;
    expect(describeEvent(plain, ctx, translators("fr"))).not.toContain("a rempli");
  });
});
