import { describe, expect, it } from "vitest";
import {
  buildHomeBriefSystemPrompt,
  buildHomeBriefUserMessage,
  homeBriefCoverage,
  homeBriefDigest,
  keepKnownMentions,
  sanitizeHomeBrief,
  selectHomeBriefEntries,
  stripHomeBriefOpening,
  type HomeBriefEntry,
} from "./home-brief-prompt";

const ISSUE = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

function entry(overrides: Partial<HomeBriefEntry> = {}): HomeBriefEntry {
  return {
    id: "e1", age: "today", state: "open", seen: false, project: null,
    text: "PR #12 waits for your review.", closedReason: null, ...overrides,
  };
}

describe("stripHomeBriefOpening", () => {
  // The greeting above the word already greets and names the user (MIN-930).
  it.each([
    ["Bonjour Clément, MIN-42 attend votre relecture.", "Clément Guérin", "MIN-42 attend votre relecture."],
    ["Salut ! Deux tickets attendent.", "Clément", "Deux tickets attendent."],
    ["Hello, two issues wait for you.", "Camille Roy", "Two issues wait for you."],
    ["Hi Camille! Hey, the PR is merged.", "Camille Roy", "The PR is merged."],
    ["Guten Morgen Camille, zwei Tickets warten.", "Camille", "Zwei Tickets warten."],
    ["Hola Camille: dos incidencias te esperan.", "Camille", "Dos incidencias te esperan."],
    ["Buongiorno Camille — due ticket ti aspettano.", "Camille", "Due ticket ti aspettano."],
    ["Olá, Camille! Duas tarefas esperam por você.", "Camille", "Duas tarefas esperam por você."],
    ["Bom dia, a PR foi mesclada.", null, "A PR foi mesclada."],
    ["Camille, la relecture de MIN-42 est faite.", "Camille Roy", "La relecture de MIN-42 est faite."],
  ])("removes the opening of %j", (text, name, expected) => {
    expect(stripHomeBriefOpening(text, name)).toBe(expected);
  });

  it("keeps a sentence that only starts like a greeting or the name", () => {
    expect(stripHomeBriefOpening("Hier, j'ai trié MIN-42.", "Clément")).toBe("Hier, j'ai trié MIN-42.");
    expect(stripHomeBriefOpening("Oil prices are not an issue here.", null)).toBe("Oil prices are not an issue here.");
    expect(stripHomeBriefOpening("Camille Martin a commenté MIN-42.", "Camille Roy"))
      .toBe("Camille Martin a commenté MIN-42.");
  });
});

describe("keepKnownMentions", () => {
  it("turns a mention the journal never linked into its label", () => {
    const text = `[@MIN-42](mention:issue/${ISSUE}) and [@Secret](mention:page/${OTHER}) on [@](mention:date/2026-11-09)`;
    expect(keepKnownMentions(text, new Set([`issue:${ISSUE}`])))
      .toBe(`[@MIN-42](mention:issue/${ISSUE}) and Secret on [@](mention:date/2026-11-09)`);
  });
});

describe("sanitizeHomeBrief", () => {
  const known = new Set([`issue:${ISSUE}`]);

  it("stores mentions without labels and keeps clean suggestions", () => {
    const result = sanitizeHomeBrief({
      text: `Bonjour Camille, [@MIN-42](mention:issue/${ISSUE}) attend votre relecture.`,
      suggestions: [
        { label: "Relire [@MIN-42](mention:issue/" + ISSUE + ") [@demain](mention:date/2026-11-09)", prompt: `Résume [@MIN-42](mention:issue/${ISSUE})` },
        { label: "Relire MIN-42 demain", prompt: "duplicate label" },
        { label: "", prompt: "empty label" },
        { label: "Oui, fais-le seul désormais", prompt: "Oui, trie seul les retours désormais." },
        { label: "Too many", prompt: "a" }, { label: "Still too many", prompt: "b" },
      ],
    }, { name: "Camille", knownMentions: known });
    expect(result?.content).toBe(`[@](mention:issue/${ISSUE}) attend votre relecture.`);
    expect(result?.suggestions).toEqual([
      { label: "Relire MIN-42 demain", prompt: `Résume [@](mention:issue/${ISSUE})` },
      { label: "Oui, fais-le seul désormais", prompt: "Oui, trie seul les retours désormais." },
      { label: "Too many", prompt: "a" },
      { label: "Still too many", prompt: "b" },
    ]);
  });

  it("cuts an over-long text at a sentence, and refuses one without any", () => {
    const sentence = "A".repeat(600) + ". ";
    expect(sanitizeHomeBrief({ text: sentence + sentence, suggestions: [] },
      { name: null, knownMentions: known })?.content).toBe("A".repeat(600) + ".");
    expect(sanitizeHomeBrief({ text: "A".repeat(1_200), suggestions: [] },
      { name: null, knownMentions: known })).toBeNull();
    expect(sanitizeHomeBrief({ text: 42 }, { name: null, knownMentions: known })).toBeNull();
  });
});

