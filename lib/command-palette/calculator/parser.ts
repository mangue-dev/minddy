/**
 * Calculator Parser
 *
 * Main orchestrator that tries different parsers in order:
 * 1. Date calculations (ajd + 3j)
 * 2. Unit conversions (5km en m)
 * 3. Percentage calculations (15% de 200)
 * 4. Math with abbreviations (10k + 5M)
 */

import type { CalculatorLocaleConfig, CalculationResult, MathResult } from "./types";
import { evaluateMath, isMathExpression, hasNaturalLanguageMath } from "./evaluator";
import { evaluateDate, isDateExpression } from "./date-parser";
import { evaluateConversion, isConversionExpression } from "./unit-converter";

// =============================================================================
// PERCENTAGE PARSER
// =============================================================================

/**
 * Check if expression is a percentage calculation
 */
function isPercentageExpression(
  expression: string,
  locale: CalculatorLocaleConfig
): boolean {
  const lower = expression.toLowerCase();

  // Check for "X% of Y" pattern
  const hasPercent = /%/.test(expression);
  const hasKeyword = locale.percentKeywords.some((kw) =>
    lower.includes(` ${kw.toLowerCase()} `)
  );

  return hasPercent && hasKeyword;
}

/**
 * Evaluate percentage calculation
 * Examples: "15% de 200", "20% of 150"
 */
function evaluatePercentage(
  expression: string,
  locale: CalculatorLocaleConfig
): MathResult {
  try {
    const lower = expression.toLowerCase();

    // Find the keyword
    let keyword: string | null = null;
    let keywordIndex = -1;
    for (const kw of locale.percentKeywords) {
      const idx = lower.indexOf(` ${kw.toLowerCase()} `);
      if (idx !== -1) {
        keyword = kw;
        keywordIndex = idx;
        break;
      }
    }

    if (!keyword || keywordIndex === -1) {
      return {
        type: "percentage",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: "No percentage keyword found",
      };
    }

    // Split expression
    const leftPart = expression.slice(0, keywordIndex).trim();
    const rightPart = expression.slice(keywordIndex + keyword.length + 2).trim();

    // Parse percentage (e.g., "15%")
    const percentMatch = leftPart.match(/([\d.,]+)\s*%/);
    if (!percentMatch) {
      return {
        type: "percentage",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: "Could not parse percentage",
      };
    }

    const percent = parseFloat(percentMatch[1].replace(",", "."));

    // Parse base value
    const baseResult = evaluateMath(rightPart, locale);
    if (!baseResult.success) {
      return {
        type: "percentage",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: "Could not parse base value",
      };
    }

    const result = (percent / 100) * baseResult.result;

    return {
      type: "percentage",
      expression,
      result,
      formatted: formatNumber(result),
      success: true,
    };
  } catch (error) {
    return {
      type: "percentage",
      expression,
      result: 0,
      formatted: "",
      success: false,
      error: error instanceof Error ? error.message : "Percentage calculation error",
    };
  }
}

/**
 * Format number for display
 */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e10) / 1e10;

  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString();
  }

  const decimalPlaces = Math.min(10, String(rounded).split(".")[1]?.length ?? 0);
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  });
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse and evaluate an expression
 * Tries different parsers in priority order
 */
export function parseExpression(
  expression: string,
  locale: CalculatorLocaleConfig,
  now: Date = new Date()
): CalculationResult | null {
  const trimmed = expression.trim();

  if (!trimmed) return null;

  // 1. Try date expressions first (most specific patterns)
  if (isDateExpression(trimmed, locale)) {
    const result = evaluateDate(trimmed, locale, now);
    if (result.success) return result;
  }

  // 2. Try unit conversions
  if (isConversionExpression(trimmed, locale)) {
    const result = evaluateConversion(trimmed, locale);
    if (result.success) return result;
  }

  // 3. Try percentage calculations
  if (isPercentageExpression(trimmed, locale)) {
    const result = evaluatePercentage(trimmed, locale);
    if (result.success) return result;
  }

  // 4. Try math expressions
  if (isMathExpression(trimmed, locale)) {
    const result = evaluateMath(trimmed, locale);
    if (result.success) return result;
  }

  return null;
}

/**
 * Check if an expression might be calculable
 * Quick check without full parsing
 * @param expression The expression to check
 * @param locale Optional locale config for natural language detection
 */
export function mightBeCalculation(
  expression: string,
  locale?: CalculatorLocaleConfig
): boolean {
  const trimmed = expression.trim();

  if (!trimmed || trimmed.length < 2) return false;

  // Check for numbers
  if (!/\d/.test(trimmed)) return false;

  // Check for math-like characters
  const hasMathChars = /[+\-*/^%()=]/.test(trimmed);

  // Check for common keywords
  const lower = trimmed.toLowerCase();
  const hasKeywords =
    /\b(de|of|to|in|en|vers|ajd|today|demain|tomorrow|hier|yesterday)\b/.test(lower);

  // Check for units
  const hasUnits = /\d\s*(km|m|cm|mm|kg|g|lb|oz|°?[cfk]|ml|l|gb|mb|kb)\b/i.test(trimmed);

  // Check for natural language math expressions using locale
  const hasNaturalMath = locale
    ? hasNaturalLanguageMath(trimmed, locale)
    : false;

  return hasMathChars || hasKeywords || hasUnits || hasNaturalMath || /^\d+$/.test(trimmed);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  evaluateMath,
  isMathExpression,
  hasNaturalLanguageMath,
} from "./evaluator";

export {
  evaluateDate,
  isDateExpression,
} from "./date-parser";

export {
  evaluateConversion,
  isConversionExpression,
} from "./unit-converter";

export {
  loadCalculatorLocale,
  getDefaultLocale,
} from "./locale-loader";

export type {
  CalculationType,
  CalculationResult,
  MathResult,
  DateResult,
  ConversionResult,
  CalculatorLocaleConfig,
} from "./types";
