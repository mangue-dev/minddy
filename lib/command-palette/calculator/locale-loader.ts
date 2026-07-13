/**
 * Locale Loader
 *
 * Provides built-in calculator locale configurations (EN/FR) and a merge
 * helper so host apps can override any subset of keywords/formats.
 */

import type { CalculatorLocaleConfig } from "./types";

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

export const CALCULATOR_LOCALE_EN: CalculatorLocaleConfig = {
  percentKeywords: ["of", "out of"],
  today: ["today"],
  tomorrow: ["tomorrow"],
  yesterday: ["yesterday"],
  days: ["d", "day", "days"],
  weeks: ["w", "week", "weeks"],
  months: ["mo", "month", "months"],
  years: ["y", "year", "years"],
  multipliers: { k: 1000, M: 1000000, B: 1000000000, T: 1000000000000 },
  conversionKeywords: ["to", "in"],
  dateFormat: "MM/DD/YYYY",
  dateSeparators: ["/", "-", "."],
  decimalSeparator: ".",
  thousandsSeparator: ",",
  naturalLanguage: {
    squareRoot: ["square root of", "sqrt of"],
    square: ["squared", "square of"],
    cube: ["cubed", "cube of"],
    power: ["to the power of", "power"],
    cosine: ["cosine of"],
    sine: ["sine of"],
    tangent: ["tangent of"],
    logarithm: ["logarithm of", "log of"],
    absoluteValue: ["absolute value of"],
  },
};

export const CALCULATOR_LOCALE_FR: CalculatorLocaleConfig = {
  percentKeywords: ["de", "sur"],
  today: ["ajd", "aujourd'hui", "aujourdhui"],
  tomorrow: ["demain"],
  yesterday: ["hier"],
  days: ["j", "jour", "jours"],
  weeks: ["sem", "semaine", "semaines"],
  months: ["mois"],
  years: ["an", "ans", "année", "années"],
  multipliers: { k: 1000, M: 1000000, Md: 1000000000, G: 1000000000 },
  conversionKeywords: ["en", "vers"],
  dateFormat: "DD/MM/YYYY",
  dateSeparators: ["/", "-", "."],
  decimalSeparator: ",",
  thousandsSeparator: " ",
  naturalLanguage: {
    squareRoot: ["racine carrée de", "racine carree de", "racine de"],
    square: ["au carré", "au carre", "carré de", "carre de"],
    cube: ["au cube", "cube de"],
    power: ["puissance", "à la puissance", "a la puissance"],
    cosine: ["cosinus de"],
    sine: ["sinus de"],
    tangent: ["tangente de"],
    logarithm: ["logarithme de", "log de"],
    absoluteValue: ["valeur absolue de"],
  },
};

// =============================================================================
// LOADER
// =============================================================================

/**
 * Get the default calculator locale for a language code ("fr", "fr-FR", "en"…).
 */
export function getDefaultLocale(languageCode: string): CalculatorLocaleConfig {
  if (languageCode.startsWith("fr")) {
    return { ...CALCULATOR_LOCALE_FR };
  }
  return { ...CALCULATOR_LOCALE_EN };
}

/**
 * Build a calculator locale config: language defaults merged with overrides.
 */
export function loadCalculatorLocale(
  languageCode?: string,
  overrides?: Partial<CalculatorLocaleConfig>
): CalculatorLocaleConfig {
  const defaults = getDefaultLocale(languageCode ?? "en");

  if (!overrides) {
    return defaults;
  }

  return {
    ...defaults,
    ...overrides,
    naturalLanguage: overrides.naturalLanguage ?? defaults.naturalLanguage,
  };
}
