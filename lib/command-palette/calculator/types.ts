/**
 * Calculator Types
 *
 * Type definitions for the advanced calculator system.
 */

// =============================================================================
// RESULT TYPES
// =============================================================================

/** Type of calculation performed */
export type CalculationType = "math" | "date" | "conversion" | "percentage";

/** Base calculation result */
export interface CalculationResult {
  /** Type of calculation */
  type: CalculationType;
  /** Original expression */
  expression: string;
  /** Calculated result */
  result: string | number | Date;
  /** Formatted result for display */
  formatted: string;
  /** Whether calculation was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Math calculation result */
export interface MathResult extends CalculationResult {
  type: "math" | "percentage";
  result: number;
}

/** Date calculation result */
export interface DateResult extends CalculationResult {
  type: "date";
  result: Date;
  /** Duration in days (for date differences) */
  durationDays?: number;
}

/** Unit conversion result */
export interface ConversionResult extends CalculationResult {
  type: "conversion";
  result: number;
  /** Source unit */
  fromUnit: string;
  /** Target unit */
  toUnit: string;
  /** Source value */
  fromValue: number;
}

// =============================================================================
// LOCALE CONFIG
// =============================================================================

/** Calculator locale configuration from i18n */
export interface CalculatorLocaleConfig {
  /** Keywords for percentage calculations (e.g., "de", "of") */
  percentKeywords: string[];
  /** Keywords for "today" */
  today: string[];
  /** Keywords for "tomorrow" */
  tomorrow: string[];
  /** Keywords for "yesterday" */
  yesterday: string[];
  /** Keywords for days */
  days: string[];
  /** Keywords for weeks */
  weeks: string[];
  /** Keywords for months */
  months: string[];
  /** Keywords for years */
  years: string[];
  /** Number multipliers (k=1000, M=1000000) */
  multipliers: Record<string, number>;
  /** Keywords for conversion (e.g., "to", "in") */
  conversionKeywords: string[];
  /** Date format (e.g., "DD/MM/YYYY") */
  dateFormat: string;
  /** Date separators (e.g., "/", "-", ".") */
  dateSeparators: string[];
  /** Decimal separator */
  decimalSeparator?: string;
  /** Thousands separator */
  thousandsSeparator?: string;
  /** Natural language expressions for math operations */
  naturalLanguage?: {
    /** Square root expressions (e.g., "racine carrée de", "square root of") */
    squareRoot?: string[];
    /** Square expressions (e.g., "au carré", "squared") */
    square?: string[];
    /** Cube expressions (e.g., "au cube", "cubed") */
    cube?: string[];
    /** Power expressions (e.g., "puissance", "to the power of") */
    power?: string[];
    /** Cosine expressions (e.g., "cosinus de", "cosine of") */
    cosine?: string[];
    /** Sine expressions (e.g., "sinus de", "sine of") */
    sine?: string[];
    /** Tangent expressions (e.g., "tangente de", "tangent of") */
    tangent?: string[];
    /** Logarithm expressions (e.g., "logarithme de", "logarithm of") */
    logarithm?: string[];
    /** Absolute value expressions (e.g., "valeur absolue de", "absolute value of") */
    absoluteValue?: string[];
  };
}

// =============================================================================
// UNIT TYPES
// =============================================================================

/** Unit category */
export type UnitCategory = "length" | "weight" | "time" | "data" | "temperature" | "area" | "volume";

/** Unit definition */
export interface UnitDefinition {
  /** Unit category */
  category: UnitCategory;
  /** Canonical name */
  name: string;
  /** Alternative names/abbreviations */
  aliases: string[];
  /** Conversion factor to base unit */
  factor: number;
  /** Base unit for this category */
  isBase?: boolean;
}

// =============================================================================
// PARSER TYPES
// =============================================================================

/** Token types for parsing */
export type TokenType =
  | "number"
  | "operator"
  | "parenthesis"
  | "function"
  | "unit"
  | "date"
  | "keyword"
  | "whitespace";

/** Parsed token */
export interface Token {
  type: TokenType;
  value: string;
  raw: string;
  position: number;
}

/** Parser context */
export interface ParserContext {
  /** Locale configuration */
  locale: CalculatorLocaleConfig;
  /** Current date (for relative date calculations) */
  now: Date;
}
