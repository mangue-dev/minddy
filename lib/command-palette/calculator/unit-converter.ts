/**
 * Unit Converter
 *
 * Converts between different units of measurement.
 * Supports: length, weight, time, data, temperature, area, volume.
 */

import type { CalculatorLocaleConfig, ConversionResult, UnitDefinition } from "./types";

// =============================================================================
// UNIT DEFINITIONS
// =============================================================================

const UNITS: UnitDefinition[] = [
  // === LENGTH ===
  { category: "length", name: "meter", aliases: ["m", "meter", "meters", "mètre", "mètres"], factor: 1, isBase: true },
  { category: "length", name: "kilometer", aliases: ["km", "kilometer", "kilometers", "kilomètre", "kilomètres"], factor: 1000 },
  { category: "length", name: "centimeter", aliases: ["cm", "centimeter", "centimeters", "centimètre", "centimètres"], factor: 0.01 },
  { category: "length", name: "millimeter", aliases: ["mm", "millimeter", "millimeters", "millimètre", "millimètres"], factor: 0.001 },
  { category: "length", name: "mile", aliases: ["mi", "mile", "miles"], factor: 1609.344 },
  { category: "length", name: "yard", aliases: ["yd", "yard", "yards"], factor: 0.9144 },
  { category: "length", name: "foot", aliases: ["ft", "foot", "feet", "pied", "pieds"], factor: 0.3048 },
  { category: "length", name: "inch", aliases: ["in", "inch", "inches", "pouce", "pouces"], factor: 0.0254 },

  // === WEIGHT ===
  { category: "weight", name: "kilogram", aliases: ["kg", "kilogram", "kilograms", "kilogramme", "kilogrammes"], factor: 1, isBase: true },
  { category: "weight", name: "gram", aliases: ["g", "gram", "grams", "gramme", "grammes"], factor: 0.001 },
  { category: "weight", name: "milligram", aliases: ["mg", "milligram", "milligrams", "milligramme", "milligrammes"], factor: 0.000001 },
  { category: "weight", name: "pound", aliases: ["lb", "lbs", "pound", "pounds", "livre", "livres"], factor: 0.453592 },
  { category: "weight", name: "ounce", aliases: ["oz", "ounce", "ounces", "once", "onces"], factor: 0.0283495 },
  { category: "weight", name: "ton", aliases: ["t", "ton", "tons", "tonne", "tonnes"], factor: 1000 },

  // === TIME ===
  { category: "time", name: "second", aliases: ["s", "sec", "second", "seconds", "seconde", "secondes"], factor: 1, isBase: true },
  { category: "time", name: "minute", aliases: ["min", "minute", "minutes"], factor: 60 },
  { category: "time", name: "hour", aliases: ["h", "hr", "hour", "hours", "heure", "heures"], factor: 3600 },
  { category: "time", name: "day", aliases: ["d", "day", "days", "jour", "jours"], factor: 86400 },
  { category: "time", name: "week", aliases: ["w", "week", "weeks", "semaine", "semaines"], factor: 604800 },
  { category: "time", name: "month", aliases: ["mo", "month", "months", "mois"], factor: 2592000 }, // 30 days
  { category: "time", name: "year", aliases: ["y", "yr", "year", "years", "an", "ans", "année", "années"], factor: 31536000 }, // 365 days

  // === DATA ===
  { category: "data", name: "byte", aliases: ["b", "byte", "bytes", "octet", "octets"], factor: 1, isBase: true },
  { category: "data", name: "kilobyte", aliases: ["kb", "kilobyte", "kilobytes", "ko", "kilo-octet", "kilo-octets"], factor: 1024 },
  { category: "data", name: "megabyte", aliases: ["mb", "megabyte", "megabytes", "mo", "méga-octet", "méga-octets"], factor: 1048576 },
  { category: "data", name: "gigabyte", aliases: ["gb", "gigabyte", "gigabytes", "go", "giga-octet", "giga-octets"], factor: 1073741824 },
  { category: "data", name: "terabyte", aliases: ["tb", "terabyte", "terabytes", "to", "téra-octet", "téra-octets"], factor: 1099511627776 },
  { category: "data", name: "bit", aliases: ["bit", "bits"], factor: 0.125 },

  // === TEMPERATURE (special handling) ===
  { category: "temperature", name: "celsius", aliases: ["c", "°c", "celsius", "degc"], factor: 1, isBase: true },
  { category: "temperature", name: "fahrenheit", aliases: ["f", "°f", "fahrenheit", "degf"], factor: 1 },
  { category: "temperature", name: "kelvin", aliases: ["k", "kelvin"], factor: 1 },

  // === AREA ===
  { category: "area", name: "square_meter", aliases: ["m2", "m²", "sqm", "square meter", "mètre carré"], factor: 1, isBase: true },
  { category: "area", name: "square_kilometer", aliases: ["km2", "km²", "sqkm", "square kilometer", "kilomètre carré"], factor: 1000000 },
  { category: "area", name: "hectare", aliases: ["ha", "hectare", "hectares"], factor: 10000 },
  { category: "area", name: "acre", aliases: ["ac", "acre", "acres"], factor: 4046.86 },
  { category: "area", name: "square_foot", aliases: ["ft2", "ft²", "sqft", "square foot", "pied carré"], factor: 0.092903 },

  // === VOLUME ===
  { category: "volume", name: "liter", aliases: ["l", "liter", "liters", "litre", "litres"], factor: 1, isBase: true },
  { category: "volume", name: "milliliter", aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"], factor: 0.001 },
  { category: "volume", name: "gallon", aliases: ["gal", "gallon", "gallons"], factor: 3.78541 },
  { category: "volume", name: "quart", aliases: ["qt", "quart", "quarts"], factor: 0.946353 },
  { category: "volume", name: "pint", aliases: ["pt", "pint", "pints"], factor: 0.473176 },
  { category: "volume", name: "cup", aliases: ["cup", "cups", "tasse", "tasses"], factor: 0.236588 },
  { category: "volume", name: "cubic_meter", aliases: ["m3", "m³", "cubic meter", "mètre cube"], factor: 1000 },
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Find a unit by alias
 */
function findUnit(alias: string): UnitDefinition | null {
  const lower = alias.toLowerCase().trim();
  return UNITS.find((u) => u.aliases.some((a) => a.toLowerCase() === lower)) ?? null;
}

/**
 * Convert temperature (special case)
 */
function convertTemperature(value: number, from: string, to: string): number {
  // Normalize to Celsius first
  let celsius: number;
  if (from === "celsius") {
    celsius = value;
  } else if (from === "fahrenheit") {
    celsius = (value - 32) * (5 / 9);
  } else if (from === "kelvin") {
    celsius = value - 273.15;
  } else {
    return value;
  }

  // Convert from Celsius to target
  if (to === "celsius") {
    return celsius;
  } else if (to === "fahrenheit") {
    return celsius * (9 / 5) + 32;
  } else if (to === "kelvin") {
    return celsius + 273.15;
  }

  return value;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if expression looks like a unit conversion
 */
export function isConversionExpression(
  expression: string,
  locale: CalculatorLocaleConfig
): boolean {
  const lower = expression.toLowerCase();

  // Check for conversion keywords (e.g., "to", "in", "en", "vers")
  const hasKeyword = locale.conversionKeywords.some((kw) =>
    lower.includes(` ${kw.toLowerCase()} `)
  );

  if (!hasKeyword) return false;

  // Check for number and unit patterns
  return /\d+\s*[a-zéèêëàâäùûüôöîïç²³]+/i.test(expression);
}

/**
 * Evaluate a unit conversion expression
 */
export function evaluateConversion(
  expression: string,
  locale: CalculatorLocaleConfig
): ConversionResult {
  try {
    const lower = expression.toLowerCase();

    // Find conversion keyword
    let keyword: string | null = null;
    let keywordIndex = -1;
    for (const kw of locale.conversionKeywords) {
      const idx = lower.indexOf(` ${kw.toLowerCase()} `);
      if (idx !== -1) {
        keyword = kw;
        keywordIndex = idx;
        break;
      }
    }

    if (!keyword || keywordIndex === -1) {
      return {
        type: "conversion",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: "No conversion keyword found",
        fromUnit: "",
        toUnit: "",
        fromValue: 0,
      };
    }

    // Split expression
    const leftPart = expression.slice(0, keywordIndex).trim();
    const rightPart = expression.slice(keywordIndex + keyword.length + 2).trim();

    // Parse left part: "5 km" or "5km"
    const valueMatch = leftPart.match(/^([\d.,]+)\s*([a-zéèêëàâäùûüôöîïç²³]+)$/i);
    if (!valueMatch) {
      return {
        type: "conversion",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: "Could not parse value and unit",
        fromUnit: "",
        toUnit: "",
        fromValue: 0,
      };
    }

    const [, valueStr, fromUnitStr] = valueMatch;
    const value = parseFloat(valueStr.replace(",", "."));
    const toUnitStr = rightPart;

    // Find units
    const fromUnit = findUnit(fromUnitStr);
    const toUnit = findUnit(toUnitStr);

    if (!fromUnit) {
      return {
        type: "conversion",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: `Unknown unit: ${fromUnitStr}`,
        fromUnit: fromUnitStr,
        toUnit: toUnitStr,
        fromValue: value,
      };
    }

    if (!toUnit) {
      return {
        type: "conversion",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: `Unknown unit: ${toUnitStr}`,
        fromUnit: fromUnitStr,
        toUnit: toUnitStr,
        fromValue: value,
      };
    }

    // Check same category
    if (fromUnit.category !== toUnit.category) {
      return {
        type: "conversion",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: `Cannot convert ${fromUnit.category} to ${toUnit.category}`,
        fromUnit: fromUnitStr,
        toUnit: toUnitStr,
        fromValue: value,
      };
    }

    // Convert
    let result: number;
    if (fromUnit.category === "temperature") {
      result = convertTemperature(value, fromUnit.name, toUnit.name);
    } else {
      // Convert to base unit, then to target unit
      const baseValue = value * fromUnit.factor;
      result = baseValue / toUnit.factor;
    }

    // Format result
    const formatted = formatConversionResult(result, toUnitStr);

    return {
      type: "conversion",
      expression,
      result,
      formatted,
      success: true,
      fromUnit: fromUnitStr,
      toUnit: toUnitStr,
      fromValue: value,
    };
  } catch (error) {
    return {
      type: "conversion",
      expression,
      result: 0,
      formatted: "",
      success: false,
      error: error instanceof Error ? error.message : "Conversion error",
      fromUnit: "",
      toUnit: "",
      fromValue: 0,
    };
  }
}

/**
 * Format a conversion result
 */
function formatConversionResult(value: number, unit: string): string {
  // Round to appropriate precision
  let formatted: string;
  if (Math.abs(value) >= 100) {
    formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else if (Math.abs(value) >= 1) {
    formatted = value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } else {
    formatted = value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  }

  return `${formatted} ${unit}`;
}

/**
 * Get all supported units
 */
export function getSupportedUnits(): UnitDefinition[] {
  return [...UNITS];
}
