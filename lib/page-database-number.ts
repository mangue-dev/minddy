/**
 * What a number cell accepts and how it reads back (MIN-990).
 *
 * A number cell takes a figure the way people write one ("1 234,50 €",
 * "25 %") or, in its editor, a calculation ("14 + 2", "(120 - 20) * 1,2",
 * "80 + 20 %"), and stores the result as a plain number. The column's format only decides how
 * that number is shown. Pure: the table, the API and the agent tools share it.
 */

export const DATABASE_NUMBER_FORMATS = ["number", "percent", "currency"] as const;
export type DatabaseNumberFormat = (typeof DATABASE_NUMBER_FORMATS)[number];

/** The currencies a column can be set to, in the order the picker lists them. */
export const DATABASE_CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "CAD", "AUD", "JPY", "CNY", "BRL", "MXN",
  "SEK", "NOK", "DKK", "PLN", "INR",
] as const;
export type DatabaseCurrency = (typeof DATABASE_CURRENCIES)[number];

export function isDatabaseCurrency(value: unknown): value is DatabaseCurrency {
  return typeof value === "string" && (DATABASE_CURRENCIES as readonly string[]).includes(value);
}

/** Spaces people type or paste inside a figure: plain, no-break and thin ones. */
const SPACES = /[\s   ]/g;
/** Currency signs are units, not part of the calculation. */
const CURRENCY_SIGNS = /[€$£¥₹]/g;
const DRAFT = /^[0-9.,+\-*/^()%×÷−\s   €$£¥₹]*$/;

/** A currency written by its ISO code: "12 CHF", "eur 40". */
const CURRENCY_CODES = new RegExp(`(?<![A-Za-z])(?:${DATABASE_CURRENCIES.join("|")})(?![A-Za-z])`, "gi");
const SIGN_CURRENCIES: Record<string, DatabaseCurrency> = {
  "€": "EUR", "$": "USD", "£": "GBP", "¥": "JPY", "₹": "INR",
};

/**
 * Whether the text can still become a number: digits, separators, operators,
 * units, and the letters of a currency code (checked when the cell is saved).
 */
export function isDatabaseNumberDraft(value: string): boolean {
  return DRAFT.test(value.replace(/[A-Za-z]/g, ""));
}

/**
 * The format a typed value asks for (MIN-990): a currency when it carries a
 * currency sign or code, a percentage when it is one figure followed by "%".
 * Null for a plain figure or a calculation, which leave the column as it is.
 */
export function detectDatabaseNumberFormat(
  value: string,
): { number_format: "percent" } | { number_format: "currency"; currency: DatabaseCurrency } | null {
  const sign = /[€$£¥₹]/.exec(value)?.[0];
  if (sign) return { number_format: "currency", currency: SIGN_CURRENCIES[sign] };
  const code = value.match(CURRENCY_CODES)?.[0];
  if (code) return { number_format: "currency", currency: code.toUpperCase() as DatabaseCurrency };
  return /^[+\-−]?[0-9.,]+%$/.test(value.replace(SPACES, "")) ? { number_format: "percent" } : null;
}

/**
 * A written figure as a number. A single separator is the decimal mark
 * ("1,5", "1.5"); with both, the last one is ("1,234.5", "1.234,5"); a
 * separator written several times groups thousands ("1,234,567").
 */
