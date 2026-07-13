/**
 * Calculator Evaluator
 *
 * Safe mathematical expression evaluator.
 * Supports: +, -, *, /, ^, %, parentheses, and common functions.
 */

import type { CalculatorLocaleConfig, MathResult } from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Factorial implementation */
function factorial(n: number): number {
  if (n < 0) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity; // Overflow protection
  if (!Number.isInteger(n)) return NaN;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/** Greatest Common Divisor (Euclidean algorithm) */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.floor(a));
  b = Math.abs(Math.floor(b));
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/** Least Common Multiple */
function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.floor(a) * Math.floor(b)) / gcd(a, b);
}

/** Permutations: nPr = n! / (n-r)! */
function permutations(n: number, r: number): number {
  if (r > n || r < 0 || n < 0) return NaN;
  if (!Number.isInteger(n) || !Number.isInteger(r)) return NaN;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result *= n - i;
  }
  return result;
}

/** Combinations: nCr = n! / (r! * (n-r)!) */
function combinations(n: number, r: number): number {
  if (r > n || r < 0 || n < 0) return NaN;
  if (!Number.isInteger(n) || !Number.isInteger(r)) return NaN;
  // Optimize by using smaller r
  if (r > n - r) r = n - r;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** Single-argument math functions */
const MATH_FUNCTIONS: Record<string, (x: number) => number> = {
  // Basic
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  // Rounding
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  // Trigonometry
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  // Inverse trigonometry
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  // Hyperbolic
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  // Logarithms
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  ln: Math.log,
  // Exponential
  exp: Math.exp,
  // Factorial
  fact: factorial,
  factorial: factorial,
};

/** Two-argument math functions */
const MATH_FUNCTIONS_2: Record<string, (a: number, b: number) => number> = {
  // Number theory
  gcd: gcd,
  pgcd: gcd, // French: Plus Grand Commun Diviseur
  lcm: lcm,
  ppcm: lcm, // French: Plus Petit Commun Multiple
  // Combinatorics
  perm: permutations,
  npr: permutations,
  comb: combinations,
  ncr: combinations,
  // Power/root
  pow: Math.pow,
  root: (n, x) => Math.pow(x, 1 / n), // nth root: root(3, 8) = ∛8 = 2
  // Min/max
  min: Math.min,
  max: Math.max,
};

/** Allowed constants */
const CONSTANTS: Record<string, number> = {
  // Circle constants
  pi: Math.PI,
  π: Math.PI,
  tau: Math.PI * 2,
  τ: Math.PI * 2,
  // Euler's number
  e: Math.E,
  // Golden ratio
  phi: (1 + Math.sqrt(5)) / 2,
  φ: (1 + Math.sqrt(5)) / 2,
  // Common roots
  sqrt2: Math.SQRT2,
  sqrt3: Math.sqrt(3),
};

// =============================================================================
// NATURAL LANGUAGE PATTERN BUILDERS
// =============================================================================

/** Number pattern for regex */
const NUM_PATTERN = "\\d+(?:[.,]\\d+)?";
/** Parenthesized expression pattern */
const PAREN_PATTERN = "\\([^)]+\\)";
/** Combined number/expression pattern */
const EXPR_PATTERN = `(?:${NUM_PATTERN}|${PAREN_PATTERN})`;
/** Expression with pi/π support for trig functions */
const EXPR_WITH_PI = `(?:${NUM_PATTERN}|${PAREN_PATTERN}|pi|π)`;

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex pattern from locale keywords
 * Handles multiple keywords with OR, allowing optional spaces
 */
function buildKeywordPattern(keywords: string[]): string {
  return keywords.map((kw) => escapeRegex(kw).replace(/\s+/g, "\\s+")).join("|");
}

interface NaturalLanguagePattern {
  pattern: RegExp;
  replacement: string;
}

/**
 * Build natural language patterns from locale configuration
 */
function buildNaturalLanguagePatterns(
  locale: CalculatorLocaleConfig
): NaturalLanguagePattern[] {
  const patterns: NaturalLanguagePattern[] = [];
  const nl = locale.naturalLanguage;

  if (!nl) return patterns;

  // Square root: "racine carrée de X" → sqrt(X)
  if (nl.squareRoot?.length) {
    const keywords = buildKeywordPattern(nl.squareRoot);
    patterns.push({
      pattern: new RegExp(`(?:${keywords})\\s*(${EXPR_PATTERN})`, "gi"),
      replacement: "sqrt($1)",
    });
  }

  // Square postfix: "X au carré" → (X)^2
  if (nl.square?.length) {
    const postfixKeywords = nl.square.filter(
      (kw) => kw.startsWith("au ") || kw.endsWith("ed") || kw.endsWith("é") || kw.endsWith("e")
    );
    const prefixKeywords = nl.square.filter(
      (kw) => kw.includes(" de") || kw.includes(" of") || kw.endsWith("de") || kw.endsWith("of")
    );

    // Postfix pattern: "5 squared", "5 au carré"
    if (postfixKeywords.length) {
      const keywords = buildKeywordPattern(postfixKeywords);
      patterns.push({
        pattern: new RegExp(`(${EXPR_PATTERN})\\s*(?:${keywords})`, "gi"),
        replacement: "($1)^2",
      });
    }

    // Prefix pattern: "square of 5", "carré de 5"
    if (prefixKeywords.length) {
      const keywords = buildKeywordPattern(prefixKeywords);
      patterns.push({
        pattern: new RegExp(`(?:${keywords})\\s*(${EXPR_PATTERN})`, "gi"),
        replacement: "($1)^2",
      });
    }
  }

  // Cube postfix/prefix: "X au cube", "cube de X" → (X)^3
  if (nl.cube?.length) {
    const postfixKeywords = nl.cube.filter(
      (kw) => kw.startsWith("au ") || kw.endsWith("ed") || kw.endsWith("d")
    );
    const prefixKeywords = nl.cube.filter(
      (kw) => kw.includes(" de") || kw.includes(" of") || kw.endsWith("de") || kw.endsWith("of")
    );

    if (postfixKeywords.length) {
      const keywords = buildKeywordPattern(postfixKeywords);
      patterns.push({
        pattern: new RegExp(`(${EXPR_PATTERN})\\s*(?:${keywords})`, "gi"),
        replacement: "($1)^3",
      });
    }

    if (prefixKeywords.length) {
      const keywords = buildKeywordPattern(prefixKeywords);
      patterns.push({
        pattern: new RegExp(`(?:${keywords})\\s*(${EXPR_PATTERN})`, "gi"),
        replacement: "($1)^3",
      });
    }
  }

  // Power: "X puissance Y", "X to the power of Y" → (X)^(Y)
  if (nl.power?.length) {
    const keywords = buildKeywordPattern(nl.power);
    patterns.push({
      pattern: new RegExp(`(${EXPR_PATTERN})\\s*(?:${keywords})\\s*(${EXPR_PATTERN})`, "gi"),
      replacement: "($1)^($2)",
    });
  }

  // Cosine: "cosinus de X" → cos(X)
  if (nl.cosine?.length) {
    const keywords = buildKeywordPattern(nl.cosine);
    patterns.push({
      pattern: new RegExp(`(?:${keywords})\\s*(${EXPR_WITH_PI})`, "gi"),
      replacement: "cos($1)",
    });
  }

  // Sine: "sinus de X" → sin(X)
  if (nl.sine?.length) {
    const keywords = buildKeywordPattern(nl.sine);
    patterns.push({
      pattern: new RegExp(`(?:${keywords})\\s*(${EXPR_WITH_PI})`, "gi"),
      replacement: "sin($1)",
    });
  }

  // Tangent: "tangente de X" → tan(X)
  if (nl.tangent?.length) {
    const keywords = buildKeywordPattern(nl.tangent);
    patterns.push({
      pattern: new RegExp(`(?:${keywords})\\s*(${EXPR_WITH_PI})`, "gi"),
      replacement: "tan($1)",
    });
  }

  // Logarithm: "logarithme de X" → log(X)
  if (nl.logarithm?.length) {
    const keywords = buildKeywordPattern(nl.logarithm);
    patterns.push({
      pattern: new RegExp(`(?:${keywords})\\s*(${EXPR_PATTERN})`, "gi"),
      replacement: "log($1)",
    });
  }

  // Absolute value: "valeur absolue de X" → abs(X)
  if (nl.absoluteValue?.length) {
    const keywords = buildKeywordPattern(nl.absoluteValue);
    patterns.push({
      pattern: new RegExp(`(?:${keywords})\\s*(-?${EXPR_PATTERN})`, "gi"),
      replacement: "abs($1)",
    });
  }

  return patterns;
}

/** Cache for compiled patterns */
const patternCache = new WeakMap<CalculatorLocaleConfig, NaturalLanguagePattern[]>();

/**
 * Get patterns for a locale (cached)
 */
function getNaturalLanguagePatterns(locale: CalculatorLocaleConfig): NaturalLanguagePattern[] {
  let patterns = patternCache.get(locale);
  if (!patterns) {
    patterns = buildNaturalLanguagePatterns(locale);
    patternCache.set(locale, patterns);
  }
  return patterns;
}

/**
 * Convert natural language math expressions to standard notation
 */
function normalizeNaturalLanguage(
  expression: string,
  locale: CalculatorLocaleConfig
): string {
  let normalized = expression;
  const patterns = getNaturalLanguagePatterns(locale);

  for (const { pattern, replacement } of patterns) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

/**
 * Check if expression contains natural language math patterns
 */
export function hasNaturalLanguageMath(
  expression: string,
  locale: CalculatorLocaleConfig
): boolean {
  const nl = locale.naturalLanguage;
  if (!nl) return false;

  const lower = expression.toLowerCase();

  // Collect all keywords from all categories
  const allKeywords = [
    ...(nl.squareRoot ?? []),
    ...(nl.square ?? []),
    ...(nl.cube ?? []),
    ...(nl.power ?? []),
    ...(nl.cosine ?? []),
    ...(nl.sine ?? []),
    ...(nl.tangent ?? []),
    ...(nl.logarithm ?? []),
    ...(nl.absoluteValue ?? []),
  ];

  // Check if any keyword is present in the expression
  return allKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// =============================================================================
// TOKENIZER
// =============================================================================

interface Token {
  type: "number" | "operator" | "paren" | "function" | "function2" | "constant" | "comma";
  value: string | number;
}

function tokenize(expression: string, locale: CalculatorLocaleConfig): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  // Normalize expression
  let expr = expression
    .toLowerCase()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\*\*/g, "^");

  // Replace multipliers (e.g., 10k → 10*1000)
  for (const [suffix, multiplier] of Object.entries(locale.multipliers)) {
    // Match number followed by suffix (case insensitive)
    const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${suffix}(?![a-z])`, "gi");
    expr = expr.replace(regex, `($1*${multiplier})`);
  }

  while (i < expr.length) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Numbers (including decimals)
    if (/[\d.]/.test(char)) {
      let num = "";
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    // Parentheses
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      i++;
      continue;
    }

    // Comma (function argument separator)
    if (char === "," || char === ";") {
      tokens.push({ type: "comma", value: "," });
      i++;
      continue;
    }

    // Operators
    if (/[+\-*/^%]/.test(char)) {
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    // Functions and constants (alphabetic)
    if (/[a-zπφτ]/i.test(char)) {
      let name = "";
      while (i < expr.length && /[a-zπφτ\d]/i.test(expr[i])) {
        name += expr[i];
        i++;
      }

      if (MATH_FUNCTIONS_2[name]) {
        tokens.push({ type: "function2", value: name });
      } else if (MATH_FUNCTIONS[name]) {
        tokens.push({ type: "function", value: name });
      } else if (CONSTANTS[name] !== undefined) {
        tokens.push({ type: "constant", value: name });
      } else {
        // Unknown identifier, skip
        continue;
      }
      continue;
    }

    // Unknown character, skip
    i++;
  }

  return tokens;
}

// =============================================================================
// PARSER (Shunting-Yard Algorithm)
// =============================================================================

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  "^": 3,
};

const RIGHT_ASSOCIATIVE = new Set(["^"]);

function toPostfix(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const operators: Token[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "number":
      case "constant":
        output.push(token);
        break;

      case "function":
      case "function2":
        operators.push(token);
        break;

      case "comma":
        // Pop operators until we hit a left paren (for function args)
        while (
          operators.length > 0 &&
          operators[operators.length - 1].value !== "("
        ) {
          output.push(operators.pop()!);
        }
        break;

      case "operator": {
        const op = token.value as string;
        while (operators.length > 0) {
          const top = operators[operators.length - 1];
          if (
            top.type === "operator" &&
            ((PRECEDENCE[top.value as string] > PRECEDENCE[op]) ||
              (PRECEDENCE[top.value as string] === PRECEDENCE[op] &&
                !RIGHT_ASSOCIATIVE.has(op)))
          ) {
            output.push(operators.pop()!);
          } else {
            break;
          }
        }
        operators.push(token);
        break;
      }

      case "paren":
        if (token.value === "(") {
          operators.push(token);
        } else {
          while (
            operators.length > 0 &&
            operators[operators.length - 1].value !== "("
          ) {
            output.push(operators.pop()!);
          }
          operators.pop(); // Remove "("
          // Check for function (1 or 2 args)
          if (
            operators.length > 0 &&
            (operators[operators.length - 1].type === "function" ||
             operators[operators.length - 1].type === "function2")
          ) {
            output.push(operators.pop()!);
          }
        }
        break;
    }
  }

  while (operators.length > 0) {
    output.push(operators.pop()!);
  }

  return output;
}

// =============================================================================
// EVALUATOR
// =============================================================================

function evaluatePostfix(postfix: Token[]): number {
  const stack: number[] = [];

  for (const token of postfix) {
    switch (token.type) {
      case "number":
        stack.push(token.value as number);
        break;

      case "constant":
        stack.push(CONSTANTS[token.value as string]);
        break;

      case "operator": {
        const b = stack.pop()!;
        const a = stack.pop()!;
        switch (token.value) {
          case "+":
            stack.push(a + b);
            break;
          case "-":
            stack.push(a - b);
            break;
          case "*":
            stack.push(a * b);
            break;
          case "/":
            stack.push(a / b);
            break;
          case "%":
            stack.push(a % b);
            break;
          case "^":
            stack.push(Math.pow(a, b));
            break;
        }
        break;
      }

      case "function": {
        const arg = stack.pop()!;
        const fn = MATH_FUNCTIONS[token.value as string];
        stack.push(fn(arg));
        break;
      }

      case "function2": {
        const b = stack.pop()!;
        const a = stack.pop()!;
        const fn = MATH_FUNCTIONS_2[token.value as string];
        stack.push(fn(a, b));
        break;
      }
    }
  }

  return stack[0];
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if expression looks like a math expression
 * @param expression The expression to check
 * @param locale Optional locale config for natural language detection
 */
export function isMathExpression(
  expression: string,
  locale?: CalculatorLocaleConfig
): boolean {
  // Must contain at least one digit and one operator (or a function call)
  const hasNumber = /\d/.test(expression);
  const hasOperator = /[+\-*/^%!]/.test(expression) || /\d\s*[kMGmd]\b/i.test(expression);
  const hasFunctionCall = /\b[a-z][a-z0-9]*\s*\(/i.test(expression);

  // Check for natural language math expressions using locale
  const hasNaturalLanguage = locale
    ? hasNaturalLanguageMath(expression, locale)
    : false;

  return hasNumber && (hasOperator || hasFunctionCall || /^[\d.]+$/.test(expression.trim()) || hasNaturalLanguage);
}

/**
 * Evaluate a mathematical expression
 */
export function evaluateMath(
  expression: string,
  locale: CalculatorLocaleConfig
): MathResult {
  try {
    // First, convert natural language to standard notation
    let normalized = normalizeNaturalLanguage(expression, locale);

    // Handle factorial notation: 5! → factorial(5), (2+3)! → factorial(2+3)
    // First handle parenthesized expressions: (...)!
    normalized = normalized.replace(/\(([^)]+)\)!/g, "factorial($1)");
    // Then handle simple numbers: 5!, 10!
    normalized = normalized.replace(/(\d+)!/g, "factorial($1)");

    // Handle implicit multiplication: 2(3) → 2*(3), (2)(3) → (2)*(3)
    // Negative lookbehind keeps digit-suffixed functions intact (log10, log2)
    normalized = normalized
      .replace(/(?<![a-zπφτ0-9])(\d+(?:\.\d+)?)\s*\(/g, "$1*(")
      .replace(/\)\s*\(/g, ")*(")
      .replace(/\)\s*(\d)/g, ")*$1");

    const tokens = tokenize(normalized, locale);

    if (tokens.length === 0) {
      return {
        type: "math",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: "Empty expression",
      };
    }

    const postfix = toPostfix(tokens);
    const result = evaluatePostfix(postfix);

    if (!isFinite(result)) {
      return {
        type: "math",
        expression,
        result: 0,
        formatted: "",
        success: false,
        error: "Invalid result",
      };
    }

    return {
      type: "math",
      expression,
      result,
      formatted: formatNumber(result, locale),
      success: true,
    };
  } catch (error) {
    return {
      type: "math",
      expression,
      result: 0,
      formatted: "",
      success: false,
      error: error instanceof Error ? error.message : "Evaluation error",
    };
  }
}

/**
 * Format a number for display
 */
export function formatNumber(
  value: number,
  locale: CalculatorLocaleConfig
): string {
  // Round to avoid floating point issues
  const rounded = Math.round(value * 1e10) / 1e10;

  // Format with appropriate precision
  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString();
  }

  // Limit decimal places
  const decimalPlaces = Math.min(10, String(rounded).split(".")[1]?.length ?? 0);
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  });
}
