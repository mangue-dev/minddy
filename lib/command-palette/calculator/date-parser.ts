/**
 * Date Parser
 *
 * Parses and calculates date expressions.
 * Supports: relative dates (today, tomorrow), arithmetic (today + 3 days),
 * and date parsing in locale format.
 */

import type { CalculatorLocaleConfig, DateResult } from "./types";

// =============================================================================
// HELPERS
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add weeks to a date
 */
function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/**
 * Add months to a date
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Add years to a date
 */
function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Calculate difference in days between two dates
 */
function diffInDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/**
 * Format a date according to locale
 */
function formatDate(date: Date, format: string): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString();

  return format
    .replace("DD", day)
    .replace("MM", month)
    .replace("YYYY", year)
    .replace("YY", year.slice(-2));
}

// =============================================================================
// PARSER
// =============================================================================

interface DateParseContext {
  locale: CalculatorLocaleConfig;
  now: Date;
}

/**
 * Parse a relative date keyword
 */
function parseRelativeDate(word: string, ctx: DateParseContext): Date | null {
  const lower = word.toLowerCase().trim();

  // Today
  if (ctx.locale.today.some((t) => lower === t.toLowerCase())) {
    return new Date(ctx.now);
  }

  // Tomorrow
  if (ctx.locale.tomorrow.some((t) => lower === t.toLowerCase())) {
    return addDays(ctx.now, 1);
  }

  // Yesterday
  if (ctx.locale.yesterday.some((t) => lower === t.toLowerCase())) {
    return addDays(ctx.now, -1);
  }

  return null;
}

/**
 * Parse a duration keyword (e.g., "3j", "2 semaines")
 */
function parseDuration(
  value: number,
  unit: string,
  ctx: DateParseContext
): { days: number } | null {
  const lower = unit.toLowerCase();

  // Days
  if (ctx.locale.days.some((d) => lower === d.toLowerCase())) {
    return { days: value };
  }

  // Weeks
  if (ctx.locale.weeks.some((w) => lower === w.toLowerCase())) {
    return { days: value * 7 };
  }

  // Months (approximate as 30 days)
  if (ctx.locale.months.some((m) => lower === m.toLowerCase())) {
    return { days: value * 30 };
  }

  // Years (approximate as 365 days)
  if (ctx.locale.years.some((y) => lower === y.toLowerCase())) {
    return { days: value * 365 };
  }

  return null;
}

/**
 * Parse a date string (e.g., "25/12/2024")
 */