function readFigure(token: string): number | undefined {
  const commas = token.split(",").length - 1;
  const dots = token.split(".").length - 1;
  /** Thousands are groups of three digits: "1,234,567", never "1..2". */
  const grouped = (integer: string, separator: string) =>
    integer.split(separator).every((group, index) =>
      index === 0 ? /^\d{1,3}$/.test(group) : /^\d{3}$/.test(group));
  let normalized: string;
  if (commas && dots) {
    const decimal = token.lastIndexOf(",") > token.lastIndexOf(".") ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    const [integer, fraction, ...rest] = token.split(decimal);
    if (rest.length || !grouped(integer, grouping)) return undefined;
    normalized = `${integer.split(grouping).join("")}.${fraction}`;
  } else if (commas > 1 || dots > 1) {
    const grouping = commas ? "," : ".";
    if (!grouped(token, grouping)) return undefined;
    normalized = token.split(grouping).join("");
  } else {
    normalized = token.replace(",", ".");
  }
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

/** A parsed operand: its value, and the bare figure when it was written "x %". */
type Operand = { value: number; percent?: number };

class Parser {
  private index = 0;
  constructor(private readonly text: string) {}

  parse(): number | undefined {
    const result = this.sum();
    if (!result || this.index < this.text.length) return undefined;
    // A lone "25 %" is a figure with its unit, not a quarter.
    return result.percent ?? result.value;
  }

  private peek(): string {
    return this.text[this.index] ?? "";
  }

  private sum(): Operand | undefined {
    let left = this.product();
    while (left && (this.peek() === "+" || this.peek() === "-")) {
      const sign = this.peek() === "+" ? 1 : -1;
      this.index += 1;
      const right = this.product();
      if (!right) return undefined;
      // "80 + 20 %" adds twenty percent of eighty, as a calculator does.
      const amount = right.percent === undefined ? right.value : (left.value * right.percent) / 100;
      left = { value: left.value + sign * amount };
    }
    return left;
  }

  private product(): Operand | undefined {
    let left = this.power();
    while (left && (this.peek() === "*" || this.peek() === "/")) {
      const divide = this.peek() === "/";
      this.index += 1;
      const right = this.power();
      if (!right) return undefined;
      left = { value: divide ? left.value / right.value : left.value * right.value };
    }
    return left;
  }

  private power(): Operand | undefined {
    const base = this.signed();
    if (!base || this.peek() !== "^") return base;
    this.index += 1;
    // Right-associative: 2 ^ 3 ^ 2 is 2 ^ 9.
    const exponent = this.power();
    return exponent ? { value: base.value ** exponent.value } : undefined;
  }

  private signed(): Operand | undefined {
    if (this.peek() === "+" || this.peek() === "-") {
      const sign = this.peek() === "+" ? 1 : -1;
      this.index += 1;
      const operand = this.signed();
      if (!operand) return undefined;
      return {
        value: sign * operand.value,
        ...(operand.percent !== undefined && { percent: sign * operand.percent }),
      };
    }
    return this.percent();
  }

  private percent(): Operand | undefined {
    let operand = this.primary();
    while (operand && this.peek() === "%") {
      this.index += 1;
      operand = { value: operand.value / 100, percent: operand.value };
    }
    return operand;
  }

  private primary(): Operand | undefined {
    if (this.peek() === "(") {
      this.index += 1;
      const inner = this.sum();
      if (!inner || this.peek() !== ")") return undefined;
      this.index += 1;
      return { value: inner.value };
    }
    const match = /^[0-9.,]+/.exec(this.text.slice(this.index));
    if (!match) return undefined;
    // A trailing separator belongs to what follows: "(1,5)" closes after 5.
    const token = match[0];
    const value = readFigure(token);
    if (value === undefined) return undefined;
    this.index += token.length;
    return { value };
  }
}

/**
 * The number a cell editor's text stands for, a calculation included: null
 * when empty, undefined when it is neither a figure nor a calculation (or
 * divides by zero).
 */
export function evaluateDatabaseNumber(value: string): number | null | undefined {
  const text = value
    .replace(CURRENCY_CODES, "")
    .replace(SPACES, "")
    .replace(CURRENCY_SIGNS, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-");
  if (!DRAFT.test(text)) return undefined;
  if (!text) return value.trim() ? undefined : null;
  const result = new Parser(text).parse();
  if (result === undefined || !Number.isFinite(result)) return undefined;
  // Binary floats leak into sums: 0.1 + 0.2 reads 0.3.
  const rounded = Number(result.toPrecision(15));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * One written figure as a number ("12,5", "1 234,50 €", "25 %"), never a
 * calculation: what an import, a filter value or an agent's row holds. A date
 * such as "2026-01-05" is not a subtraction there.
 */
export function parseDatabaseNumber(value: string): number | null | undefined {
  return isDatabaseNumberExpression(value) ? undefined : evaluateDatabaseNumber(value);
}

/** Whether the text holds a calculation rather than one figure. */
export function isDatabaseNumberExpression(value: string): boolean {
  const figure = value.replace(CURRENCY_CODES, "").replace(SPACES, "")
    .replace(CURRENCY_SIGNS, "").replace(/^[+\-−]/, "");
  return /[+\-*/^()×÷−]/.test(figure);
}

/**
 * A stored number as its column shows it, in the reader's locale. A plain
 * column groups thousands only from five digits on (a year must not read
 * "2 026").
 */
export function formatDatabaseNumber(
  value: number,
  column: { number_format?: DatabaseNumberFormat; currency?: string } | undefined,
  locale: string,
): string {
  try {
    if (column?.number_format === "percent") {
      return new Intl.NumberFormat(locale, {
        style: "unit", unit: "percent", maximumFractionDigits: 10,
      }).format(value);
    }
    if (column?.number_format === "currency" && isDatabaseCurrency(column.currency)) {
      return new Intl.NumberFormat(locale, {
        style: "currency", currency: column.currency,
      }).format(value);
    }
  } catch {
    // An unknown locale falls back to the plain figure.
  }
  try {
    // A plain figure keeps its digits; thousands are grouped from five digits
    // on, so a year still reads "2026".
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 20, useGrouping: Math.abs(value) >= 10_000,
    }).format(value);
  } catch {
    return String(value);
  }
}
