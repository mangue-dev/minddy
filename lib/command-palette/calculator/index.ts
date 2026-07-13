/**
 * Calculator feature - public exports
 *
 * A self-contained smart calculator supporting:
 * - Math expressions with scientific functions (sqrt, trig, log, factorial, gcd…)
 * - Natural language math ("racine carrée de 16", "5 squared")
 * - Date arithmetic ("ajd + 3j", "today + 2 weeks", "12/06 - 3j")
 * - Unit conversions ("5km to m", "20°C en °F", "2GB in MB")
 * - Percentages ("15% de 200", "20% of 150")
 * - Number multipliers ("10k + 5M")
 */

export {
  parseExpression,
  mightBeCalculation,
  evaluateMath,
  isMathExpression,
  hasNaturalLanguageMath,
  evaluateDate,
  isDateExpression,
  evaluateConversion,
  isConversionExpression,
} from "./parser";

export {
  loadCalculatorLocale,
  getDefaultLocale,
  CALCULATOR_LOCALE_EN,
  CALCULATOR_LOCALE_FR,
} from "./locale-loader";

export type {
  CalculationType,
  CalculationResult,
  MathResult,
  DateResult,
  ConversionResult,
  CalculatorLocaleConfig,
} from "./types";
