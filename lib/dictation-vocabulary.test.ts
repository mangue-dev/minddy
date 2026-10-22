import { describe, expect, it } from "vitest";

import {
  applyVocabularyReplacements,
  MAX_VOCABULARY_ENTRIES,
  MAX_VOCABULARY_TERM_CHARS,
  parseVocabularyField,
  resolveDictationVocabulary,
  sanitizeVocabulary,
  vocabularyTerms,
} from "@/lib/dictation-vocabulary";

describe("dictation vocabulary (MIN-773)", () => {
  it("normalizes, drops unusable entries and keeps a replacement only when it differs", () => {
    expect(sanitizeVocabulary([
      { term: "  Minddy  " },
      { term: "Numo", heardAs: "new mo" },
      { term: "Léa", heardAs: "léa" },
      { term: "line\nbreak" },
      { term: "..." },
      "nope",
      { heardAs: "orphan" },
    ])).toEqual([
      { term: "Minddy" },
      { term: "Numo", heardAs: "new mo" },
      { term: "Léa" },
      { term: "line break" },
    ]);
  });

  it("dedupes case-insensitively and caps the list and each term", () => {
    const long = "x".repeat(MAX_VOCABULARY_TERM_CHARS + 10);
    expect(sanitizeVocabulary([{ term: long }])[0].term).toHaveLength(MAX_VOCABULARY_TERM_CHARS);
    expect(sanitizeVocabulary([{ term: "Minddy" }, { term: "minddy" }])).toHaveLength(1);
    const many = Array.from({ length: MAX_VOCABULARY_ENTRIES + 5 }, (_, i) => ({ term: `term ${i}` }));
    expect(sanitizeVocabulary(many)).toHaveLength(MAX_VOCABULARY_ENTRIES);
  });

  it("reads the stored list and the request field, refusing a malformed field", () => {
    expect(resolveDictationVocabulary({ dictation_vocabulary: [{ term: "Minddy" }] })).toEqual([{ term: "Minddy" }]);
    expect(resolveDictationVocabulary(undefined)).toEqual([]);
    expect(parseVocabularyField('[{"term":"Numo"}]')).toEqual([{ term: "Numo" }]);
    expect(parseVocabularyField("{not json")).toBeNull();
    expect(parseVocabularyField(null)).toBeNull();
  });

  it("replaces whole words only, whatever their case, and keeps the term's spelling", () => {
    const vocabulary = [{ term: "Minddy", heardAs: "mindy" }];
    expect(applyVocabularyReplacements("Mindy et MINDY, pas mindyland.", vocabulary))
      .toBe("Minddy et Minddy, pas mindyland.");
  });

  it("treats accented letters as word characters and matches phrases across spacing", () => {
    expect(applyVocabularyReplacements("le café et cafés", [{ term: "Kafé", heardAs: "café" }]))
      .toBe("le Kafé et cafés");
    expect(applyVocabularyReplacements("ask new  mo now", [{ term: "Numo", heardAs: "new mo" }]))
      .toBe("ask Numo now");
  });

  it("applies the longer phrase first and leaves spelling-only entries alone", () => {
    const vocabulary = [
      { term: "Numo", heardAs: "new mo" },
      { term: "Numo app", heardAs: "new mo app" },
      { term: "Minddy" },
    ];
    expect(applyVocabularyReplacements("open the new mo app, then new mo", vocabulary))
      .toBe("open the Numo app, then Numo");
    expect(vocabularyTerms(vocabulary)).toEqual(["Numo", "Numo app", "Minddy"]);
  });

  it("escapes regular-expression characters in what is heard", () => {
    expect(applyVocabularyReplacements("c++ and c", [{ term: "C++", heardAs: "c++" }]))
      .toBe("C++ and c");
  });
});
