import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/config";
import { STRINGS_DE, STRINGS_EN, STRINGS_ES, STRINGS_FR, STRINGS_IT, STRINGS_PT, createTranslate } from "./i18n";

describe("command palette strings", () => {
  it.each(Object.entries({ fr: STRINGS_FR, de: STRINGS_DE, es: STRINGS_ES, it: STRINGS_IT, pt: STRINGS_PT }))(
    "defines every palette string in %s",
    (_language, strings) => {
      expect(Object.keys(strings).sort()).toEqual(Object.keys(STRINGS_EN).sort());
    },
  );

  it.each(locales.filter((locale) => locale !== "en"))("does not fall back to English in %s", (locale) => {
    expect(createTranslate(locale)("search.placeholder")).not.toBe(STRINGS_EN["search.placeholder"]);
  });
});