function parseDateString(str: string, ctx: DateParseContext): Date | null {
  const { dateFormat, dateSeparators } = ctx.locale;

  // Find separator used
  const separator = dateSeparators.find((s) => str.includes(s));
  if (!separator) return null;

  const parts = str.split(separator).map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  // Determine order from format
  const formatParts = dateFormat.split(/[\/\-\.]/);
  let day = 1,
    month = 1,
    year = new Date().getFullYear();

  formatParts.forEach((part, i) => {
    if (part.startsWith("D")) day = parts[i];
    else if (part.startsWith("M")) month = parts[i];
    else if (part.startsWith("Y")) {
      year = parts[i];
      // Handle 2-digit year
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
    }
  });

  // Validate
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if expression looks like a date expression
 */
export function isDateExpression(
  expression: string,
  locale: CalculatorLocaleConfig
): boolean {
  const lower = expression.toLowerCase();

  // Check for relative date keywords
  const hasRelative =
    locale.today.some((t) => lower.includes(t.toLowerCase())) ||
    locale.tomorrow.some((t) => lower.includes(t.toLowerCase())) ||
    locale.yesterday.some((t) => lower.includes(t.toLowerCase()));

  if (hasRelative) return true;

  // Check for duration keywords
  const hasDuration =
    locale.days.some((d) => lower.includes(d.toLowerCase())) ||
    locale.weeks.some((w) => lower.includes(w.toLowerCase())) ||
    locale.months.some((m) => lower.includes(m.toLowerCase())) ||
    locale.years.some((y) => lower.includes(y.toLowerCase()));

  if (hasDuration && /\d/.test(expression)) return true;

  // Check for date format (e.g., 25/12/2024)
  const hasDateFormat = locale.dateSeparators.some((sep) => {
    const regex = new RegExp(`\\d{1,4}\\${sep}\\d{1,2}\\${sep}\\d{1,4}`);
    return regex.test(expression);
  });

  return hasDateFormat;
}

/**
 * Evaluate a date expression
 */
export function evaluateDate(
  expression: string,
  locale: CalculatorLocaleConfig,
  now: Date = new Date()
): DateResult {
  const ctx: DateParseContext = { locale, now };

  try {
    // Normalize expression
    const normalized = expression.toLowerCase().trim();

    // Try to parse as simple relative date
    const relativeDate = parseRelativeDate(normalized, ctx);
    if (relativeDate) {
      return {
        type: "date",
        expression,
        result: relativeDate,
        formatted: formatDate(relativeDate, locale.dateFormat),
        success: true,
      };
    }

    // Try to parse as date string
    const dateString = parseDateString(normalized, ctx);
    if (dateString && !normalized.includes("+") && !normalized.includes("-")) {
      return {
        type: "date",
        expression,
        result: dateString,
        formatted: formatDate(dateString, locale.dateFormat),
        success: true,
      };
    }

    // Try to parse as date arithmetic (e.g., "today + 3 days")
    const arithmeticMatch = normalized.match(
      /(.+?)\s*([+\-])\s*(\d+)\s*([a-zéèêëàâäùûüôöîïç]+)/i
    );

    if (arithmeticMatch) {
      const [, basePart, operator, numStr, unitPart] = arithmeticMatch;
      const num = parseInt(numStr, 10);
      const multiplier = operator === "-" ? -1 : 1;

      // Parse base date
      let baseDate = parseRelativeDate(basePart.trim(), ctx);
      if (!baseDate) {
        baseDate = parseDateString(basePart.trim(), ctx);
      }
      if (!baseDate) {
        return {
          type: "date",
          expression,
          result: now,
          formatted: "",
          success: false,
          error: "Could not parse base date",
        };
      }

      // Parse duration
      const duration = parseDuration(num * multiplier, unitPart.trim(), ctx);
      if (!duration) {
        return {
          type: "date",
          expression,
          result: now,
          formatted: "",
          success: false,
          error: "Unknown duration unit",
        };
      }

      const result = addDays(baseDate, duration.days);

      return {
        type: "date",
        expression,
        result,
        formatted: formatDate(result, locale.dateFormat),
        success: true,
        durationDays: duration.days,
      };
    }

    // Try to parse as date difference (e.g., "25/12/2024 - today")
    const diffMatch = normalized.match(/(.+?)\s*-\s*(.+)/);
    if (diffMatch) {
      const [, leftPart, rightPart] = diffMatch;

      let leftDate = parseRelativeDate(leftPart.trim(), ctx);
      if (!leftDate) leftDate = parseDateString(leftPart.trim(), ctx);

      let rightDate = parseRelativeDate(rightPart.trim(), ctx);
      if (!rightDate) rightDate = parseDateString(rightPart.trim(), ctx);

      if (leftDate && rightDate) {
        const days = diffInDays(leftDate, rightDate);

        return {
          type: "date",
          expression,
          result: leftDate,
          formatted: `${Math.abs(days)} ${days === 1 || days === -1 ? "day" : "days"}`,
          success: true,
          durationDays: days,
        };
      }
    }

    return {
      type: "date",
      expression,
      result: now,
      formatted: "",
      success: false,
      error: "Could not parse date expression",
    };
  } catch (error) {
    return {
      type: "date",
      expression,
      result: now,
      formatted: "",
      success: false,
      error: error instanceof Error ? error.message : "Date parsing error",
    };
  }
}
