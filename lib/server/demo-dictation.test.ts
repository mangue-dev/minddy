import { beforeEach, describe, expect, it } from "vitest";

import {
  isSameOrigin,
  resetDailyBudget,
  resolveAudioFormat,
  resolveLocale,
  resolveTimeZone,
  sanitizeDemoTicket,
  withinDailyBudget,
  type DemoCategory,
  type DemoMember,
} from "./demo-dictation";

/**
 * MIN-150 — which keeps the dictation demo public.
 *
 * This is the only Minddy AI endpoint open to an anonymous visitor: its guards
 * are not implementation details, they are the feature. And his output
 * comes from an LLM, so nothing he says is true until you confront him with the scenery.
 */

const MEMBERS: DemoMember[] = [
  { id: "lea", name: "Léa Marchand" },
  { id: "thomas", name: "Thomas Berger" },
  { id: "sofia", name: "Sofia Haddad" },
];
const CATEGORIES: DemoCategory[] = [
  { id: "bug", name: "Bug" },
  { id: "feature", name: "Fonctionnalité" },
  { id: "design", name: "Design" },
];
const TODAY = "2026-08-02";

function ticket(raw: Record<string, unknown>, transcript = "Une phrase dictée.") {
  return sanitizeDemoTicket(raw, {
    transcript,
    today: TODAY,
    members: MEMBERS,
    categories: CATEGORIES,
  });
}

function post(headers: Record<string, string>): Request {
  return new Request("https://www.minddy.app/api/demo/dictate", {
    method: "POST",
    headers,
  });
}

describe("gardes d'entrée", () => {
  it("n'accepte que les POST venus d'une page de cet hôte", () => {
    expect(
      isSameOrigin(post({ origin: "https://www.minddy.app", host: "www.minddy.app" })),
    ).toBe(true);
    expect(
      isSameOrigin(post({ origin: "https://evil.example", host: "www.minddy.app" })),
    ).toBe(false);
    // A browser always places `Origin` on a POST: its absence is the
    // sign of a call that does not come from a page.
    expect(isSameOrigin(post({ host: "www.minddy.app" }))).toBe(false);
    expect(isSameOrigin(post({ origin: "pas-une-url", host: "www.minddy.app" }))).toBe(
      false,
    );
  });

  it("borne la journée, puis refuse tout", () => {
    resetDailyBudget();
    expect(withinDailyBudget(3)).toBe(true);
    expect(withinDailyBudget(3)).toBe(true);
    expect(withinDailyBudget(3)).toBe(true);
    expect(withinDailyBudget(3)).toBe(false);
    expect(withinDailyBudget(3)).toBe(false);
  });

  it("ne transcrit que des formats audio connus", () => {
    expect(resolveAudioFormat("audio/webm;codecs=opus")).toBe("webm");
    expect(resolveAudioFormat("audio/mp4")).toBe("m4a");
    expect(resolveAudioFormat("application/pdf")).toBeNull();
  });

  it("falls back to safe locale and time-zone values", () => {
    expect(resolveLocale("fr")).toBe("fr");
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("it")).toBe("it");
    expect(resolveLocale("es")).toBe("es");
    expect(resolveLocale(42)).toBe("en");
    expect(resolveTimeZone("Europe/Paris")).toBe("Europe/Paris");
    expect(resolveTimeZone("x".repeat(200))).toBe("UTC");
    expect(resolveTimeZone(undefined)).toBe("UTC");
  });
});

describe("ce que le modèle renvoie, ramené au décor", () => {
  beforeEach(() => resetDailyBudget());

  it("garde un ticket valide, portrait compris", () => {
    const result = ticket({
      title: "Corriger le paiement Stripe",
      description: "Le paiement échoue à la validation.",
      priority: "high",
      due_date: "2026-08-07",
      assignee: "lea",
      category: "bug",
    });

    expect(result.title).toBe("Corriger le paiement Stripe");
    expect(result.priority).toBe("high");
    expect(result.dueDate).toBe("2026-08-07");
    expect(result.assignee).toMatchObject({ id: "lea", name: "Léa Marchand" });
    expect(result.assignee?.avatar.startsWith("data:image/svg+xml")).toBe(true);
    expect(result.category).toEqual({ id: "bug", name: "Bug" });
  });

  it("jette un membre, une catégorie et une priorité inventés", () => {
    const result = ticket({
      title: "Titre",
      description: "",
      priority: "critique",
      due_date: null,
      assignee: "elon",
      category: "chantier",
    });

    expect(result.priority).toBe("none");
    expect(result.assignee).toBeNull();
    expect(result.category).toBeNull();
  });

  it("jette une échéance passée, absurde ou mal formée", () => {
    expect(ticket({ due_date: "2026-07-01" }).dueDate).toBeNull();
    expect(ticket({ due_date: "2030-01-01" }).dueDate).toBeNull();
    expect(ticket({ due_date: "vendredi" }).dueDate).toBeNull();
    expect(ticket({ due_date: 42 }).dueDate).toBeNull();
    // Today remains a valid deadline — “for today” is said.
    expect(ticket({ due_date: TODAY }).dueDate).toBe(TODAY);
  });

  it("ne rend jamais une carte sans titre", () => {
    // A model that did not know how to title should not produce a silent ticket: the
    // dictated sentence makes an acceptable title.
    expect(ticket({ title: "   " }, "Le bouton d'export ne répond plus").title).toBe(
      "Le bouton d'export ne répond plus",
    );
    expect(ticket({}, "Une phrase").title).toBe("Une phrase");
  });

  it("borne ce qui s'affiche", () => {
    const result = ticket({
      title: "T".repeat(400),
      description: "D".repeat(2000),
    });
    expect(result.title).toHaveLength(120);
    expect(result.description).toHaveLength(500);
  });
});