describe("prompt and selection", () => {
  it("puts open entries first and shows what the user saw", () => {
    const settled = entry({ id: "e2", state: "settled", text: "MIN-7 was answered.", closedReason: "The client replied." });
    const open = entry({ id: "e1", seen: true });
    expect(selectHomeBriefEntries([settled, open]).map((item) => item.id)).toEqual(["e1", "e2"]);
    const message = buildHomeBriefUserMessage({ name: "Camille Roy", entries: [open, settled], memories: [] });
    expect(message).toContain("still open, seen) PR #12");
    expect(message).toContain("settled, not seen yet) MIN-7 was answered. (settled because: The client replied.)");
    expect(message).toContain("Name: Camille Roy");
  });

  it("states the language and the greeting it continues", () => {
    const prompt = buildHomeBriefSystemPrompt({ locale: "fr", greetings: ["Bonjour, Camille"] });
    expect(prompt).toContain("French");
    expect(prompt).toContain("\"Bonjour, Camille\"");
    expect(prompt).toContain("Never open with a greeting");
  });

  it("changes the digest only when the covered entries or their state change", () => {
    const a = homeBriefDigest([entry({ id: "a" }), entry({ id: "b" })]);
    expect(homeBriefDigest([entry({ id: "b" }), entry({ id: "a", seen: true })])).toBe(a);
    expect(homeBriefDigest([entry({ id: "a" }), entry({ id: "b", state: "settled" })])).not.toBe(a);
    expect(homeBriefDigest([entry({ id: "a" })])).not.toBe(a);
  });
});

describe("homeBriefCoverage", () => {
  const brief = {
    journal_entry_ids: ["a", "b"],
    journal_digest: homeBriefDigest([{ id: "a", state: "open" }, { id: "b", state: "settled" }]),
  };
  const now = Date.parse("2026-11-08T12:00:00.000Z");
  const ttl = 10 * 60_000;
  const recent = "2026-11-08T11:58:00.000Z";
  const old = "2026-11-08T10:00:00.000Z";

  it("tells a current word from an outdated, empty or stale one", () => {
    expect(homeBriefCoverage(brief, [{ id: "a", closed_at: null, seen_at: null },
      { id: "b", closed_at: old, seen_at: null }], now, ttl)).toBe("current");
    // A covered entry was closed since, or is gone.
    expect(homeBriefCoverage(brief, [{ id: "a", closed_at: old, seen_at: null },
      { id: "b", closed_at: old, seen_at: null }], now, ttl)).toBe("outdated");
    expect(homeBriefCoverage(brief, [{ id: "a", closed_at: null, seen_at: null }], now, ttl)).toBe("outdated");
    // Seen a moment ago: still the word the user is reading.
    expect(homeBriefCoverage(brief, [{ id: "a", closed_at: null, seen_at: recent },
      { id: "b", closed_at: old, seen_at: recent }], now, ttl)).toBe("current");
    expect(homeBriefCoverage(brief, [{ id: "a", closed_at: null, seen_at: old },
      { id: "b", closed_at: old, seen_at: old }], now, ttl)).toBe("stale_news");
    const settledOnly = { journal_entry_ids: ["b"], journal_digest: homeBriefDigest([{ id: "b", state: "settled" }]) };
    expect(homeBriefCoverage(settledOnly, [{ id: "b", closed_at: old, seen_at: recent }], now, ttl)).toBe("empty");
  });
});
