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
 * MIN-150 — ce qui tient la démo de dictée publique.
 *
 * C'est le seul endpoint IA de minddy ouvert à un visiteur anonyme : ses gardes
 * ne sont pas des détails d'implémentation, ce sont la feature. Et sa sortie
 * vient d'un LLM, donc rien de ce qu'il dit n'est vrai tant qu'on ne l'a pas
 * confronté au décor.
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
    // Un navigateur pose toujours `Origin` sur un POST : son absence est le
    // signe d'un appel qui ne vient pas d'une page.
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

  it("retombe sur des valeurs sûres pour la langue et le fuseau", () => {
    expect(resolveLocale("fr")).toBe("fr");
    expect(resolveLocale("de")).toBe("en");
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
    // Aujourd'hui reste une échéance valable — « pour aujourd'hui » se dit.
    expect(ticket({ due_date: TODAY }).dueDate).toBe(TODAY);
  });

  it("ne rend jamais une carte sans titre", () => {
    // Un modèle qui n'a pas su titrer ne doit pas produire un ticket muet : la
    // phrase dictée fait un titre acceptable.
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
